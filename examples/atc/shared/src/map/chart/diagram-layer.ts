import type * as Leaflet from 'leaflet';
import type {
  Canvas,
  LatLngExpression,
  LayerGroup,
  Map as LeafletMap,
} from 'leaflet';
import type { ChartAirport, SurfaceFeature, Surfaces } from '../../chart';
import { loadSurfaces } from '../../chart/chart-feed';
import { FT_TO_M, metresPerPixel } from '../../chart/runway-geometry';
import type { LatLon } from '../../places';
import type { AtcState, AtcStore } from '../../store';
import { type ChartColours, chartColours } from './chart-colours';

/** From this zoom airports are drawn as diagrams instead of symbols. */
export const DIAGRAM_ZOOM = 12;
/** From this zoom taxiways carry their ref letters. */
export const TAXIWAY_LABEL_ZOOM = 14;
/** At this zoom (below diagrams) large airports show runway outlines. */
const LARGE_OUTLINE_ZOOM = 11;
/** The sectional draws runway outlines for hard runways this long or longer. */
const LARGE_RUNWAY_FT = 8070;
/** How far beyond the view (as a fraction of it) diagrams are still drawn. */
const NEAR_PAD = 0.2;
/** Runway end numbers sit this fraction of the length in from each end. */
const END_LABEL_INSET = 0.06;
/** A runway thinner than this many pixels also gets a 3 px centre line. */
const MIN_RUNWAY_PX = 3;
/** Width assumed for a taxiway line without one, in feet. */
const DEFAULT_TAXIWAY_FT = 50;

/** A mounted diagram layer. */
export interface DiagramLayer {
  /** Redraws when the chart, the layers or the surfaces changed. */
  sync(state: AtcState): void;
  /** Redraws for the current view; call on `zoomend` and `moveend`. */
  redraw(): void;
  /** Removes everything drawn. */
  destroy(): void;
}

/**
 * Whether `airport` is drawn as runway outlines at `zoom`: the sectional's
 * large-airport pattern, used at zoom 11 for an airport whose longest hard
 * runway is 8,070 ft or more and which has surveyed runway corners. The
 * airport layer hides the symbol whenever this holds.
 */
export function drawsLargeOutline(airport: ChartAirport, zoom: number) {
  if (zoom < LARGE_OUTLINE_ZOOM || zoom >= DIAGRAM_ZOOM) return false;
  const hard = airport.runways.filter((r) => r.hard);

  return (
    hard.some((r) => r.corners !== null) &&
    Math.max(0, ...hard.map((r) => r.lengthFt)) >= LARGE_RUNWAY_FT
  );
}

/** [lon, lat] (GeoJSON order) to a Leaflet position. */
const toLatLng = ([lon, lat]: readonly [number, number]): [number, number] => [
  lat,
  lon,
];

const along = (a: LatLon, b: LatLon, t: number): [number, number] => [
  a.lat + (b.lat - a.lat) * t,
  a.lon + (b.lon - a.lon) * t,
];

/** The average of a polygon's outer ring vertices, as a Leaflet position. */
function vertexAverage(
  rings: readonly (readonly (readonly [number, number])[])[],
): [number, number] | null {
  const ring = rings[0] ?? [];
  if (ring.length === 0) return null;
  const lon = ring.reduce((sum, [x]) => sum + x, 0) / ring.length;
  const lat = ring.reduce((sum, [, y]) => sum + y, 0) / ring.length;

  return [lat, lon];
}

/** A label candidate for one taxiway ref: where, and how long its segment is. */
interface RefSpot {
  readonly at: [number, number];
  readonly length: number;
}

/**
 * One label spot per taxiway ref: the midpoint of the longest segment of the
 * ref's lines. A ref drawn only as polygons (FAA airport mapping) is placed
 * at the vertex average of its polygon with the longest edge.
 */
