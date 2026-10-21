import { expect, onTestFinished, test, vi } from 'vitest';
import type { Aircraft } from './aircraft';
import type { AirspaceShelf } from './chart';
import type { FindAircraftInput, MapFilter } from './find-aircraft';
import { createAtcStore, INITIAL_STATE } from './store';
import {
  squareRing,
  testAircraft,
  testChartAirport,
  testShelf,
} from './testing';
import { ATC_TOOL_DEFINITIONS, ATC_TOOL_NAMES } from './tool-definitions';
import { createAtcTools, whenAirspaceSettled, whenChartSettled } from './tools';

function plane(hex: string, overrides: Partial<Aircraft> = {}): Aircraft {
  return testAircraft({
    hex,
    lat: 44.0946,
    lon: -121.2002,
    altitudeFt: 30000,
    groundSpeedKt: 450,
    ...overrides,
  });
}

const any: FindAircraftInput = {
  airline: null,
  typeCode: null,
  kind: null,
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: null,
  near: null,
  inAirspace: null,
  sortBy: 'altitude',
  limit: 20,
};

const NO_MAP_FILTER: MapFilter = {
  airline: null,
  typeCode: null,
  kind: null,
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: null,
  near: null,
  inAirspace: null,
};

function readyStore() {
  const store = createAtcStore();
  store.setChart({
    cycle: '2610',
    effective: '2026-10-08',
    airports: [testChartAirport()],
  });

  return store;
}

const sisters = testChartAirport({
  code: '6K5',
  faa: '6K5',
  name: 'SISTERS EAGLE AIR',
  city: 'SISTERS',
  aliases: [],
  lat: 44.288,
  lon: -121.54,
  towered: false,
  rank: 40,
});

const pdxShelves: readonly AirspaceShelf[] = [
  testShelf(),
  testShelf({
    id: 'KPDX-E2-0',
    name: 'PORTLAND E2',
    class: 'E',
    type: 'E2',
    floor: { ft: 0, ref: 'SFC' },
    ceiling: null,
  }),
];

const rdmShelf = testShelf({
  id: 'KRDM-D-0',
  airport: 'KRDM',
  name: 'REDMOND CLASS D',
  class: 'D',
  type: 'D',
  floor: { ft: 0, ref: 'SFC' },
  ceiling: { ft: 6000, exclusive: false },
  partTime: true,
  rings: [squareRing(-121.15, 44.25, 0.15)],
});

function airspaceStore(shelves: readonly AirspaceShelf[] = pdxShelves) {
  const store = readyStore();
  store.setAirspace({ cycle: '2610', effective: '2026-10-08', shelves });

  return store;
}

test('findAircraft refuses an airport outside the table', async () => {
  const store = createAtcStore();
  store.applySnapshot({ at: 1, aircraft: [plane('aaaaaa')] });
  const tools = createAtcTools({
    store,
    fetchRoute: async () => null,
    // A loading chart would make the tool wait; the fallback table is enough.
    chartWaitMs: 0,
  });

  const result = await tools.findAircraft.handler({
    ...any,
    near: { airport: 'KJFK', radiusNm: 25 },
  });

  expect(result).toEqual({
    found: false,
    reason:
      'No airport matches "KJFK". atc covers airports in the Pacific Northwest only.',
  });
});

test('the findAircraft tool with near shows and outlines that area, once', async () => {
  const store = createAtcStore();
  const tools = createAtcTools({
    store,
    fetchRoute: async () => null,
    chartWaitMs: 0,
  });
  const near = { airport: 'kbdn', radiusNm: 30 };

  await tools.findAircraft.handler({ ...any, near });
  const first = store.getState();
  await tools.findAircraft.handler({ ...any, near, kind: 'single' });

  expect(first.shownArea).toEqual({ airport: 'KBDN', radiusNm: 30 });
  expect(first.viewRequest?.kind).toBe('area');
  expect(store.getState().viewSeq).toBe(first.viewSeq);
});

test('findAircraft with an unknown approaching airport finds nothing', async () => {
  const store = createAtcStore();
  store.applySnapshot({ at: 1, aircraft: [plane('a1')] });
  const tools = createAtcTools({
    store,
    fetchRoute: async () => null,
    chartWaitMs: 0,
  });

  const rows = await tools.findAircraft.handler({
    ...any,
    approaching: 'KJFK',
  });

  expect(rows).toEqual({ mapFilter: null, aircraft: [] });
});

