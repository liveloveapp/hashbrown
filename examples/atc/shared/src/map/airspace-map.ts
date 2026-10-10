import type { Circle, Map as LeafletMap, Marker } from 'leaflet';
import { isTyping, prefersReducedMotion } from '../dom';
import { AIRPORTS, type Area, type LatLon } from '../places';
import type { AtcState, AtcStore, ShownArea } from '../store';
import { createCardSync } from './card-sync';
import { createFollowController } from './follow';
import { createMotionLoop } from './motion-loop';
import { markerClassName, planeIconHtml, updatePlane } from './plane-marker';
import { TILE_LAYER } from './tiles';
import { createViewController } from './view-controller';

/** At this zoom and below, markers are drawn smaller. */
const LOW_ZOOM = 6;
/** Metres in a nautical mile, for Leaflet's circle radius. */
const METRES_PER_NM = 1852;

/** A mounted map. */
export interface AirspaceMapHandle {
  /** Stops syncing with the store and removes the map. */
  destroy(): void;
}

/**
 * Mounts a Leaflet map in `element` and keeps its markers in sync with the
 * store. Leaflet is imported lazily so server bundles never load it. The
 * work is split by concern:
 *
 * - `plane-marker.ts`: marker HTML, updated in place on every snapshot.
 * - `motion-loop.ts`: between snapshots each plane is dead-reckoned along its
 *   track, and a new fix eases away the gap and the turn; reduced motion
 *   jumps instead. One frame loop draws every plane at its exact sub-pixel
 *   position, so they all glide together instead of hopping a pixel at a time.
 * - `follow.ts`: a followed plane stays centred, and a pill names it with a
 *   Stop button; a drag ends follow mode and offers Resume for a few seconds.
 * - `card-sync.ts`: hovering or selecting a plane opens one detail card
 *   beside it. Escape (outside text fields) or a click on the empty map
 *   clears the selection. On phones the card stays above the bottom sheet.
 * - `view-controller.ts`: the map moves only for view requests in the store
 *   (see `requestArea`). The newest request wins; follow mode wins over all
 *   of them; a user drag or zoom cancels one still waiting.
 *
 * Planes are not keyboard-focusable (`keyboard: false`): every map action is
 * also available from the chat, which is the accessible path.
 *
 * Pass `obstruction` for the element that covers the map's lower part on
 * phones (the chat's bottom sheet): the card, fits and reveals stay above
 * it. Pass `signal` to cancel before the import settles: when it is already
 * aborted by then, no map is created and the handle's `destroy` is a no-op.
 * The map re-measures itself whenever `element` changes size.
 */
