// @vitest-environment jsdom
import * as module from 'leaflet';
import { expect, test, vi } from 'vitest';
import type { Aircraft } from '../../aircraft';
import type { ChartAirport, Runway, RunwayEnd } from '../../chart';
import { FALLBACK_AIRPORTS } from '../../places';
import { createAtcStore } from '../../store';
import { intersects } from '../tag-obstacles';
import { createAirportLayer } from './airport-layer';
import { placeChartLabels } from './chart-labels';

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

/**
 * A 400x300 Leaflet map over Bend (or `centre`) with the airport layer synced
 * to a store and its labels placed by the chart coordinator.
 */
function mount(zoom = 6, centre: [number, number] = [44.0946, -121.2002]) {
  const store = createAtcStore();
  const element = document.createElement('div');
  element.className = 'atc-map';
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  Object.defineProperty(element, 'clientHeight', { value: 300 });
  const map = L.map(element, {
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
  }).setView(centre, zoom);
  map.createPane('atc-airports');
  const layer = createAirportLayer({ L, map, store, pane: 'atc-airports' });
  const place = () =>
    placeChartLabels({
      sources: [layer],
      runwayBoxes: layer.runwayBoxes,
    });
  const sync = () => {
    if (layer.sync(store.getState())) place();
  };
  const unsubscribe = store.subscribe(sync);
  sync();
  map.on('zoomend moveend', () => {
    layer.redraw();
    place();
  });
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
  expect(view.count('.atc-apt.is-towered')).toBe(0);
  expect(view.count('.atc-apt.is-nontowered')).toBe(0);
  view.cleanup();
});

test('zooming to 10 adds the turf field', () => {
  const view = mount(6);
  view.store.setChart({ cycle: '2610', effective: '2026-09-03', airports });

  view.map.setZoom(10);

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
  expect(view.count('.atc-apt')).toBe(expected.length);
  expect(view.count('.atc-apt.is-fallback')).toBe(expected.length);
  expect(view.count('.is-towered')).toBe(0);
  const labels = [
    ...view.element.querySelectorAll('.atc-apt-block.is-fallback'),
  ].map((block) => block.textContent);
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every((label) => /^K[A-Z]{3}$/.test(label ?? ''))).toBe(true);
  view.cleanup();
});

const surveyed = (lengthFt: number): Runway => {
  const a = { id: '05', lat: 44.24, lon: -121.16 };
  const b = { id: '23', lat: 44.26, lon: -121.14 };
  return { ...runway(lengthFt, true), ends: [a, b], corners: [a, b, b, a] };
};

test('at zoom 10 KRDM with surveyed corners has no ring', () => {
  const view = mount(10);
  const krdm = (runways: Runway[]) => [{ ...base, runways }];
  view.store.setChart({
    cycle: '2610',
    effective: '2026-09-03',
    airports: krdm([runway(7038, true)]),
  });
  const without = view.count('.atc-apt');

  view.store.setChart({
    cycle: '2610',
    effective: '2026-09-03',
    airports: krdm([surveyed(7038), runway(3000, false)]),
  });

  expect(without).toBe(1);
  expect(view.count('.atc-apt')).toBe(0);
  expect(view.count('.atc-apt-block')).toBe(1);
  view.cleanup();
});

test('an airport whose only runway has no corners has exactly one ring', () => {
  const view = mount(10);

  view.store.setChart({
    cycle: '2610',
    effective: '2026-09-03',
    airports: [{ ...base, runways: [runway(7038, true)] }],
  });

  expect(view.count('.atc-apt')).toBe(1);
  view.cleanup();
});

test('an airport with no runways has a ring', () => {
  const view = mount(10);

  view.store.setChart({
    cycle: '2610',
    effective: '2026-09-03',
    airports: [{ ...base, runways: [] }],
  });

  expect(view.count('.atc-apt')).toBe(1);
  view.cleanup();
});

test('heliports and seaplane bases keep their ring even with surveyed corners', () => {
  const view = mount(10);
  const heli = { ...base, kind: 'heliport' as const, runways: [surveyed(60)] };
  const sea = {
    ...base,
    code: 'S60',
    kind: 'seaplane' as const,
    lat: 44.1,
    runways: [surveyed(3000)],
  };

  view.store.setChart({
    cycle: '2610',
    effective: '2026-09-03',
    airports: [heli, sea],
  });

  expect(view.count('.atc-apt')).toBe(2);
  view.cleanup();
});