test('findAircraft with inAirspace keeps aircraft inside that class and measures from the airport', async () => {
  const store = airspaceStore([...pdxShelves, rdmShelf]);
  store.applySnapshot({
    at: 1,
    aircraft: [
      plane('aaaaaa', { lat: 44.25, lon: -121.15, altitudeFt: 3000 }),
      plane('bbbbbb', { lat: 44.25, lon: -121.15, altitudeFt: 9000 }),
      plane('cccccc', { lat: 45.5, lon: -121.5, altitudeFt: 3000 }),
    ],
  });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.findAircraft.handler({
    ...any,
    inAirspace: { airport: 'KRDM', class: 'D' },
  });

  expect(result).toMatchObject({
    aircraft: [{ hex: 'aaaaaa', distanceNm: 0.2 }],
  });
  expect(store.getState().highlightedAirspace).toBe('KRDM');
});

test('findAircraft with near and inAirspace leaves the airspace highlighted', async () => {
  const store = airspaceStore([...pdxShelves, rdmShelf]);
  store.applySnapshot({
    at: 1,
    aircraft: [plane('aaaaaa', { lat: 44.25, lon: -121.15, altitudeFt: 3000 })],
  });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  await tools.findAircraft.handler({
    ...any,
    near: { airport: 'KRDM', radiusNm: 25 },
    inAirspace: { airport: 'KRDM', class: 'D' },
  });

  expect(store.getState().highlightedAirspace).toBe('KRDM');
  expect(store.getState().viewRequest?.kind).toBe('airspace');
});

test('findAircraft with a valid near and a refused inAirspace leaves the map alone', async () => {
  const store = airspaceStore([...pdxShelves, rdmShelf]);
  const tools = createAtcTools({ store, fetchRoute: async () => null });
  const before = store.getState();

  const result = await tools.findAircraft.handler({
    ...any,
    near: { airport: 'KRDM', radiusNm: 25 },
    inAirspace: { airport: 'KRDM', class: 'C' },
  });

  const after = store.getState();
  expect(result).toEqual({
    found: false,
    reason: 'KRDM has no Class C airspace.',
  });
  expect(after.shownArea).toBe(before.shownArea);
  expect(after.highlightedAirspace).toBe(before.highlightedAirspace);
  expect(after.viewRequest).toBe(before.viewRequest);
});

test('findAircraft with near and inAirspace makes exactly one view request', async () => {
  const store = airspaceStore([...pdxShelves, rdmShelf]);
  const tools = createAtcTools({ store, fetchRoute: async () => null });
  const before = store.getState().viewSeq;

  await tools.findAircraft.handler({
    ...any,
    near: { airport: 'KRDM', radiusNm: 25 },
    inAirspace: { airport: 'KRDM', class: 'D' },
  });

  expect(store.getState().viewSeq).toBe(before + 1);
  expect(store.getState().viewRequest?.kind).toBe('airspace');
});

test('findAircraft with inAirspace refuses while airspace is unavailable', async () => {
  const store = readyStore();
  store.setAirspaceFailed();
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.findAircraft.handler({
    ...any,
    inAirspace: { airport: 'KPDX', class: null },
  });

  expect(result).toEqual({
    found: false,
    reason: 'Airspace data is unavailable right now.',
  });
});

test('findAircraft with inAirspace refuses a class the airport does not have', async () => {
  const store = airspaceStore([...pdxShelves, rdmShelf]);
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.findAircraft.handler({
    ...any,
    inAirspace: { airport: 'Redmond', class: 'C' },
  });

  expect(result).toEqual({
    found: false,
    reason: 'KRDM has no Class C airspace.',
  });
  expect(store.getState().highlightedAirspace).toBeNull();
});

test('findAircraft with inAirspace refuses an airport with no airspace', async () => {
  const store = airspaceStore([...pdxShelves, rdmShelf]);
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.findAircraft.handler({
    ...any,
    inAirspace: { airport: 'KBDN', class: null },
  });

  expect(result).toEqual({
    found: false,
    reason: 'KBDN has no Class B, C, D or E surface airspace.',
  });
  expect(store.getState().highlightedAirspace).toBeNull();
});

