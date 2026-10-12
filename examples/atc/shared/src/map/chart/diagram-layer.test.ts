// @vitest-environment jsdom
import { expect, onTestFinished, test, vi } from 'vitest';
import {
  type ChartAirport,
  type Runway,
  runwayCorners,
  type Surfaces,
} from '../../chart';
import { createAtcStore } from '../../store';
import { testAircraft, testChartAirport } from '../../testing';
import { leafletModule, mapElement, stubCanvas } from '../testing';
import { createDiagramLayer, runwayDrawing } from './diagram-layer';

const L = await leafletModule();

const end05 = { id: '05', lat: 44.2468, lon: -121.16 };
const end23 = { id: '23', lat: 44.2605, lon: -121.1405 };
const end11 = { id: '11', lat: 44.257, lon: -121.1625 };
const end29 = { id: '29', lat: 44.25, lon: -121.138 };

/** A runway between two ends, with true-size corners. */
const runway = (
  a: { id: string; lat: number; lon: number },
  b: { id: string; lat: number; lon: number },
  lengthFt: number,
  widthFt = 150,
): Runway => ({
  id: `${a.id}/${b.id}`,
  lengthFt,
  widthFt,
  surface: 'ASPH',
  hard: true,
  ends: [a, b],
  corners: runwayCorners(a, b, widthFt),
  bearingDeg: 50,
});

const krdm = testChartAirport({
  runways: [runway(end05, end23, 7038), runway(end11, end29, 7006, 100)],
});

/** One taxiway line, ref A, running beside the runway. */
const surfaces: Surfaces = {
  code: 'KRDM',
  source: 'osm',
  features: [
    {
      kind: 'taxiway',
      shape: 'line',
      points: [
        [-121.158, 44.2465],
        [-121.15, 44.251],
        [-121.142, 44.258],
      ],
      ref: 'A',
      widthFt: 50,
    },
  ],
};

/** A 400x300 map over KRDM with the diagram layer synced to a store. */
function mount(zoom: number, airports: readonly ChartAirport[] = [krdm]) {
  stubCanvas();
  const store = createAtcStore();
  const fetchFn = vi.fn(() => new Promise<Response>(() => undefined));
  const element = mapElement();
  document.body.append(element);
  const map = L.map(element, {
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
  }).setView([krdm.lat, krdm.lon], zoom);
  map.createPane('atc-diagram');
  const layer = createDiagramLayer({
    L,
    map,
    store,
    pane: 'atc-diagram',
    element,
    fetchFn,
  });
  const unsubscribe = store.subscribe(() => layer.sync(store.getState()));
  onTestFinished(async () => {
    // Leaflet's canvas can leave a redraw frame queued past a synchronous
    // update; let it run before the renderer's context goes away.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    unsubscribe();
    layer.destroy();
    map.remove();
    element.remove();
  });
  const chart = () =>
    store.setChart({ cycle: '2610', effective: '2026-09-03', airports });
  const labels = (selector = '') =>
    [...element.querySelectorAll(`.atc-diagram-label${selector}`)].map(
      (label) => label.textContent,
    );

  return { store, map, layer, fetchFn, chart, labels };
}

test('at zoom 11 no surfaces are fetched', () => {
  const view = mount(11);

  view.chart();

  expect(view.fetchFn).not.toHaveBeenCalled();
});

test('at zoom 13 over KRDM its surfaces are fetched once', () => {
  const view = mount(13);

  view.chart();
  view.layer.redraw();

  expect(view.fetchFn).toHaveBeenCalledTimes(1);
  expect(view.fetchFn).toHaveBeenCalledWith('/api/chart/surfaces?airport=KRDM');
});

test('taxiway refs are labelled from zoom 14 only', () => {
  const view = mount(13);
  view.store.setSurfaces('KRDM', surfaces);
  view.chart();
  const at13 = view.labels('.is-taxiway');

  view.map.setZoom(14);
  view.layer.redraw();

  expect(at13).toEqual([]);
  expect(view.labels('.is-taxiway')).toEqual(['A']);
});

test('runway end numbers are labelled at zoom 13', () => {
  const view = mount(13);

  view.chart();

  expect(view.labels('.is-runway').sort()).toEqual(['05', '11', '23', '29']);
});

test('turning the airports layer off removes every label', () => {
  const view = mount(14);
  view.store.setSurfaces('KRDM', surfaces);
  view.chart();
  const before = view.labels().length;

  view.store.setLayers({ airports: false });

  expect(before).toBeGreaterThan(0);
  expect(view.labels()).toEqual([]);
});

test('an aircraft snapshot after surface loads start never redraws', () => {
  const view = mount(13);
  view.chart();
  const polygon = vi.spyOn(L, 'polygon');
  onTestFinished(() => polygon.mockRestore());

  view.store.applySnapshot({
    at: 1,
    aircraft: [testAircraft({ lat: 44.25, lon: -121.15 })],
  });

  expect(view.fetchFn).toHaveBeenCalledTimes(1);
  expect(polygon).not.toHaveBeenCalled();
});

const bdn1735 = runway(
  { id: '17', lat: 44.1025, lon: -121.2002 },
  { id: '35', lat: 44.0868, lon: -121.2002 },
  5200,
  75,
);

test('KRDM 05/23 is a 2 px stroke between its ends at zoom 10', () => {
  const krdm0523 = runway(end05, end23, 7038);

  const drawing = runwayDrawing(krdm0523, 10, 44.25);

  expect(drawing).toEqual({ kind: 'stroke', ends: krdm0523.ends, weight: 2 });
});

