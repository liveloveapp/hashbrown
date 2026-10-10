import type * as Leaflet from 'leaflet';
import type { LatLng, Map as LeafletMap } from 'leaflet';
import type { AtcStore } from '../store';
import {
  createFollowPill,
  followPillView,
  type FollowResume,
  RESUME_MS,
} from './follow-pill';

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

/** Follow mode on the map: keeping the plane centred, and the pill. */
export interface FollowController {
  /**
   * Pans so the followed plane is back in the centre, unless it already is
   * (within 1 px) or a zoom or an animated pan is still running.
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
  /** Where a plane's marker is drawn, if it has one. */
  positionOf: (hex: string) => LatLng | undefined;
  isZooming: () => boolean;
}): FollowController {
  const { map, element, store, positionOf, isZooming } = options;
  let panning = false;
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

  return {
    panToFollowed(animate) {
      const { followingHex } = store.getState();
      const position =
        followingHex === null ? undefined : positionOf(followingHex);
      if (!position || isZooming() || panning) {
        return;
      }
      const offset = followPanOffset(
        map.latLngToContainerPoint(position),
        map.getSize().divideBy(2),
      );
      if (offset === null) {
        return;
      }
      if (animate) {
        panning = true;
        map.once('moveend', () => (panning = false));
      }
      map.panBy([offset.x, offset.y], { animate });
    },
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
      pill.element.remove();
    },
  };
}