test('getSelectedAircraft returns a row for a hex-only aircraft', async () => {
  const store = createAtcStore();
  store.applySnapshot({
    at: 1,
    aircraft: [
      plane('ffffff', {
        label: 'FFFFFF',
        callsign: null,
        registration: null,
        typeCode: null,
        category: null,
        kind: 'jet',
      }),
    ],
  });
  store.select('ffffff');
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const row = await tools.getSelectedAircraft.handler();

  expect(row).toMatchObject({
    label: 'FFFFFF',
    callsign: null,
    registration: null,
    airline: null,
    aircraftType: 'Unknown type',
  });
});

test('findAircraft intersects its input with the map filter and reports the summary', async () => {
  const store = readyStore();
  store.applySnapshot({
    at: 1,
    aircraft: [
      plane('aaaaaa', { kind: 'jet', altitudeFt: 5000 }),
      plane('bbbbbb', { kind: 'jet', altitudeFt: 30000 }),
      plane('cccccc', { kind: 'single', altitudeFt: 5000 }),
      plane('dddddd', { kind: 'jet', altitudeFt: 8000 }),
    ],
  });
  store.setMapFilter({ ...NO_MAP_FILTER, kind: 'jet', maxAltitudeFt: 10000 });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.findAircraft.handler({
    ...any,
    sortBy: 'altitude',
    limit: 1,
  });

  expect(result).toMatchObject({
    mapFilter: 'jets below 10,000 ft',
    aircraft: [{ hex: 'dddddd' }],
  });
});

test('findAircraft without a map filter reports a null summary', async () => {
  const store = readyStore();
  store.applySnapshot({ at: 1, aircraft: [plane('aaaaaa')] });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.findAircraft.handler(any);

  expect(result).toMatchObject({
    mapFilter: null,
    aircraft: [{ hex: 'aaaaaa' }],
  });
});

test('findAircraft with a filter that matches nothing returns an empty list with the summary', async () => {
  const store = readyStore();
  store.applySnapshot({ at: 1, aircraft: [plane('aaaaaa', { kind: 'jet' })] });
  store.setMapFilter({ ...NO_MAP_FILTER, kind: 'rotor' });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.findAircraft.handler(any);

  expect(result).toEqual({ mapFilter: 'helicopters', aircraft: [] });
});

test('getSelectedAircraft ignores the map filter', async () => {
  const store = readyStore();
  store.applySnapshot({ at: 1, aircraft: [plane('aaaaaa', { kind: 'jet' })] });
  store.setMapFilter({ ...NO_MAP_FILTER, kind: 'rotor' });
  store.select('aaaaaa');
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const selected = await tools.getSelectedAircraft.handler();

  expect(selected?.hex).toBe('aaaaaa');
});

test('setMapFilter applies a validated filter and reports unknown places', async () => {
  const store = readyStore();
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.setMapFilter.handler({
    ...NO_MAP_FILTER,
    kind: 'jet',
    approaching: 'KZZZ',
  });

  expect(result).toEqual({
    applied: true,
    mapFilter: 'jets approaching KZZZ',
    unknownPlaces: ['KZZZ'],
  });
  expect(store.getState().mapFilter?.filter.kind).toBe('jet');
});

test('setMapFilter replaces an existing filter', async () => {
  const store = readyStore();
  store.setMapFilter({ ...NO_MAP_FILTER, kind: 'jet' });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.setMapFilter.handler({
    ...NO_MAP_FILTER,
    kind: 'rotor',
  });

  expect(result).toMatchObject({ applied: true, mapFilter: 'helicopters' });
  expect(store.getState().mapFilter?.filter.kind).toBe('rotor');
});

test('a setMapFilter waiting for the chart never overwrites a newer filter', async () => {
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const store = createAtcStore();
  store.setMapFilter({ ...NO_MAP_FILTER, kind: 'jet' });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const pending = tools.setMapFilter.handler({
    ...NO_MAP_FILTER,
    kind: 'rotor',
  });
  await tools.clearMapFilter.handler();
  store.setChart({
    cycle: '2610',
    effective: '2026-10-08',
    airports: [testChartAirport()],
  });
  const result = await pending;

  expect(result).toEqual({
    applied: false,
    mapFilter: null,
    unknownPlaces: [],
  });
  expect(store.getState().mapFilter).toBeNull();
});

test('clearMapFilter removes the filter', async () => {
  const store = readyStore();
  store.setMapFilter({ ...NO_MAP_FILTER, kind: 'jet' });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.clearMapFilter.handler();

  expect(result).toEqual({ cleared: true });
  expect(store.getState().mapFilter).toBeNull();
});

