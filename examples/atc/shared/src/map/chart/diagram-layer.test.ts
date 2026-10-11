// @vitest-environment jsdom
import * as module from 'leaflet';
import { expect, onTestFinished, test, vi } from 'vitest';
import type { ChartAirport, Runway, Surfaces } from '../../chart';
import { runwayCorners } from '../../chart/runway-geometry';
import { createAtcStore } from '../../store';
import { createDiagramLayer } from './diagram-layer';

const L = (module as unknown as { default?: typeof module }).default ?? module;

const end05 = { id: '05', lat: 44.2468, lon: -121.16 };
const end23 = { id: '23', lat: 44.2605, lon: -121.1405 };

/** A runway between two ends, with true-size corners. */
const runway = (
  a: typeof end05,
  b: typeof end23,
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

const krdm: ChartAirport = {
  code: 'KRDM',
  faa: 'RDM',
  name: 'ROBERTS FLD',
  city: 'REDMOND',
  state: 'OR',
  aliases: [],
  lat: 44.2541,
  lon: -121.15,
  elevationFt: 3082,
  kind: 'airport',
  towered: true,
  towerPartTime: false,
  frequencies: { tower: '124.5', atis: null, ctaf: null, unicom: '122.95' },
  weather: null,
  lighting: 'full',
  fuel: true,
  military: false,
  runways: [runway(end05, end23, 7038)],
  rank: 0,
};

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

/** jsdom has no canvas; Leaflet's renderer draws into a no-op context. */
function stubCanvas() {
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => (key in target ? target[key] : () => undefined),
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  });
  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => context as unknown as CanvasRenderingContext2D);
  onTestFinished(() => spy.mockRestore());
}

/** A 400x300 map over KRDM with the diagram layer synced to a store. */
function mount(zoom: number, airports: readonly ChartAirport[] = [krdm]) {
  stubCanvas();
  const store = createAtcStore();
  const fetchFn = vi.fn(() => new Promise<Response>(() => undefined));
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  element.style.setProperty('--atc-chart-blue', '#111111');
  element.style.setProperty('--atc-chart-magenta', '#222222');
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

  expect(view.labels('.is-runway').sort()).toEqual(['05', '23']);
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

test('at zoom 11 a large airport is drawn as blue runway outlines only', () => {
  const long = { ...krdm, runways: [runway(end05, end23, 8070)] };
  const view = mount(11, [long]);
  const polygon = vi.spyOn(L, 'polygon');
  onTestFinished(() => polygon.mockRestore());

  view.chart();

  expect(polygon).toHaveBeenCalledTimes(1);
  expect(polygon.mock.calls[0]?.[1]).toMatchObject({
    fill: false,
    weight: 2,
    color: '#111111',
  });
  expect(view.labels()).toEqual([]);
});

test('at zoom 11 a smaller airport draws nothing', () => {
  const view = mount(11);
  const polygon = vi.spyOn(L, 'polygon');
  onTestFinished(() => polygon.mockRestore());

  view.chart();

  expect(polygon).not.toHaveBeenCalled();
});

test('an aircraft snapshot after surface loads start never redraws', () => {
  const view = mount(13);
  view.chart();
  const polygon = vi.spyOn(L, 'polygon');
  onTestFinished(() => polygon.mockRestore());

  view.store.applySnapshot({
    at: 1,
    aircraft: [
      {
        hex: 'aaaaaa',
        label: 'N352LL',
        callsign: null,
        registration: 'N352LL',
        typeCode: 'C172',
        category: null,
        kind: 'single',
        lat: 44.25,
        lon: -121.15,
        altitudeFt: 5000,
        onGround: false,
        groundSpeedKt: 110,
        trackDeg: 90,
        verticalRateFpm: 0,
      },
    ],
  });

  expect(view.fetchFn).toHaveBeenCalledTimes(1);
  expect(polygon).not.toHaveBeenCalled();
});
