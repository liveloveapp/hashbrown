import type { Map as LeafletMap, Marker } from 'leaflet';
import { prefersReducedMotion } from '../dom';
import type { LatLon } from '../places';
import type { AtcState } from '../store';
import type { MapBand } from './card-sync';
import { exactContainerPoint, type PixelRect } from './pixels';
import { altText, planeElementOf } from './plane-marker';
import {
  layoutTags,
  type TagItem,
  type TagObstacle,
  tagOrder,
  type TagPlacement,
} from './tag-layout';
import { createTextMeasure } from './tag-measure';

/** How often tags are laid out again while planes move, in ms. */
const TAG_LAYOUT_MS = 500;
/** How long a tag fades out before it changes sides, in ms (`--atc-fast`). */
const FADE_MS = 150;
/** Planes this far outside the bounds still count as obstacles, in pixels. */
const OBSTACLE_MARGIN = 40;

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
  measureControls(): void;
  destroy(): void;
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
  band: () => MapBand;
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
  let blocked: PixelRect[] = [];
  let lastLayoutAt = -Infinity;
  let lastFocus = '';

  const planeOf = (hex: string) => planeElementOf(markers, hex);
  const pointOf = (hex: string) => {
    const position = drawnAt(hex);

    return position ? exactContainerPoint(map, position) : null;
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
    // Lifts the marker above untagged ones (styles/markers.css), so a tag
    // over an untagged plane's icon is drawn on top of it.
    if (plane.classList.contains('is-tagged') !== (next !== 'hidden')) {
      plane.classList.toggle('is-tagged', next !== 'hidden');
    }
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
    lastFocus = `${hovered} ${detailed}`;
    const order = tagOrder(state, { hovered, detailed });
    // Planes no tag may cover: tagged, highlighted, selected or followed, or
    // described by the card.
    const hard = new Set([
      ...order,
      ...state.highlighted,
      ...[state.selectedHex, state.followingHex, detailed].filter(
        (hex): hex is string => hex !== null,
      ),
    ]);
    const items: TagItem[] = [];
    for (const hex of order) {
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
        planes.push({ hex, x: point.x, y: point.y, hard: hard.has(hex) });
      }
    }
    const placements = layoutTags({ items, planes, bounds, blocked });
    for (const hex of laidOut) {
      const plane = planeOf(hex);
      if (!placements.has(hex) && plane) {
        clearTimeout(fading.get(hex)?.timer);
        fading.delete(hex);
        plane.classList.remove('is-tag-fading', 'is-tagged');
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

  /** Measures the map's controls, which tags keep clear of. */
  const measureControls = () => {
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
  };
  // A control that changes size (the Layers panel opening, a long
  // attribution wrapping) is measured again; its corner resizes with it.
  const controls =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          measureControls();
          layout();
        })
      : null;
  for (const corner of element.querySelectorAll(
    '.leaflet-control-container > div',
  )) {
    controls?.observe(corner);
  }

  return {
    layout,
    frame(time) {
      const { hovered, detailed } = focus();
      const key = `${hovered} ${detailed}`;
      if (key !== lastFocus || time - lastLayoutAt >= TAG_LAYOUT_MS) {
        layout();
      }
    },
    measureControls,
    destroy() {
      controls?.disconnect();
      for (const { timer } of fading.values()) {
        clearTimeout(timer);
      }
      text.destroy();
    },
  };
}