test('getSelectedAircraft returns the selected row or null', async () => {
  const store = createAtcStore();
  store.applySnapshot({ at: 1, aircraft: [plane('aaaaaa')] });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const before = await tools.getSelectedAircraft.handler();
  store.select('aaaaaa');
  const after = await tools.getSelectedAircraft.handler();

  expect(before).toBeNull();
  expect(after?.hex).toBe('aaaaaa');
});

test('lookupRoute caches routes, including misses', async () => {
  const store = createAtcStore();
  const fetchRoute = vi.fn(async () => null);
  const tools = createAtcTools({ store, fetchRoute });

  const first = await tools.lookupRoute.handler({ callsign: 'ual100' });
  await tools.lookupRoute.handler({ callsign: 'UAL100' });

  expect(first).toEqual({
    found: false,
    reason: 'No scheduled route is published for UAL100.',
  });
  expect(fetchRoute).toHaveBeenCalledTimes(1);
  expect(store.getState().routes.get('UAL100')).toBeNull();
});

test('lookupRoute does not cache a failed lookup, so the next call retries', async () => {
  const store = createAtcStore();
  const fetchRoute = vi
    .fn<(callsign: string) => Promise<null>>()
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(null);
  const tools = createAtcTools({ store, fetchRoute });

  const failed = await tools.lookupRoute.handler({ callsign: 'UAL100' });
  const cachedAfterFailure = store.getState().routes.has('UAL100');
  await tools.lookupRoute.handler({ callsign: 'UAL100' });

  expect(failed).toEqual({
    found: false,
    reason: 'The route lookup failed. Try again.',
  });
  expect(cachedAfterFailure).toBe(false);
  expect(fetchRoute).toHaveBeenCalledTimes(2);
});

test('lookupRoute skips callsigns that are not airline flights', async () => {
  const store = createAtcStore();
  const fetchRoute = vi.fn(async () => null);
  const tools = createAtcTools({ store, fetchRoute });

  const results = [
    await tools.lookupRoute.handler({ callsign: 'N352LL' }),
    await tools.lookupRoute.handler({ callsign: 'a1c00b' }),
  ];

  expect(results).toEqual([
    { found: false, reason: 'Routes exist only for airline callsigns.' },
    { found: false, reason: 'Routes exist only for airline callsigns.' },
  ]);
  expect(fetchRoute).not.toHaveBeenCalled();
});

test('map tools update the store and report unknown aircraft', async () => {
  const store = createAtcStore();
  store.applySnapshot({ at: 1, aircraft: [plane('aaaaaa')] });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const highlighted = await tools.highlightAircraft.handler({
    hexes: ['AAAAAA', 'aaaaaa', 'ffffff'],
  });
  const followed = await tools.followAircraft.handler({ hex: 'ffffff' });
  const following = await tools.followAircraft.handler({ hex: 'aaaaaa' });
  await tools.clearHighlight.handler();

  expect(highlighted).toEqual({ highlighted: 1, unknown: ['ffffff'] });
  expect(followed).toEqual({
    following: false,
    reason: 'No aircraft with hex ffffff is on the map.',
  });
  expect(following).toEqual({ following: true });
  expect(store.getState().followingHex).toBe('aaaaaa');
  expect(store.getState().highlighted.size).toBe(0);
});

test('highlighting a set with an unknown hex keeps the shown area', async () => {
  const store = createAtcStore();
  store.applySnapshot({ at: 1, aircraft: [plane('aaaaaa')] });
  const tools = createAtcTools({
    store,
    fetchRoute: async () => null,
    chartWaitMs: 0,
  });
  await tools.showArea.handler({ airport: 'KBDN', radiusNm: 25 });
  const shown = store.getState();

  const result = await tools.highlightAircraft.handler({
    hexes: ['aaaaaa', 'ffffff'],
  });

  expect(result).toEqual({ highlighted: 1, unknown: ['ffffff'] });
  expect(store.getState().shownArea).toEqual({
    airport: 'KBDN',
    radiusNm: 25,
  });
  expect(store.getState().viewSeq).toBe(shown.viewSeq);
  expect([...store.getState().highlighted]).toEqual(['aaaaaa']);
});