export function taxiwayLabelSpots(
  features: readonly SurfaceFeature[],
): ReadonlyMap<string, [number, number]> {
  const lines = new Map<string, RefSpot>();
  const polygons = new Map<string, RefSpot>();
  const keep = (spots: Map<string, RefSpot>, ref: string, spot: RefSpot) => {
    const best = spots.get(ref);
    if (!best || spot.length > best.length) spots.set(ref, spot);
  };
  const segments = (points: readonly (readonly [number, number])[]) =>
    points.slice(1).map((b, i) => {
      const a = points[i] as readonly [number, number];
      return {
        at: [(a[1] + b[1]) / 2, (a[0] + b[0]) / 2] as [number, number],
        // Degrees of longitude shrink with latitude; this only ranks segments.
        length: Math.hypot(
          (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180),
          b[1] - a[1],
        ),
      };
    });
  for (const feature of features) {
    if (feature.kind !== 'taxiway' || !feature.ref) continue;
    if (feature.shape === 'line') {
      for (const spot of segments(feature.points)) {
        keep(lines, feature.ref, spot);
      }
      continue;
    }
    const at = vertexAverage(feature.rings);
    const longest = Math.max(
      0,
      ...segments(feature.rings[0] ?? []).map((s) => s.length),
    );
    if (at) keep(polygons, feature.ref, { at, length: longest });
  }
  const spots = new Map<string, [number, number]>();
  for (const [ref, { at }] of polygons) spots.set(ref, at);
  for (const [ref, { at }] of lines) spots.set(ref, at);

  return spots;
}

function isLoaded(
  value: Surfaces | 'loading' | 'failed' | undefined,
): value is Surfaces {
  return typeof value === 'object';
}

/**
 * Draws FAA-style airport diagrams in `pane` on a canvas renderer. Below
 * {@link DIAGRAM_ZOOM} it draws only the large-airport runway outlines at
 * zoom 11 (see {@link drawsLargeOutline}). From {@link DIAGRAM_ZOOM}, for
 * every chart airport near the view it loads the airport's surfaces once
 * (`loadSurfaces`, deduplicated by the store) and draws pavement, runways in
 * ink, hold bars and hot spots, with runway end numbers, taxiway refs (from
 * {@link TAXIWAY_LABEL_ZOOM}) and hot spot names as text-filled markers.
 * Everything is rebuilt on `redraw` and whenever the chart, the layers or the
 * surfaces change; aircraft snapshots never reach it. Colours are read from
 * `element`'s chart custom properties, since canvas needs real colours.
 */
