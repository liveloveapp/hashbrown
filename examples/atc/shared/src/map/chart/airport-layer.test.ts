// @vitest-environment jsdom
import * as module from 'leaflet';
import { expect, test, vi } from 'vitest';
import type { Aircraft } from '../../aircraft';
import type { ChartAirport, Runway } from '../../chart';
import { FALLBACK_AIRPORTS } from '../../places';
import { createAtcStore } from '../../store';
import { createAirportLayer } from './airport-layer';

const L = (module as unknown as { default?: typeof module }).default ?? module;

const runway = (lengthFt: number, hard: boolean): Runway => ({
  id: '05/23',
  lengthFt,
  widthFt: 100,
  surface: hard ? 'ASPH' : 'TURF',
  hard,
  ends: null,
  corners: null,
  bearingDeg: 50,
});

const base: ChartAirport = {
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
  runways: [runway(7038, true)],
  rank: 0,
};
const airports: ChartAirport[] = [
  base,
  {
    ...base,
    code: 'KBDN',
    faa: 'BDN',
    name: 'BEND MUNI',
    lat: 44.0946,
    lon: -121.2002,
    towered: false,
    runways: [runway(5200, true)],
    rank: 1,
  },
  {
    ...base,
    code: '5S0',
    faa: '5S0',
    name: 'TURF FIELD',
    lat: 44.12,
    lon: -121.28,
    towered: false,
    fuel: false,
    runways: [runway(2000, false)],
    rank: 2,
  },
];
const plane: Aircraft = {
  hex: 'aaaaaa',
  label: 'N352LL',
  callsign: null,
  registration: 'N352LL',
  typeCode: 'C172',
  category: null,
  kind: 'single',
  lat: 44.1,
  lon: -121.2,
  altitudeFt: 5000,
  onGround: false,
  groundSpeedKt: 110,
  trackDeg: 90,
  verticalRateFpm: 0,
};

/** A 400x300 Leaflet map over Bend with the airport layer synced to a store. */
function mount(zoom = 6) {
  const store = createAtcStore();
  const element = document.createElement('div');
  element.className = 'atc-map';
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  const map = L.map(element, {
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
  }).setView([44.0946, -121.2002], zoom);
  map.createPane('atc-airports');
  const layer = createAirportLayer({ L, map, store, pane: 'atc-airports' });
  const unsubscribe = store.subscribe(() => layer.sync(store.getState()));
  layer.sync(store.getState());
  const count = (selector: string) => element.querySelectorAll(selector).length;

  return {
    store,
    map,
    layer,
    element,
    count,
    cleanup: () => {
      unsubscribe();
      layer.destroy();
      map.remove();
    },
  };
}

test('zoom 6 draws the towered field and the long hard runway only', () => {
  const view = mount(6);

  view.store.setChart({ cycle: '2610', effective: '2026-09-03', airports });

  expect(view.count('.atc-apt')).toBe(2);
  expect(view.count('.atc-apt.is-towered')).toBe(1);
  expect(view.count('.atc-apt.is-nontowered')).toBe(1);
  view.cleanup();
});

test('zooming to 10 adds the turf field', () => {
  const view = mount(6);
  view.store.setChart({ cycle: '2610', effective: '2026-09-03', airports });

  view.map.setZoom(10);
  view.layer.redraw();

  expect(view.count('.atc-apt')).toBe(3);
  expect(view.count('.atc-apt-block')).toBeGreaterThan(0);
  view.cleanup();
});

test('turning the airports layer off removes every symbol and block', () => {
  const view = mount(10);
  view.store.setChart({ cycle: '2610', effective: '2026-09-03', airports });

  view.store.setLayers({ airports: false });

  expect(view.count('.atc-apt')).toBe(0);
  expect(view.count('.atc-apt-block')).toBe(0);
  view.cleanup();
});

test('an aircraft snapshot never re-creates airport markers', () => {
  const view = mount(10);
  view.store.setChart({ cycle: '2610', effective: '2026-09-03', airports });
  const before = view.element.querySelector('.atc-apt');
  const marker = vi.spyOn(L, 'marker');
  const measured = vi.spyOn(view.map, 'getBounds');

  view.store.applySnapshot({ at: 1, aircraft: [plane] });
  view.store.applySnapshot({ at: 2, aircraft: [plane] });

  expect(marker).not.toHaveBeenCalled();
  expect(measured).not.toHaveBeenCalled();
  expect(view.element.querySelector('.atc-apt')).toBe(before);
  marker.mockRestore();
  measured.mockRestore();
  view.cleanup();
});

test('a limited chart draws fallback rings with ident-only labels', () => {
  const view = mount(6);
  const near = view.map.getBounds().pad(0.5);
  const expected = FALLBACK_AIRPORTS.filter(({ lat, lon }) =>
    near.contains([lat, lon]),
  );

  view.store.setChartLimited();

  expect(expected.length).toBeGreaterThan(1);
  expect(view.count('.atc-apt.is-fallback')).toBe(expected.length);
  expect(view.count('.is-towered')).toBe(0);
  const labels = [
    ...view.element.querySelectorAll('.atc-apt-block.is-fallback'),
  ].map((block) => block.textContent);
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every((label) => /^K[A-Z]{3}$/.test(label ?? ''))).toBe(true);
  view.cleanup();
});

test('at zoom 12 a symbol hides only once its surfaces have loaded', () => {
  const view = mount(12);
  view.store.setChart({ cycle: '2610', effective: '2026-09-03', airports });
  const drawn = view.count('.atc-apt');

  view.store.setSurfaces('KBDN', 'loading');
  const whileLoading = view.count('.atc-apt');
  view.store.setSurfaces('KBDN', { code: 'KBDN', source: 'faa', features: [] });

  expect(whileLoading).toBe(drawn);
  expect(view.count('.atc-apt')).toBe(drawn - 1);
  view.cleanup();
});

test('below zoom 12 loaded surfaces leave the symbol alone', () => {
  const view = mount(11);
  view.store.setChart({ cycle: '2610', effective: '2026-09-03', airports });
  const drawn = view.count('.atc-apt');

  view.store.setSurfaces('KBDN', { code: 'KBDN', source: 'faa', features: [] });

  expect(view.count('.atc-apt')).toBe(drawn);
  view.cleanup();
});

test('at zoom 11 a large airport with runway outlines hides its symbol', () => {
  const view = mount(11);
  const a = { id: '05', lat: 44.09, lon: -121.21 };
  const b = { id: '23', lat: 44.1, lon: -121.19 };
  const long: Runway = {
    ...runway(8070, true),
    ends: [a, b],
    corners: [a, b, b, a],
  };
  const large = airports.map((airport) =>
    airport.code === 'KBDN' ? { ...airport, runways: [long] } : airport,
  );
  view.store.setChart({ cycle: '2610', effective: '2026-09-03', airports });
  const drawn = view.count('.atc-apt');

  view.store.setChart({
    cycle: '2610',
    effective: '2026-09-03',
    airports: large,
  });

  expect(view.count('.atc-apt')).toBe(drawn - 1);
  view.map.setZoom(12);
  view.layer.redraw();
  expect(view.count('.atc-apt')).toBe(drawn);
  view.cleanup();
});