test('lookupPlace resolves a place or tells the model it is unknown', async () => {
  const tools = createAtcTools({
    store: createAtcStore(),
    fetchRoute: async () => null,
    chartWaitMs: 0,
  });

  const bend = await tools.lookupPlace.handler({ query: 'Bend' });
  const tokyo = await tools.lookupPlace.handler({ query: 'Tokyo' });

  expect(bend).toEqual({
    found: true,
    code: 'KBDN',
    faa: 'BDN',
    name: 'Bend Municipal',
    city: 'Bend, OR',
    towered: null,
  });
  expect(tokyo).toEqual({
    found: false,
    reason:
      'No airport matches "Tokyo". atc covers airports in the Pacific Northwest only.',
  });
});

test('lookupPlace reports whether the airport has a tower', async () => {
  const store = readyStore();
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.lookupPlace.handler({ query: 'Redmond' });

  expect(result).toMatchObject({ found: true, code: 'KRDM', towered: true });
});

test('showArea draws the area, moves the map and counts the aircraft inside', async () => {
  const store = createAtcStore();
  store.applySnapshot({
    at: 1,
    aircraft: [
      plane('aaaaaa', { lat: 44.0946, lon: -121.2002 }),
      plane('bbbbbb', { lat: 47.45, lon: -122.31 }),
    ],
  });
  const tools = createAtcTools({
    store,
    fetchRoute: async () => null,
    chartWaitMs: 0,
  });

  const shown = await tools.showArea.handler({
    airport: 'bend',
    radiusNm: null,
  });
  const clamped = await tools.showArea.handler({
    airport: 'KSEA',
    radiusNm: 900,
  });

  expect(shown).toEqual({
    shown: true,
    airport: 'KBDN',
    radiusNm: 25,
    aircraftInside: 1,
    moved: true,
  });
  expect(clamped).toMatchObject({ airport: 'KSEA', radiusNm: 150 });
  expect(store.getState().shownArea).toEqual({
    airport: 'KSEA',
    radiusNm: 150,
  });
});

test('showArea refuses unknown places and leaves the map alone', async () => {
  const store = createAtcStore();
  const tools = createAtcTools({
    store,
    fetchRoute: async () => null,
    chartWaitMs: 0,
  });

  const result = await tools.showArea.handler({
    airport: 'Tokyo',
    radiusNm: 25,
  });

  expect(result).toEqual({
    shown: false,
    reason:
      'No airport matches "Tokyo". atc covers airports in the Pacific Northwest only.',
  });
  expect(store.getState()).toBe(INITIAL_STATE);
});

test('while following, showArea and resetMap change the outline but report that the map stays on the plane', async () => {
  const store = createAtcStore();
  store.applySnapshot({ at: 1, aircraft: [plane('aaaaaa')] });
  store.follow('aaaaaa');
  const tools = createAtcTools({
    store,
    fetchRoute: async () => null,
    chartWaitMs: 0,
  });

  const shown = await tools.showArea.handler({
    airport: 'KBDN',
    radiusNm: 10,
  });
  const reset = await tools.resetMap.handler();

  expect(shown).toMatchObject({
    shown: true,
    moved: false,
    reason: 'Following UAL100. Call stopFollowing first to move the map.',
  });
  expect(reset).toEqual({
    reset: true,
    moved: false,
    reason: 'Following UAL100. Call stopFollowing first to move the map.',
  });
  expect(store.getState().shownArea).toBeNull();
});

test('resetMap returns to the home view', async () => {
  const store = createAtcStore();
  const tools = createAtcTools({
    store,
    fetchRoute: async () => null,
    chartWaitMs: 0,
  });
  await tools.showArea.handler({ airport: 'KBDN', radiusNm: 25 });

  const result = await tools.resetMap.handler();

  expect(result).toEqual({ reset: true, moved: true });
  expect(store.getState().shownArea).toBeNull();
  expect(store.getState().viewRequest?.kind).toBe('reset');
});

test('showAirport shows the airport and returns its FAA facts', async () => {
  const store = readyStore();
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.showAirport.handler({ airport: 'Redmond' });

  expect(result).toMatchObject({
    shown: true,
    code: 'KRDM',
    towered: true,
    elevationFt: 3082,
    diagram: 'runways-only',
    moved: true,
  });
  expect(result).toHaveProperty('runways.0.id', '05/23');
  expect(store.getState().viewRequest?.kind).toBe('airport');
});