export function createDiagramLayer(options: {
  L: typeof Leaflet;
  map: LeafletMap;
  store: AtcStore;
  pane: string;
  element: HTMLElement;
  fetchFn?: typeof fetch;
}): DiagramLayer {
  const { L, map, store, pane, element, fetchFn } = options;
  let renderer: Canvas | null = null;
  let group: LayerGroup | null = null;
  let synced: Pick<AtcState, 'chart' | 'layers' | 'surfaces'> | null = null;
  /** True while this layer starts surface loads, which notify the store. */
  let loading = false;

  const shared = () => {
    renderer ??= L.canvas({ pane });
    group ??= L.layerGroup().addTo(map);
    return { renderer, group };
  };

  const label = (
    target: LayerGroup,
    at: LatLngExpression,
    text: string,
    kind: 'is-runway' | 'is-taxiway' | 'is-hotspot',
  ) => {
    const marker = L.marker(at, {
      icon: L.divIcon({
        html: '',
        className: `atc-diagram-label ${kind}`,
        iconSize: [0, 0],
      }),
      interactive: false,
      keyboard: false,
      pane,
    }).addTo(target);
    const span = element.ownerDocument.createElement('span');
    span.textContent = text;
    marker.getElement()?.replaceChildren(span);
  };

  const drawOutline = (airport: ChartAirport, colours: ChartColours) => {
    const { renderer, group } = shared();
    const color = airport.towered ? colours.blue : colours.magenta;
    for (const runway of airport.runways) {
      if (!runway.hard || runway.corners === null) continue;
      L.polygon(
        runway.corners.map((c) => [c.lat, c.lon] as [number, number]),
        { renderer, fill: false, color, weight: 2, interactive: false },
      ).addTo(group);
    }
  };

  const drawDiagram = (
    airport: ChartAirport,
    surfaces: Surfaces | null,
    zoom: number,
    colours: ChartColours,
  ) => {
    const { renderer, group } = shared();
    const mpp = metresPerPixel(zoom, airport.lat);
    const base = { renderer, interactive: false };
    const features = surfaces?.features ?? [];

    for (const feature of features) {
      if (feature.shape === 'polygon' && feature.kind !== 'hotspot') {
        L.polygon(
          feature.rings.map((ring) => ring.map(toLatLng)),
          {
            ...base,
            weight: 0,
            fillColor: colours.pavement,
            fillOpacity: 1,
          },
        ).addTo(group);
      }
    }
    for (const feature of features) {
      if (feature.shape === 'line' && feature.kind === 'taxiway') {
        const widthM = (feature.widthFt ?? DEFAULT_TAXIWAY_FT) * FT_TO_M;
        L.polyline(feature.points.map(toLatLng), {
          ...base,
          color: colours.pavement,
          opacity: 1,
          weight: Math.max(1.5, widthM / mpp),
          lineCap: 'butt',
        }).addTo(group);
      }
    }
    for (const runway of airport.runways) {
      if (runway.corners === null) continue;
      L.polygon(
        runway.corners.map((c) => [c.lat, c.lon] as [number, number]),
        {
          ...base,
          weight: 0,
          fillColor: colours.ink,
          fillOpacity: 1,
          color: colours.ink,
        },
      ).addTo(group);
      if (runway.ends && (runway.widthFt * FT_TO_M) / mpp < MIN_RUNWAY_PX) {
        const [a, b] = runway.ends;
        L.polyline(
          [
            [a.lat, a.lon],
            [b.lat, b.lon],
          ],
          { ...base, color: colours.ink, opacity: 1, weight: 3 },
        ).addTo(group);
      }
    }
    for (const feature of features) {
      if (feature.shape === 'line' && feature.kind === 'hold') {
        const points = feature.points.map(toLatLng);
        const bar = { ...base, opacity: 1, lineCap: 'butt' as const };
        L.polyline(points, { ...bar, color: colours.ink, weight: 4 }).addTo(
          group,
        );
        L.polyline(points, {
          ...bar,
          color: colours.pavement,
          weight: 1.5,
        }).addTo(group);
      }
    }
    for (const feature of features) {
      if (feature.shape !== 'polygon' || feature.kind !== 'hotspot') continue;
      const at = vertexAverage(feature.rings);
      if (at === null) continue;
      L.circleMarker(at, {
        ...base,
        radius: 9,
        color: colours.hotspot,
        fill: false,
        weight: 2,
      }).addTo(group);
      if (feature.ref) label(group, at, feature.ref, 'is-hotspot');
    }

    for (const runway of airport.runways) {
      if (runway.ends === null) continue;
      const [a, b] = runway.ends;
      label(group, along(a, b, END_LABEL_INSET), a.id, 'is-runway');
      label(group, along(b, a, END_LABEL_INSET), b.id, 'is-runway');
    }
    if (zoom >= TAXIWAY_LABEL_ZOOM) {
      for (const [ref, at] of taxiwayLabelSpots(features)) {
        label(group, at, ref, 'is-taxiway');
      }
    }
  };

  const clear = () => {
    group?.clearLayers();
  };

  const redraw = () => {
    clear();
    const state = store.getState();
    if (!state.layers.airports || state.chart.status !== 'ready') return;
    const zoom = map.getZoom();
    if (zoom < LARGE_OUTLINE_ZOOM) return;
    const near = map.getBounds().pad(NEAR_PAD);
    const onScreen = state.chart.airports.filter((airport) =>
      near.contains([airport.lat, airport.lon]),
    );
    const colours = chartColours(element);
    if (zoom < DIAGRAM_ZOOM) {
      for (const airport of onScreen) {
        if (drawsLargeOutline(airport, zoom)) drawOutline(airport, colours);
      }
      return;
    }
    for (const airport of onScreen) {
      const surfaces = state.surfaces.get(airport.code);
      drawDiagram(airport, isLoaded(surfaces) ? surfaces : null, zoom, colours);
    }
    const missing = onScreen.filter((a) => !state.surfaces.has(a.code));
    if (missing.length === 0) return;
    // Each load marks its airport `loading` in the store at once; that
    // changes nothing drawn, so those notifications are not redrawn.
    loading = true;
    try {
      for (const airport of missing) {
        void loadSurfaces({ store, code: airport.code, fetchFn });
      }
    } finally {
      loading = false;
    }
  };

  return {
    sync(state) {
      if (loading) return;
      if (
        synced !== null &&
        synced.chart === state.chart &&
        synced.layers === state.layers &&
        synced.surfaces === state.surfaces
      ) {
        return;
      }
      synced = {
        chart: state.chart,
        layers: state.layers,
        surfaces: state.surfaces,
      };
      redraw();
    },
    redraw,
    destroy() {
      group?.remove();
      renderer?.remove();
      group = null;
      renderer = null;
      synced = null;
    },
  };
}