test('at zoom 12 loaded surfaces leave the rings alone', () => {
  const view = mount(12);
  view.store.setChart({ cycle: '2610', effective: '2026-09-03', airports });
  const drawn = view.count('.atc-apt');

  view.store.setSurfaces('KBDN', { code: 'KBDN', source: 'faa', features: [] });

  expect(drawn).toBeGreaterThan(0);
  expect(view.count('.atc-apt')).toBe(drawn);
  view.cleanup();
});

test('the ident style applies at zoom 9 and not at zoom 14', () => {
  const regional = mount(9);
  regional.store.setChart({ cycle: '2610', effective: '2026-09-03', airports });
  const identAtNine = regional.count('.atc-apt-block > .is-ident');
  regional.cleanup();
  const close = mount(14);

  close.store.setChart({ cycle: '2610', effective: '2026-09-03', airports });

  expect(identAtNine).toBeGreaterThan(0);
  expect(close.count('.atc-apt-block')).toBeGreaterThan(0);
  expect(close.count('.is-ident')).toBe(0);
  close.cleanup();
});

test('at zoom 13 KRDM labels outside its crossing runways', () => {
  const view = mount(13, [44.2541, -121.15]);
  const end = (id: string, lat: number, lon: number) => ({ id, lat, lon });
  const crossing = (a: RunwayEnd, b: RunwayEnd, id: string): Runway => ({
    ...runway(7000, true),
    id,
    ends: [a, b],
    corners: [a, b, b, a],
  });
  const runways = [
    crossing(end('05', 44.2475, -121.165), end('23', 44.26, -121.135), '05/23'),
    crossing(end('11', 44.258, -121.168), end('29', 44.25, -121.135), '11/29'),
  ];
  const corners = runways.flatMap((r) => r.corners ?? []);
  const points = corners.map((c) =>
    view.map.latLngToContainerPoint([c.lat, c.lon]),
  );
  const extent = {
    left: Math.min(...points.map((p) => p.x)),
    top: Math.min(...points.map((p) => p.y)),
    right: Math.max(...points.map((p) => p.x)),
    bottom: Math.max(...points.map((p) => p.y)),
  };

  view.store.setChart({
    cycle: '2610',
    effective: '2026-09-03',
    airports: [{ ...base, runways }],
  });

  const block = view.element.querySelector<HTMLElement>('.atc-apt-block');
  const icon = block?.parentElement;
  const reference = view.map.latLngToContainerPoint([base.lat, base.lon]);
  const left = reference.x + parseFloat(icon?.style.marginLeft ?? 'NaN');
  const top = reference.y + parseFloat(icon?.style.marginTop ?? 'NaN');
  const request = view.layer.labelRequests().find((r) => r.id === 'apt:KRDM');
  const box = request?.candidates.find(
    (c) => Math.abs(c.left - left) < 1 && Math.abs(c.top - top) < 1,
  );
  expect(block).not.toBeNull();
  expect(box).toBeDefined();
  expect(box && intersects(box, extent)).toBe(false);
  view.cleanup();
});

test('at zoom 9 neither of two close airports labels over the other', () => {
  const view = mount(9);
  const near = (code: string, lon: number, rank: number): ChartAirport => ({
    ...base,
    code,
    faa: code,
    towered: false,
    lat: 44.0946,
    lon,
    rank,
  });
  const pair = [near('AAA', -121.23, 0), near('BBB', -121.17, 1)];

  view.store.setChart({
    cycle: '2610',
    effective: '2026-09-03',
    airports: pair,
  });

  const requests = view.layer.labelRequests();
  const boxes = view.layer.runwayBoxes();
  const placed = pair.map((airport) => {
    const point = view.map.latLngToContainerPoint([airport.lat, airport.lon]);
    const block = [...view.element.querySelectorAll('.atc-apt-block')].find(
      (b) => b.textContent === airport.faa,
    );
    const icon = block?.parentElement;
    const left = point.x + parseFloat(icon?.style.marginLeft ?? 'NaN');
    const top = point.y + parseFloat(icon?.style.marginTop ?? 'NaN');
    return requests
      .find((r) => r.id === `apt:${airport.code}`)
      ?.candidates.find(
        (c) => Math.abs(c.left - left) < 1 && Math.abs(c.top - top) < 1,
      );
  });
  expect(boxes).toHaveLength(2);
  expect(placed.every(Boolean)).toBe(true);
  const [aLabel, bLabel] = placed;
  const [aBox, bBox] = boxes;
  expect(aLabel && bBox && intersects(aLabel, bBox)).toBe(false);
  expect(bLabel && aBox && intersects(bLabel, aBox)).toBe(false);
  view.cleanup();
});