test('showAirport reports the diagram source and nearby aircraft', async () => {
  const store = readyStore();
  store.setSurfaces('KRDM', { code: 'KRDM', source: 'faa', features: [] });
  store.applySnapshot({
    at: 1,
    aircraft: [
      plane('aaaaaa', { lat: 44.26, lon: -121.15 }),
      plane('bbbbbb', { lat: 47.5, lon: -122.3 }),
    ],
  });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.showAirport.handler({ airport: 'KRDM' });

  expect(result).toMatchObject({ diagram: 'faa', aircraftWithin3Nm: 1 });
});

test('while following, showAirport reports that the map stays on the plane', async () => {
  const store = readyStore();
  store.applySnapshot({ at: 1, aircraft: [plane('aaaaaa')] });
  store.follow('aaaaaa');
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.showAirport.handler({ airport: 'KRDM' });

  expect(result).toMatchObject({
    shown: true,
    moved: false,
    reason: 'Following UAL100. Call stopFollowing first to move the map.',
  });
  expect(store.getState().viewRequest).toBeNull();
});

test('showAirport refuses unknown airports', async () => {
  const store = createAtcStore();
  const tools = createAtcTools({
    store,
    fetchRoute: async () => null,
    chartWaitMs: 0,
  });

  const result = await tools.showAirport.handler({ airport: 'Tokyo' });

  expect(result).toMatchObject({ shown: false });
  expect(store.getState().viewRequest).toBeNull();
});

test('showAirport waits for loadSurfaces and reports the loaded diagram', async () => {
  const store = readyStore();
  const loadSurfaces = vi.fn(async (code: string) => {
    store.setSurfaces(code, { code, source: 'faa', features: [] });
  });
  const tools = createAtcTools({
    store,
    fetchRoute: async () => null,
    loadSurfaces,
  });

  const result = await tools.showAirport.handler({ airport: 'KRDM' });

  expect(loadSurfaces).toHaveBeenCalledWith('KRDM');
  expect(result).toMatchObject({ diagram: 'faa' });
});

test('showAirport reports loading when surfaces take longer than 3 s', async () => {
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const store = readyStore();
  const tools = createAtcTools({
    store,
    fetchRoute: async () => null,
    loadSurfaces: (code) => {
      store.setSurfaces(code, 'loading');
      return new Promise(() => undefined);
    },
  });
  let settled = false;

  const pending = tools.showAirport.handler({ airport: 'KRDM' }).then((r) => {
    settled = true;
    return r;
  });
  await vi.advanceTimersByTimeAsync(2999);
  const settledEarly = settled;
  await vi.advanceTimersByTimeAsync(1);
  const result = await pending;

  expect(settledEarly).toBe(false);
  expect(result).toMatchObject({ shown: true, diagram: 'loading' });
});

test('showAirspace shows the airspace and counts the aircraft inside', async () => {
  const store = airspaceStore();
  store.applySnapshot({
    at: 1,
    aircraft: [
      plane('aaaaaa', { lat: 45.5, lon: -121.5, altitudeFt: 3000 }),
      plane('bbbbbb', { lat: 45.5, lon: -121.5, altitudeFt: 20000 }),
      plane('cccccc', { lat: 47.5, lon: -122.3, altitudeFt: 3000 }),
    ],
  });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.showAirspace.handler({ airport: 'Portland' });

  expect(result).toEqual({
    shown: true,
    code: 'KPDX',
    classes: ['C', 'E2'],
    shelves: [
      { type: 'C', floor: '1,100 MSL', ceiling: '4,000 MSL', partTime: false },
      {
        type: 'E2',
        floor: 'SFC',
        ceiling: 'up to overlying airspace',
        partTime: false,
      },
    ],
    aircraftInside: 1,
    moved: true,
  });
  expect(store.getState().highlightedAirspace).toBe('KPDX');
  expect(store.getState().viewRequest?.kind).toBe('airspace');
});

test('while following, showAirspace reports that the map stays on the plane', async () => {
  const store = airspaceStore();
  store.applySnapshot({ at: 1, aircraft: [plane('aaaaaa')] });
  store.follow('aaaaaa');
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.showAirspace.handler({ airport: 'KPDX' });

  expect(result).toMatchObject({
    shown: true,
    moved: false,
    reason: 'Following UAL100. Call stopFollowing first to move the map.',
  });
  expect(store.getState().viewRequest).toBeNull();
});

test('showAirspace says so when the airport has no shelves', async () => {
  const store = airspaceStore([rdmShelf]);
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.showAirspace.handler({ airport: 'KPDX' });

  expect(result).toEqual({
    shown: false,
    reason: 'KPDX has no Class B, C, D or E surface airspace.',
  });
  expect(store.getState().highlightedAirspace).toBeNull();
});