test('KRDM 05/23 is a true-size polygon at zoom 14', () => {
  const krdm0523 = runway(end05, end23, 7038);

  const drawing = runwayDrawing(krdm0523, 14, 44.25);

  expect(drawing).toEqual({ kind: 'polygon', corners: krdm0523.corners });
});

test('a runway with no corners has no drawing', () => {
  const unsurveyed: Runway = { ...bdn1735, ends: null, corners: null };

  const drawing = runwayDrawing(unsurveyed, 15, 44.09);

  expect(drawing).toBeNull();
});

test('at zoom 6 KRDM draws its 2 runways as butt strokes and fetches nothing', () => {
  const view = mount(6);
  const polyline = vi.spyOn(L, 'polyline');
  const polygon = vi.spyOn(L, 'polygon');
  onTestFinished(() => {
    polyline.mockRestore();
    polygon.mockRestore();
  });

  view.chart();

  expect(polyline).toHaveBeenCalledTimes(2);
  expect(polyline.mock.calls[0]?.[1]).toMatchObject({
    weight: 2,
    lineCap: 'butt',
  });
  expect(polygon).not.toHaveBeenCalled();
  expect(view.fetchFn).not.toHaveBeenCalled();
  expect(view.labels()).toEqual([]);
});

test('at zoom 14 runways are polygons with their end numbers', () => {
  const view = mount(14);
  const polygon = vi.spyOn(L, 'polygon');
  onTestFinished(() => polygon.mockRestore());

  view.chart();

  expect(polygon).toHaveBeenCalledTimes(2);
  expect(view.labels('.is-runway').sort()).toEqual(['05', '11', '23', '29']);
});

test('a runway drawn as a stroke carries no end numbers', () => {
  const view = mount(12);

  view.chart();

  expect(view.labels('.is-runway')).toEqual([]);
});

test('an airport below its zoom rank draws no runways', () => {
  const small = {
    ...krdm,
    towered: false,
    runways: [runway(end05, end23, 2500)],
  };
  const view = mount(6, [small]);
  const polyline = vi.spyOn(L, 'polyline');
  onTestFinished(() => polyline.mockRestore());

  view.chart();

  expect(polyline).not.toHaveBeenCalled();
});

test('heliports and seaplane bases draw no runways, only their ring', () => {
  const heli = { ...krdm, kind: 'heliport' as const };
  const sea = { ...krdm, code: 'S60', kind: 'seaplane' as const };
  const view = mount(14, [heli, sea]);
  const polyline = vi.spyOn(L, 'polyline');
  const polygon = vi.spyOn(L, 'polygon');
  onTestFinished(() => {
    polyline.mockRestore();
    polygon.mockRestore();
  });

  view.chart();

  expect(polygon).not.toHaveBeenCalled();
  expect(polyline).not.toHaveBeenCalled();
  expect(view.labels('.is-runway')).toEqual([]);
});

/** BDN 17/35 (75 ft wide) laid over KRDM's centre so it is in view. */
const bdnAtKrdm: ChartAirport = {
  ...krdm,
  runways: [
    runway(
      { id: '17', lat: 44.2541 + 0.0078, lon: -121.15 },
      { id: '35', lat: 44.2541 - 0.0078, lon: -121.15 },
      5200,
      75,
    ),
  ],
};

/** Draws `bdnAtKrdm` at a zoom and returns how many strokes and polygons. */
function drawBdn(zoom: number) {
  const view = mount(zoom, [bdnAtKrdm]);
  const polyline = vi.spyOn(L, 'polyline');
  const polygon = vi.spyOn(L, 'polygon');
  onTestFinished(() => {
    polyline.mockRestore();
    polygon.mockRestore();
  });
  // A second call in the same test gets the first call's spies back.
  polyline.mockClear();
  polygon.mockClear();

  view.chart();

  return {
    polyline: { calls: [...polyline.mock.calls] },
    polygon: { calls: [...polygon.mock.calls] },
  };
}

test('BDN 17/35 is one stroke at zoom 13 and one polygon at zoom 14', () => {
  const at13 = drawBdn(13);
  const strokes13 = at13.polyline.calls.length;
  const polygons13 = at13.polygon.calls.length;

  const at14 = drawBdn(14);

  expect([strokes13, polygons13]).toEqual([1, 0]);
  expect([at14.polyline.calls.length, at14.polygon.calls.length]).toEqual([
    0, 1,
  ]);
});

test('the BDN stroke ends sit at the midpoints of the polygon short edges', () => {
  const at13 = drawBdn(13);
  const at14 = drawBdn(14);

  const stroke = at13.polyline.calls[0]?.[0] as [number, number][];
  const corners = at14.polygon.calls[0]?.[0] as [number, number][];
  const mid = (p: [number, number], q: [number, number]) => [
    (p[0] + q[0]) / 2,
    (p[1] + q[1]) / 2,
  ];
  const expected = [mid(corners[0], corners[3]), mid(corners[1], corners[2])];

  stroke.forEach((end, i) => {
    expect(Math.abs(end[0] - expected[i][0])).toBeLessThan(1e-6);
    expect(Math.abs(end[1] - expected[i][1])).toBeLessThan(1e-6);
  });
  expect(stroke).toHaveLength(2);
});
