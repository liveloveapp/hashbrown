import type { Map as LeafletMap, Marker } from 'leaflet';
import type { Aircraft } from '../aircraft';
import { prefersReducedMotion } from '../dom';
import type { LatLon } from '../places';
import type { AtcState } from '../store';
import { exactLayerPoint } from './motion-loop';
import {
  layoutTags,
  type TagItem,
  type TagObstacle,
  tagOrder,
  type TagPlacement,
  type TagRect,
} from './tag-layout';

/** How often tags are laid out again while planes move, in ms. */
export const TAG_LAYOUT_MS = 500;
/** How long a tag fades out before it changes sides, in ms (`--atc-fast`). */
const FADE_MS = 150;
/** The tag's horizontal padding and border, in pixels. */
const TAG_CHROME = 2 * 7 + 2;
/** The gap before the altitude (`.atc-plane-alt` margin), in pixels. */
const ALT_GAP = 4;
/** Planes this far outside the bounds still count as obstacles, in pixels. */
const OBSTACLE_MARGIN = 40;
/** Character advances used when text cannot be measured (tests). */
const FALLBACK_LABEL_ADVANCE = 7.5;
const FALLBACK_MONO_ADVANCE = 6.6;

/** Keeps the map's data tags from overlapping. */
export interface TagSync {
  /** Lays the tags out now. */
  layout(): void;
  /**
   * Runs on each animation frame: lays out again when the hovered or
   * described plane changed, or every {@link TAG_LAYOUT_MS} while planes move.
   */
  frame(time: number): void;
  /**
   * Re-measures the map's controls (zoom, Layers, attribution), which tags
   * keep clear of; on resize, never per frame.
   */
  measure(): void;
  destroy(): void;
}

/**
 * Measures tag text without layout reads: the label in the tag's sans font
 * and the altitude in the mono font, on a canvas, each label once. Without a
 * canvas (jsdom) it estimates from the character count.
 */
function createTextMeasure(element: HTMLElement) {
  const win = element.ownerDocument.defaultView;
  const context =
    win && typeof win.CanvasRenderingContext2D === 'function'
      ? element.ownerDocument.createElement('canvas').getContext('2d')
      : null;
  let fonts: { label: string; mono: string } | null = null;
  let monoAdvance: number | null = null;
  const labels = new Map<string, number>();
  const clear = () => {
    labels.clear();
    monoAdvance = null;
  };
  element.ownerDocument.fonts?.addEventListener?.('loadingdone', clear);
  const fontsOf = () => {
    if (fonts === null && win) {
      const style = win.getComputedStyle(element);
      fonts = {
        label: `600 11px ${style.getPropertyValue('--atc-font') || 'sans-serif'}`,
        mono: `400 11px ${style.getPropertyValue('--atc-mono') || 'monospace'}`,
      };
    }

    return fonts;
  };
  const measure = (text: string, font: 'label' | 'mono') => {
    const stack = fontsOf();
    if (context === null || stack === null) {
      return null;
    }
    context.font = stack[font];

    return context.measureText(text).width;
  };

  return {
    /** The tag's width for `label` and the altitude text `alt`. */
    width(label: string, alt: string): number {
      let labelWidth = labels.get(label);
      if (labelWidth === undefined) {
        labelWidth =
          measure(label, 'label') ?? label.length * FALLBACK_LABEL_ADVANCE;
        labels.set(label, labelWidth);
      }
      monoAdvance ??= measure('0', 'mono') ?? FALLBACK_MONO_ADVANCE;

      return Math.ceil(
        labelWidth +
          (alt === '' ? 0 : ALT_GAP + alt.length * monoAdvance) +
          TAG_CHROME,
      );
    },
    destroy() {
      element.ownerDocument.fonts?.removeEventListener?.('loadingdone', clear);
    },
  };
}

/** Formats feet as `toLocaleString('en-US')` does, without a new formatter each call. */
const FEET = new Intl.NumberFormat('en-US');

/** The altitude text a tag shows, as `planeTagText` writes it. */
function altText(aircraft: Aircraft): string {
  return aircraft.onGround
    ? 'GND'
    : aircraft.altitudeFt === null
      ? ''
      : FEET.format(aircraft.altitudeFt);
}

/**
 * Creates the tag layout for a map. Each visible tag (see `tagOrder`) gets a
 * side from {@link layoutTags}, written as `data-tag` on its `.atc-plane`;
 * the CSS positions the tag for it. A tag that changes sides fades out, moves
 * and fades back in (at once under reduced motion). Positions come from the
 * motion loop (`drawnAt`) and tag sizes from measured text, so a layout reads
 * no DOM geometry. Every plane on screen is an obstacle the tags avoid.
 */
