import type { Map as LeafletMap, Marker } from 'leaflet';
import { isTyping, prefersReducedMotion } from '../dom';
import type { Area, LatLon } from '../places';
import type { AtcState, AtcStore } from '../store';
import { createAreaOutline } from './area-outline';
import { createCardSync } from './card-sync';
import { createAirportLayer } from './chart/airport-layer';
import { createAirspaceLayer } from './chart/airspace-layer';
import { placeChartLabels } from './chart/chart-labels';
import { createDiagramLayer } from './chart/diagram-layer';
import { createLayersControl } from './chart/layers-control';
import { createFollowController } from './follow';
import { createMotionLoop } from './motion-loop';
import { createTagSync } from './tag-sync';
import {
  markerClassName,
  planeElementOf,
  planeIconHtml,
  restartPulse,
  updatePlane,
} from './plane-marker';
import { PLANE_ICON } from './tag-obstacles';
import { TILE_LAYER } from './tiles';
import { createViewController } from './view-controller';

/** At this zoom and below, markers are drawn smaller. */
const LOW_ZOOM = 6;
/** At this zoom and below, airspace draws its thinner overview lines. */
const OVERVIEW_ZOOM = 8;
/** The chart overlay panes and their z-index, bottom to top. */
const CHART_PANES = [
  ['atc-airspace', 410],
  ['atc-diagram', 420],
  ['atc-airports', 430],
] as const;

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
 * - `follow.ts`: a followed plane stays centred in the map left between a
 *   docked card and a phone's sheet, and a pill names it with a
 *   Stop button; a drag ends follow mode and offers Resume for a few seconds.
 * - `card-sync.ts`: hovering or selecting a plane opens one detail card
 *   beside it. On phones the card stays above the bottom sheet.
 * - `view-controller.ts`: the map moves only for view requests in the store
 *   (see `requestArea`). The newest request wins; follow mode wins over all
 *   of them; a user drag or zoom cancels one still waiting.
 * - `area-outline.ts`: the faint circle around a shown area.
 * - `chart/`: Class B, C, D and E surface airspace, FAA sectional airport
 *   symbols and data blocks, and from zoom 12 airport diagrams, in their own
 *   panes below the planes. The Layers pill above the zoom control turns
 *   airports and airspace on and off.
 *
 * Escape (outside text fields) or a click on the empty map clears the
 * selection.
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
  // Leaflet ships as CommonJS: depending on the bundler, a dynamic import
  // returns it as the namespace or under `default`.
  const L =
    (module as unknown as { default?: typeof module }).default ?? module;
  // Leaflet's own animations are set once here; later moves re-read the setting.
  const reduced = prefersReducedMotion();
  const map: LeafletMap = L.map(element, {
    zoomControl: false,
    zoomAnimation: !reduced,
    fadeAnimation: !reduced,
    markerZoomAnimation: !reduced,
  }).setView([area.view.lat, area.view.lon], area.view.zoom);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  // Leaflet's own credit is optional; dropping it keeps the phone line short.
  map.attributionControl.setPrefix(false);
  L.tileLayer(TILE_LAYER.url, {
    attribution: TILE_LAYER.attribution,
    maxZoom: TILE_LAYER.maxZoom,
  }).addTo(map);
  // Chart panes sit above the tiles and below the planes (markerPane is 600).
  for (const [name, zIndex] of CHART_PANES) {
    map.createPane(name).style.zIndex = String(zIndex);
  }
  const airspace = createAirspaceLayer({
    L,
    map,
    store,
    pane: 'atc-airspace',
  });
  const airports = createAirportLayer({ L, map, store, pane: 'atc-airports' });
  const diagrams = createDiagramLayer({
    L,
    map,
    store,
    pane: 'atc-diagram',
    element,
  });
  /**
   * The chart layers as one: airport and airspace labels are placed together
   * (`placeChartLabels`) after the layers redraw for a settled view, or after
   * a sync that changed them; aircraft snapshots never place them.
   */
  const placeChart = () =>
    placeChartLabels({
      sources: [airspace, airports],
      runwayBoxes: airports.runwayBoxes,
    });
  const chart = {
    sync(state: AtcState) {
      const changed = [airspace.sync(state), airports.sync(state)];
      diagrams.sync(state);
      if (changed.some(Boolean)) {
        placeChart();
      }
    },
    redraw() {
      airspace.redraw();
      airports.redraw();
      diagrams.redraw();
      placeChart();
    },
  };
  // Added after the zoom control, so it stacks above it.
  const layersControl = createLayersControl({ L, map, store });

  const markers = new Map<string, Marker>();
  let zooming = false;
  const isZooming = () => zooming;
  const shared = { L, map, element, store, markers, isZooming, obstruction };
  const motion = createMotionLoop({
    ...shared,
    onFrame: (time) => {
      follow.panToFollowed(false);
      cards.sync(store.getState());
      tags.frame(time);
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
  const follow = createFollowController({
    ...shared,
    drawnAt,
    band: cards.visibleBand,
  });
  const view = createViewController({ ...shared, area, drawnAt, cards });
  const tags = createTagSync({
    ...shared,
    getState: store.getState,
    drawnAt,
    focus: cards.focus,
    band: cards.visibleBand,
  });

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
  /**
   * Marks regional zooms, where the CSS draws smaller silhouettes, and
   * overview zooms, where it draws thinner airspace lines.
   */
  const markZoom = () => {
    element.toggleAttribute('data-zoom-low', map.getZoom() <= LOW_ZOOM);
    element.toggleAttribute(
      'data-zoom-overview',
      map.getZoom() <= OVERVIEW_ZOOM,
    );
  };
  markZoom();
  map.on('zoomend', () => {
    zooming = false;
    markZoom();
    cards.sync(store.getState());
    follow.panToFollowed(true);
    tags.layout();
    // Leaflet fires moveend right after zoomend; the chart redraws there.
  });
  map.on('moveend', () => {
    tags.layout();
    chart.redraw();
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

  const outline = createAreaOutline({ L, map, store });

  const icon = (html: string) =>
    L.divIcon({
      html,
      className: 'atc-plane-icon',
      iconSize: [PLANE_ICON, PLANE_ICON],
      iconAnchor: [PLANE_ICON / 2, PLANE_ICON / 2],
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
    // A stable hook for tests and tools: the first snapshot is on the map.
    element.toggleAttribute('data-ready', state.updatedAt !== null);
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
          .on('mouseover', () => {
            cards.hover(aircraft.hex);
            tags.layout();
          })
          .on('mouseout', () => {
            cards.leave(aircraft.hex);
            tags.layout();
          })
          .addTo(map);
        markers.set(aircraft.hex, marker);
      }
    }
    chart.sync(state);
    cards.sync(state);
    follow.syncPill();
    outline.sync(state.shownArea);
    view.applyWhenSettled(state);
    follow.panToFollowed(true);
    tags.layout();
    if (state.pulse !== null && state.pulse.at !== lastPulseAt) {
      lastPulseAt = state.pulse.at;
      restartPulse(planeElementOf(markers, state.pulse.hex));
    }
  };

  cards.measureArea();
  tags.measureControls();
  view.showHome();
  render(store.getState());
  const unsubscribe = store.subscribe(() => render(store.getState()));
  // Leaflet only re-measures on window resize; rotation and layout changes
  // (a bottom sheet, a panel) resize the container without one.
  const onResize = () => {
    cards.measureArea();
    cards.sync(store.getState());
    tags.measureControls();
    tags.layout();
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
      tags.destroy();
      airspace.destroy();
      airports.destroy();
      diagrams.destroy();
      layersControl.destroy();
      map.remove();
    },
  };
}