export async function createAirspaceMap(options: {
  element: HTMLElement;
  store: AtcStore;
  area: Area;
  obstruction?: () => HTMLElement | null;
  signal?: AbortSignal;
}): Promise<AirspaceMapHandle> {
  const { element, store, area, signal } = options;
  const obstruction = options.obstruction ?? (() => null);
  const module = await import('leaflet');
  if (signal?.aborted) {
    return {
      destroy() {
        // Nothing was created.
      },
    };
  }
  const L =
    (module as unknown as { default?: typeof module }).default ?? module;
  // Leaflet's own animations are set once here; later moves re-read the setting.
  const reduced = prefersReducedMotion();
  const map: LeafletMap = L.map(element, {
    zoomControl: false,
    zoomAnimation: !reduced,
    fadeAnimation: !reduced,
    markerZoomAnimation: !reduced,
  }).setView([area.lat, area.lon], area.zoom);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  // Leaflet's own credit is optional; dropping it keeps the phone line short.
  map.attributionControl.setPrefix(false);
  L.tileLayer(TILE_LAYER.url, {
    attribution: TILE_LAYER.attribution,
    maxZoom: TILE_LAYER.maxZoom,
  }).addTo(map);

  const markers = new Map<string, Marker>();
  let zooming = false;
  const isZooming = () => zooming;
  const shared = { L, map, element, store, markers, isZooming, obstruction };
  const motion = createMotionLoop({
    ...shared,
    onFrame: () => {
      follow.panToFollowed(false);
      cards.sync(store.getState());
    },
  });
  /** Where a plane is drawn: the motion loop's position, else its marker's. */
  const drawnAt = (hex: string): LatLon | null => {
    const position = markers.get(hex)?.getLatLng();

    return (
      motion.positionOf(hex) ??
      (position ? { lat: position.lat, lon: position.lng } : null)
    );
  };
  const cards = createCardSync({ ...shared, drawnAt });
  const follow = createFollowController({ ...shared, drawnAt });
  const view = createViewController({ ...shared, area, drawnAt, cards });

  map.on('dragstart', () => {
    view.cancelMove();
    follow.release();
    store.cancelViewRequest();
    follow.syncPill();
  });
  // Leaflet repositions markers from their own (rounded) positions here.
  map.on('viewreset', () => motion.syncMarkers());
  map.on('zoomstart', () => {
    zooming = true;
    motion.syncMarkers();
    if (!view.isMoving()) {
      store.cancelViewRequest();
    }
    cards.sync(store.getState());
  });
  /** Marks regional zooms, where the CSS draws smaller silhouettes. */
  const markZoom = () =>
    element.toggleAttribute('data-zoom-low', map.getZoom() <= LOW_ZOOM);
  markZoom();
  map.on('zoomend', () => {
    zooming = false;
    markZoom();
    cards.sync(store.getState());
    follow.panToFollowed(true);
  });
  map.on('move', () => cards.sync(store.getState()));
  map.on('click', () => {
    if (store.getState().selectedHex !== null) {
      store.select(null);
    }
  });
  const doc = element.ownerDocument;
  const onKeydown = (event: KeyboardEvent) => {
    if (
      event.key === 'Escape' &&
      !event.defaultPrevented &&
      !isTyping(event.target) &&
      store.getState().selectedHex !== null
    ) {
      store.select(null);
    }
  };
  doc.addEventListener('keydown', onKeydown);

  // The class, not `L.svg()`, which returns null where SVG is not detected.
  const outlineRenderer = new L.SVG({ padding: 0.5 });
  let outline: { readonly area: ShownArea; readonly layer: Circle } | null =
    null;
  /** Draws the shown area's outline, or removes it. */
  const syncOutline = (shown: ShownArea | null) => {
    if (outline?.area === shown) {
      return;
    }
    outline?.layer.remove();
    outline = null;
    if (shown === null) {
      return;
    }
    const centre = AIRPORTS[shown.airport];
    const layer = L.circle([centre.lat, centre.lon], {
      radius: shown.radiusNm * METRES_PER_NM,
      className: 'atc-area',
      renderer: outlineRenderer,
      fill: false,
      weight: 1,
      interactive: false,
    }).addTo(map);
    outline = { area: shown, layer };
  };

  const icon = (html: string) =>
    L.divIcon({
      html,
      className: 'atc-plane-icon',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  let lastUpdatedAt: number | null = null;
  let lastPulseAt: number | null = null;
  const render = (state: AtcState) => {
    for (const [hex, marker] of markers) {
      if (!state.aircraft.has(hex)) {
        marker.remove();
        markers.delete(hex);
        cards.forget(hex);
      }
    }
    if (state.updatedAt !== lastUpdatedAt) {
      lastUpdatedAt = state.updatedAt;
      motion.onSnapshot(state);
    }
    for (const aircraft of state.aircraft.values()) {
      const className = markerClassName(state, aircraft.hex);
      const existing = markers.get(aircraft.hex);
      if (existing) {
        updatePlane(existing.getElement(), aircraft, className);
      } else {
        const marker = L.marker([aircraft.lat, aircraft.lon], {
          icon: icon(planeIconHtml(aircraft, className)),
          keyboard: false,
        })
          .on('click', () => store.select(aircraft.hex))
          .on('mouseover', () => cards.hover(aircraft.hex))
          .on('mouseout', () => cards.leave(aircraft.hex))
          .addTo(map);
        markers.set(aircraft.hex, marker);
      }
    }
    cards.sync(state);
    follow.syncPill();
    syncOutline(state.shownArea);
    view.applyWhenSettled(state);
    follow.panToFollowed(true);
    if (state.pulse !== null && state.pulse.at !== lastPulseAt) {
      lastPulseAt = state.pulse.at;
      const plane = markers
        .get(state.pulse.hex)
        ?.getElement()
        ?.querySelector('.atc-plane');
      plane?.classList.remove('is-pulsing');
      // Forces a reflow so removing and re-adding the class restarts the pulse.
      void plane?.getBoundingClientRect();
      plane?.classList.add('is-pulsing');
    }
  };

  cards.measureArea();
  render(store.getState());
  const unsubscribe = store.subscribe(() => render(store.getState()));
  // Leaflet only re-measures on window resize; rotation and layout changes
  // (a bottom sheet, a panel) resize the container without one.
  const onResize = () => {
    cards.measureArea();
    cards.sync(store.getState());
  };
  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          map.invalidateSize();
          onResize();
        })
      : null;
  resizeObserver?.observe(element);
  // The sheet's height (peek or expanded) decides how much map is visible.
  const panel = obstruction();
  if (panel) {
    resizeObserver?.observe(panel);
  }
  const win = doc.defaultView;
  win?.addEventListener('resize', onResize);
  win?.visualViewport?.addEventListener('resize', onResize);

  return {
    destroy() {
      view.destroy();
      resizeObserver?.disconnect();
      unsubscribe();
      doc.removeEventListener('keydown', onKeydown);
      win?.removeEventListener('resize', onResize);
      win?.visualViewport?.removeEventListener('resize', onResize);
      cards.destroy();
      follow.destroy();
      motion.destroy();
      map.remove();
    },
  };
}