test('showAirspace refuses when the airspace data failed', async () => {
  const store = readyStore();
  store.setAirspaceFailed();
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.showAirspace.handler({ airport: 'KPDX' });

  expect(result).toEqual({
    shown: false,
    reason: 'Airspace data is unavailable right now.',
  });
});

test('showAirspace refuses unknown airports', async () => {
  const store = airspaceStore();
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.showAirspace.handler({ airport: 'Tokyo' });

  expect(result).toMatchObject({ shown: false });
  expect(store.getState().highlightedAirspace).toBeNull();
});

test('showAirspace reads an exclusive ceiling as below it', async () => {
  const seattleD: AirspaceShelf = {
    ...rdmShelf,
    partTime: false,
    ceiling: { ft: 3000, exclusive: true },
  };
  const store = airspaceStore([seattleD]);
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.showAirspace.handler({ airport: 'KRDM' });

  expect(result).toMatchObject({
    shown: true,
    shelves: [
      { type: 'D', floor: 'SFC', ceiling: 'below 3,000 MSL', partTime: false },
    ],
  });
});

test('airspaceAt names the airspace around an aircraft on the ground at KRDM', async () => {
  const store = airspaceStore([...pdxShelves, rdmShelf]);
  store.applySnapshot({
    at: 1,
    aircraft: [
      plane('aaaaaa', {
        lat: 44.25,
        lon: -121.15,
        onGround: true,
        altitudeFt: null,
      }),
    ],
  });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.airspaceAt.handler({ hex: 'AAAAAA' });

  expect(result).toEqual({
    found: true,
    label: 'UAL100',
    altitudeFt: 0,
    altitudeSource: 'ground',
    airspace: [{ airport: 'KRDM', type: 'D', partTime: true }],
  });
});

test('airspaceAt reports no airspace outside every shelf', async () => {
  const store = airspaceStore();
  store.applySnapshot({
    at: 1,
    aircraft: [plane('aaaaaa', { lat: 47.5, lon: -122.3 })],
  });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.airspaceAt.handler({ hex: 'aaaaaa' });

  expect(result).toMatchObject({
    found: true,
    altitudeFt: 30000,
    altitudeSource: 'baro',
    airspace: [],
  });
});

test('airspaceAt refuses an unknown hex and failed airspace', async () => {
  const store = airspaceStore();
  const failed = readyStore();
  failed.setAirspaceFailed();
  const tools = createAtcTools({ store, fetchRoute: async () => null });
  const down = createAtcTools({ store: failed, fetchRoute: async () => null });

  const unknown = await tools.airspaceAt.handler({ hex: 'ABCDEF' });
  const refused = await down.airspaceAt.handler({ hex: 'ABCDEF' });

  expect(unknown).toEqual({
    found: false,
    reason: 'No aircraft with hex abcdef is on the map.',
  });
  expect(refused).toEqual({
    found: false,
    reason: 'Airspace data is unavailable right now.',
  });
});

test('setLayers applies a layer and returns the layers', async () => {
  const store = createAtcStore();
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.setLayers.handler({
    airports: false,
    airspace: null,
  });

  expect(result).toEqual({ layers: { airports: false, airspace: true } });
});

test('setLayers with null leaves the layers as they are', async () => {
  const store = createAtcStore();
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.setLayers.handler({
    airports: null,
    airspace: null,
  });

  expect(result).toEqual({ layers: { airports: true, airspace: true } });
  expect(store.getState()).toBe(INITIAL_STATE);
});

test('setLayers applies the airspace layer', async () => {
  const store = createAtcStore();
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.setLayers.handler({
    airports: null,
    airspace: false,
  });

  expect(result).toEqual({ layers: { airports: true, airspace: false } });
});

