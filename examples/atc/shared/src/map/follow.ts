import type * as Leaflet from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { prefersReducedMotion } from '../dom';
import type { LatLon } from '../places';
import type { AtcStore } from '../store';
import {
  createFollowPill,
  followPillView,
  type FollowResume,
  RESUME_MS,
} from './follow-pill';
import { exactLayerPoint } from './motion-loop';

/** A point in map container pixels. */
export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * How far to pan, in whole pixels, to put a followed plane drawn at `point`
 * back in the map's `centre`, or null when it is less than 1 px away. Leaflet
 * pans by whole pixels, so smaller offsets would be dropped.
 */
export function followPanOffset(
  point: PixelPoint,
  centre: PixelPoint,
): PixelPoint | null {
  const x = point.x - centre.x;
  const y = point.y - centre.y;

  return Math.hypot(x, y) < 1
    ? null
    : { x: Math.round(x) || 0, y: Math.round(y) || 0 };
}

/** How long the followed plane takes to move to a new band middle, in ms. */
export const CENTRE_EASE_MS = 200;

/** A band middle easing from `from` to `to` since `at` (ms). */
interface CentreEase {
  readonly from: number;
  readonly to: number;
  readonly at: number;
}

/**
 * Where an easing band middle is at `now`: an ease-out over
 * {@link CENTRE_EASE_MS}.
 */
function easedCentre(ease: CentreEase, now: number): number {
  const t = Math.min(1, Math.max(0, (now - ease.at) / CENTRE_EASE_MS));

  return ease.from + (ease.to - ease.from) * (1 - (1 - t) ** 3);
}

/** Follow mode on the map: keeping the plane centred, and the pill. */
export interface FollowController {
  /**
   * Pans so the followed plane is back in the centre of the visible band
   * (between a docked card and a phone's sheet), unless it already is
   * (within 1 px) or a zoom or an animated pan is still running. Under
   * reduced motion it never animates. When the band changes (a card docks,
   * grows or closes), its middle eases there over {@link CENTRE_EASE_MS}
   * instead of jumping, at once under reduced motion.
   */
  panToFollowed(animate: boolean): void;
  /** Shows the pill for the current state. */
  syncPill(): void;
  /** A user drag: stops following and offers the plane back for a few seconds. */
  release(): void;
  destroy(): void;
}

/**
 * Creates the follow controller and appends its pill to `element`. The pill
 * names the followed plane with a Stop button; after a drag it offers
 * Resume until {@link RESUME_MS} have passed.
 */
export function createFollowController(options: {
  L: typeof Leaflet;
  map: LeafletMap;
  element: HTMLElement;
  store: AtcStore;
  /** Where a plane is drawn now, if it is. */
  drawnAt: (hex: string) => LatLon | null;
  isZooming: () => boolean;
  /** The strip of map left visible between a docked card and the sheet. */
  band: () => { top: number; bottom: number };
}): FollowController {
  const { map, element, store, drawnAt, isZooming, band } = options;
  let panning = false;
  /** The band middle the plane is held at, easing when the band changes. */
  let centre: CentreEase | null = null;
  /** A frame that keeps the ease going when no plane frame would. */
  let easeFrame: number | null = null;
  /** The band middle to hold the plane at `now`. */
  const centreY = (now: number): number => {
    const { top, bottom } = band();
    const target = (top + bottom) / 2;
    if (centre === null || prefersReducedMotion()) {
      centre = { from: target, to: target, at: now };
    } else if (target !== centre.to) {
      centre = { from: easedCentre(centre, now), to: target, at: now };
    }

    return easedCentre(centre, now);
  };
  /** A plane the user dragged away from, offered back for a few seconds. */
  let resume: FollowResume | null = null;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  const pill = createFollowPill(element.ownerDocument, (view) => {
    resume = null;
    store.follow(view.action === 'resume' ? view.hex : null);
  });
  element.append(pill.element);
  options.L.DomEvent.disableClickPropagation(pill.element);
  const syncPill = () =>
    pill.show(followPillView(store.getState(), resume, performance.now()));

  const panToFollowed = (wanted: boolean) => {
    // Read per pan, like the view controller's moves.
    const animate = wanted && !prefersReducedMotion();
    const { followingHex } = store.getState();
    if (followingHex === null) {
      centre = null;
    }
    const position = followingHex === null ? null : drawnAt(followingHex);
    if (!position || isZooming() || panning) {
      return;
    }
    const now = performance.now();
    const y = centreY(now);
    if (centre !== null && now - centre.at < CENTRE_EASE_MS) {
      easeFrame ??= requestAnimationFrame(() => {
        easeFrame = null;
        panToFollowed(false);
      });
    }
    const offset = followPanOffset(
      map.layerPointToContainerPoint(exactLayerPoint(map, position)),
      { x: map.getSize().x / 2, y },
    );
    if (offset === null) {
      return;
    }
    if (animate) {
      panning = true;
      map.once('moveend', () => (panning = false));
    }
    map.panBy([offset.x, offset.y], { animate });
  };

  return {
    panToFollowed,
    syncPill,
    release() {
      const { followingHex } = store.getState();
      if (followingHex !== null) {
        resume = { hex: followingHex, until: performance.now() + RESUME_MS };
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(syncPill, RESUME_MS);
      }
      store.follow(null);
    },
    destroy() {
      clearTimeout(resumeTimer);
      if (easeFrame !== null) {
        cancelAnimationFrame(easeFrame);
      }
      pill.element.remove();
    },
  };
}