export function createTagSync(options: {
  map: LeafletMap;
  element: HTMLElement;
  getState: () => AtcState;
  markers: ReadonlyMap<string, Marker>;
  isZooming: () => boolean;
  drawnAt: (hex: string) => LatLon | null;
  /** The hovered plane and the one the detail card describes. */
  focus: () => { hovered: string | null; detailed: string | null };
  /** The strip of map between a docked card and a phone's sheet. */
  band: () => { top: number; bottom: number };
}): TagSync {
  const { map, element, getState, markers, isZooming, drawnAt, focus, band } =
    options;
  const text = createTextMeasure(element);
  /** Pending side changes, waiting for the fade out. */
  const fading = new Map<
    string,
    { target: TagPlacement; timer: ReturnType<typeof setTimeout> }
  >();
  /** The planes laid out last time. */
  let laidOut = new Set<string>();
  let blocked: TagRect[] = [];
  let lastLayoutAt = -Infinity;
  let lastFocus = '';

  const planeOf = (hex: string) =>
    markers.get(hex)?.getElement()?.querySelector<HTMLElement>('.atc-plane') ??
    null;
  const pointOf = (hex: string) => {
    const position = drawnAt(hex);

    return position
      ? map.layerPointToContainerPoint(exactLayerPoint(map, position))
      : null;
  };
  const placementOf = (hex: string, plane: HTMLElement): TagPlacement =>
    fading.get(hex)?.target ??
    (plane.getAttribute('data-tag') as TagPlacement | null) ??
    'right';
  const write = (plane: HTMLElement, placement: TagPlacement) => {
    if (placement === 'right') {
      plane.removeAttribute('data-tag');
    } else {
      plane.setAttribute('data-tag', placement);
    }
  };
  /** Moves a tag, fading it out first when it was showing. */
  const apply = (hex: string, plane: HTMLElement, next: TagPlacement) => {
    const pending = fading.get(hex);
    if (pending) {
      pending.target = next;
      return;
    }
    const current = placementOf(hex, plane);
    if (current === next) {
      return;
    }
    if (!laidOut.has(hex) || current === 'hidden' || prefersReducedMotion()) {
      write(plane, next);
      return;
    }
    plane.classList.add('is-tag-fading');
    const entry = {
      target: next,
      timer: setTimeout(() => {
        fading.delete(hex);
        write(plane, entry.target);
        plane.classList.remove('is-tag-fading');
      }, FADE_MS),
    };
    fading.set(hex, entry);
  };

  const layout = () => {
    if (isZooming()) {
      return;
    }
    const state = getState();
    const size = map.getSize();
    const strip = band();
    const bounds = {
      left: 0,
      top: strip.top,
      right: size.x,
      bottom: strip.bottom,
    };
    const { hovered, detailed } = focus();
    const items: TagItem[] = [];
    for (const hex of tagOrder(state, { hovered, detailed })) {
      const aircraft = state.aircraft.get(hex);
      const plane = planeOf(hex);
      const point = pointOf(hex);
      if (aircraft && plane && point) {
        items.push({
          hex,
          x: point.x,
          y: point.y,
          width: text.width(aircraft.label, altText(aircraft)),
          previous: laidOut.has(hex) ? placementOf(hex, plane) : null,
          always: hex === hovered,
        });
      }
    }
    const planes: TagObstacle[] = [];
    for (const hex of markers.keys()) {
      const point = pointOf(hex);
      if (
        point &&
        point.x > -OBSTACLE_MARGIN &&
        point.y > -OBSTACLE_MARGIN &&
        point.x < size.x + OBSTACLE_MARGIN &&
        point.y < size.y + OBSTACLE_MARGIN
      ) {
        planes.push({ hex, x: point.x, y: point.y });
      }
    }
    const placements = layoutTags({ items, planes, bounds, blocked });
    for (const hex of laidOut) {
      const plane = planeOf(hex);
      if (!placements.has(hex) && plane) {
        clearTimeout(fading.get(hex)?.timer);
        fading.delete(hex);
        plane.classList.remove('is-tag-fading');
        write(plane, 'right');
      }
    }
    for (const [hex, placement] of placements) {
      const plane = planeOf(hex);
      if (plane) {
        apply(hex, plane, placement);
      }
    }
    laidOut = new Set(placements.keys());
    lastLayoutAt = performance.now();
  };

  return {
    layout,
    frame(time) {
      const { hovered, detailed } = focus();
      const key = `${hovered} ${detailed}`;
      if (key !== lastFocus || time - lastLayoutAt >= TAG_LAYOUT_MS) {
        lastFocus = key;
        layout();
      }
    },
    measure() {
      const box = element.getBoundingClientRect();
      blocked = [
        ...element.querySelectorAll(
          '.leaflet-control-container .leaflet-control',
        ),
      ].map((control) => {
        const rect = control.getBoundingClientRect();

        return {
          left: rect.left - box.left,
          top: rect.top - box.top,
          right: rect.right - box.left,
          bottom: rect.bottom - box.top,
        };
      });
    },
    destroy() {
      for (const { timer } of fading.values()) {
        clearTimeout(timer);
      }
      text.destroy();
    },
  };
}