test('chart tools wait for a chart that loads within 5 s and use it', async () => {
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const store = createAtcStore();
  const tools = createAtcTools({ store, fetchRoute: async () => null });
  setTimeout(
    () =>
      store.setChart({
        cycle: '2610',
        effective: '2026-10-08',
        airports: [sisters],
      }),
    1000,
  );

  const pending = Promise.all([
    tools.lookupPlace.handler({ query: '6K5' }),
    tools.findAircraft.handler({
      ...any,
      near: { airport: '6K5', radiusNm: 10 },
    }),
    tools.showArea.handler({ airport: '6K5', radiusNm: null }),
    tools.showAirport.handler({ airport: '6K5' }),
  ]);
  await vi.advanceTimersByTimeAsync(1000);
  const [place, found, area, airport] = await pending;

  expect(place).toMatchObject({ found: true, code: '6K5', towered: false });
  expect(found).toEqual({ mapFilter: null, aircraft: [] });
  expect(area).toMatchObject({ shown: true, airport: '6K5' });
  expect(airport).toMatchObject({ shown: true, code: '6K5' });
});

test('lookupPlace gives up waiting after 5 s and uses the fallback table', async () => {
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const store = createAtcStore();
  const tools = createAtcTools({ store, fetchRoute: async () => null });
  let settled = false;

  const pending = tools.lookupPlace.handler({ query: 'Bend' }).then((r) => {
    settled = true;
    return r;
  });
  await vi.advanceTimersByTimeAsync(4999);
  const settledEarly = settled;
  await vi.advanceTimersByTimeAsync(1);
  const result = await pending;

  expect(settledEarly).toBe(false);
  expect(result).toMatchObject({ found: true, code: 'KBDN', towered: null });
  expect(store.getState().chart.status).toBe('loading');
});

test('whenChartSettled always unsubscribes, whether the chart settles or time runs out', async () => {
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const store = createAtcStore();
  const unsubscribes: ReturnType<typeof vi.fn>[] = [];
  const watched = {
    ...store,
    subscribe: (listener: () => void) => {
      const off = store.subscribe(listener);
      const spy = vi.fn(off);
      unsubscribes.push(spy);
      return spy;
    },
  };

  const timedOut = whenChartSettled(watched, 100);
  await vi.advanceTimersByTimeAsync(100);
  await timedOut;
  const settled = whenChartSettled(watched, 100);
  store.setChartLimited();
  await settled;
  const ready = await whenChartSettled(watched, 100);

  expect(unsubscribes).toHaveLength(2);
  expect(unsubscribes.map((spy) => spy.mock.calls.length)).toEqual([1, 1]);
  expect(ready).toBeUndefined();
});

test('the airspace tools wait only chartWaitMs for loading airspace', async () => {
  const store = readyStore();
  const tools = createAtcTools({
    store,
    fetchRoute: async () => null,
    chartWaitMs: 0,
  });
  const late = new Promise((resolve) => setTimeout(resolve, 500, 'late'));

  const result = await Promise.race([
    tools.airspaceAt.handler({ hex: 'aaaaaa' }),
    late,
  ]);

  expect(result).toEqual({
    found: false,
    reason: 'Airspace data is unavailable right now.',
  });
});

test('whenAirspaceSettled resolves once airspace is no longer loading', async () => {
  const store = createAtcStore();
  let settled = false;

  const pending = whenAirspaceSettled(store, 5000).then(() => {
    settled = true;
  });
  await Promise.resolve();
  const before = settled;
  store.setAirspaceFailed();
  await pending;

  expect(before).toBe(false);
  expect(settled).toBe(true);
});

test('whenAirspaceSettled gives up after the timeout', async () => {
  const store = createAtcStore();

  await whenAirspaceSettled(store, 10);

  expect(store.getState().airspace.status).toBe('loading');
});

test('ATC_TOOL_NAMES lists every tool createAtcTools makes, by its name', () => {
  const tools = createAtcTools({
    store: createAtcStore(),
    fetchRoute: async () => null,
  });

  const names = Object.values(tools).map((tool) => tool.name);

  expect([...ATC_TOOL_NAMES].sort()).toEqual(names.sort());
  expect(Object.keys(tools).sort()).toEqual(names.sort());
});

test('the findAircraft description mentions the airspace filter', () => {
  const description = ATC_TOOL_DEFINITIONS.findAircraft.description;

  const mentions = description.includes("inside an airport's airspace");

  expect(mentions).toBe(true);
});

test('clearing the highlight and stopping a follow are for when the user asks', () => {
  const { clearHighlight, stopFollowing } = ATC_TOOL_DEFINITIONS;

  expect(clearHighlight.description).toBe(
    'Remove the highlight so every aircraft looks the same again. Only when the user asks to clear the highlight or see all traffic; never at the end of an answer.',
  );
  expect(stopFollowing.description).toBe(
    'Stop following an aircraft. Only when the user asks to stop following.',
  );
});
