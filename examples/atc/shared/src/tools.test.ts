import { expect, test, vi } from 'vitest';
import type { Aircraft } from './aircraft';
import type { AirspaceShelf, ChartAirport } from './chart';
import { applySnapshot, createAtcStore, INITIAL_STATE } from './store';
import { findAircraft, type FindAircraftInput } from './find-aircraft';
import {
  ATC_TOOL_NAMES,
  createAtcTools,
  whenAirspaceSettled,
  whenChartSettled,
} from './tools';

function plane(hex: string, overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    hex,
    label: 'UAL100',
    callsign: 'UAL100',
    registration: null,
    typeCode: 'B738',
    category: null,
    kind: 'jet',
    lat: 44.0946,
    lon: -121.2002,
    altitudeFt: 30000,
    onGround: false,
    groundSpeedKt: 450,
    trackDeg: 90,
    verticalRateFpm: 0,
    ...overrides,
  };
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

const state = applySnapshot(INITIAL_STATE, {
  at: 1,
  aircraft: [
    plane('aaaaaa', { altitudeFt: 38000, groundSpeedKt: 480 }),
    plane('bbbbbb', {
      label: 'DAL200',
      callsign: 'DAL200',
      registration: null,
      typeCode: 'A321',
      category: null,
      kind: 'jet',
      altitudeFt: 5000,
      groundSpeedKt: 200,
      verticalRateFpm: -900,
      lat: 44.2,
    }),
    plane('cccccc', {
      label: 'SWA300',
      callsign: 'SWA300',
      registration: null,
      typeCode: 'B38M',
      category: null,
      kind: 'jet',
      altitudeFt: 12000,
      groundSpeedKt: 520,
    }),
  ],
});

test('findAircraft sorts by altitude, speed and distance', () => {
  const byAltitude = findAircraft(state, any).map((row) => row.hex);
  const bySpeed = findAircraft(state, { ...any, sortBy: 'speed' }).map(
    (row) => row.hex,
  );
  const byDistance = findAircraft(state, { ...any, sortBy: 'distance' }).map(
    (row) => row.hex,
  );

  expect(byAltitude).toEqual(['aaaaaa', 'cccccc', 'bbbbbb']);
  expect(bySpeed).toEqual(['cccccc', 'aaaaaa', 'bbbbbb']);
  expect(byDistance[byDistance.length - 1]).toBe('bbbbbb');
});

test('findAircraft matches airlines and types by code or name, ignoring case', () => {
  const results = [
    findAircraft(state, { ...any, airline: 'united' }).map((row) => row.hex),
    findAircraft(state, { ...any, airline: 'dal' }).map((row) => row.hex),
    findAircraft(state, { ...any, airline: '' }).length,
    findAircraft(state, { ...any, typeCode: '737' }).map((row) => row.hex),
    findAircraft(state, { ...any, typeCode: 'a321' }).map((row) => row.hex),
  ];

  expect(results).toEqual([
    ['aaaaaa'],
    ['bbbbbb'],
    3,
    ['aaaaaa', 'cccccc'],
    ['bbbbbb'],
  ]);
});

test('findAircraft filters by altitude band and approach, and clamps the limit', () => {
  const band = findAircraft(state, {
    ...any,
    minAltitudeFt: 10000,
    maxAltitudeFt: 20000,
  }).map((row) => row.hex);
  const approaching = findAircraft(state, { ...any, approaching: 'KRDM' }).map(
    (row) => row.hex,
  );
  const none = findAircraft(state, { ...any, limit: 0 }).length;
  const many = findAircraft(state, { ...any, limit: 500 }).length;

  expect(band).toEqual(['cccccc']);
  expect(approaching).toEqual(['bbbbbb']);
  expect([none, many]).toEqual([1, 3]);
});

test('findAircraft rows carry readable names and rounded distance', () => {
  const [row] = findAircraft(state, { ...any, limit: 1 });

  expect(row).toEqual({
    hex: 'aaaaaa',
    label: 'UAL100',
    callsign: 'UAL100',
    registration: null,
    airline: 'United Airlines',
    aircraftType: 'Boeing 737-800',
    kind: 'jet',
    altitudeFt: 38000,
    groundSpeedKt: 480,
    trackDeg: 90,
    distanceNm: 0,
  });
});

test('findAircraft lists private traffic with no airline and skips it for airline filters', () => {
  const mixed = applySnapshot(INITIAL_STATE, {
    at: 1,
    aircraft: [
      plane('aaaaaa'),
      plane('dddddd', {
        label: 'UAL1PVT',
        callsign: 'UAL1PVT',
        registration: null,
      }),
      plane('eeeeee', {
        label: 'N352LL',
        callsign: 'N352LL',
        registration: 'N352LL',
        typeCode: 'C172',
        category: null,
        kind: 'single',
        altitudeFt: 4500,
      }),
      plane('ffffff', {
        label: 'FFFFFF',
        callsign: null,
        registration: null,
        typeCode: null,
        category: null,
        kind: 'jet',
        altitudeFt: 1000,
      }),
    ],
  });

  const all = findAircraft(mixed, any).map((row) => [row.label, row.airline]);
  const united = findAircraft(mixed, { ...any, airline: 'united' }).map(
    (row) => row.hex,
  );
  const byCode = findAircraft(mixed, { ...any, airline: 'n35' }).length;

  expect(all).toEqual([
    ['UAL100', 'United Airlines'],
    ['UAL1PVT', 'United Airlines'],
    ['N352LL', null],
    ['FFFFFF', null],
  ]);
  expect(united).toEqual(['aaaaaa', 'dddddd']);
  expect(byCode).toBe(0);
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

test('findAircraft filters by kind and rows carry the kind', () => {
  const mixed = applySnapshot(INITIAL_STATE, {
    at: 1,
    aircraft: [
      plane('aaaaaa'),
      plane('bbbbbb', { typeCode: 'R44', kind: 'rotor' }),
      plane('cccccc', { typeCode: 'C172', kind: 'single' }),
    ],
  });

  const rotors = findAircraft(mixed, { ...any, kind: 'rotor' });
  const all = findAircraft(mixed, any);

  expect(rotors.map((row) => [row.hex, row.kind, row.aircraftType])).toEqual([
    ['bbbbbb', 'rotor', 'Robinson R44'],
  ]);
  expect(all.map((row) => row.kind).sort()).toEqual(['jet', 'rotor', 'single']);
});

test('findAircraft filters to a circle around an airport and measures from it', () => {
  const traffic = applySnapshot(INITIAL_STATE, {
    at: 1,
    aircraft: [
      plane('aaaaaa', { lat: 44.0946, lon: -121.2002 }),
      plane('bbbbbb', { lat: 44.3, lon: -121.2002 }),
      plane('cccccc', { lat: 47.45, lon: -122.31 }),
    ],
  });

  const near = findAircraft(traffic, {
    ...any,
    near: { airport: 'kbdn', radiusNm: 25 },
    sortBy: 'distance',
  });
  const tight = findAircraft(traffic, {
    ...any,
    near: { airport: 'KBDN', radiusNm: 5 },
  });

  expect(near.map((row) => [row.hex, row.distanceNm])).toEqual([
    ['aaaaaa', 0],
    ['bbbbbb', 12.3],
  ]);
  expect(tight.map((row) => row.hex)).toEqual(['aaaaaa']);
});

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

test('ATC_TOOL_NAMES lists every tool createAtcTools makes, by its name', () => {
  const tools = createAtcTools({
    store: createAtcStore(),
    fetchRoute: async () => null,
  });

  const names = Object.values(tools).map((tool) => tool.name);

  expect([...ATC_TOOL_NAMES].sort()).toEqual(names.sort());
  expect(Object.keys(tools).sort()).toEqual(names.sort());
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

  expect(rows).toEqual([]);
});

function krdm(overrides: Partial<ChartAirport> = {}): ChartAirport {
  return {
    code: 'KRDM',
    faa: 'RDM',
    name: 'ROBERTS FLD/REDMOND MUNI',
    city: 'REDMOND',
    state: 'OR',
    aliases: ['redmond'],
    lat: 44.254,
    lon: -121.15,
    elevationFt: 3082,
    kind: 'airport',
    towered: true,
    towerPartTime: true,
    frequencies: {
      tower: '124.5',
      atis: '119.025',
      ctaf: '124.5',
      unicom: '122.95',
    },
    weather: { kind: 'AWOS-3', frequency: '134.425' },
    lighting: 'limited',
    fuel: true,
    military: false,
    runways: [
      {
        id: '05/23',
        lengthFt: 7038,
        widthFt: 150,
        surface: 'ASPH',
        hard: true,
        ends: null,
        corners: null,
        bearingDeg: null,
      },
    ],
    rank: 0,
    ...overrides,
  };
}

function readyStore() {
  const store = createAtcStore();
  store.setChart({
    cycle: '2610',
    effective: '2026-10-08',
    airports: [krdm()],
  });

  return store;
}

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

test('lookupPlace reports whether the airport has a tower', async () => {
  const store = readyStore();
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.lookupPlace.handler({ query: 'Redmond' });

  expect(result).toMatchObject({ found: true, code: 'KRDM', towered: true });
});

const sisters = krdm({
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

test('chart tools wait for a chart that loads within 5 s and use it', async () => {
  vi.useFakeTimers();
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
  vi.useRealTimers();

  expect(place).toMatchObject({ found: true, code: '6K5', towered: false });
  expect(found).toEqual([]);
  expect(area).toMatchObject({ shown: true, airport: '6K5' });
  expect(airport).toMatchObject({ shown: true, code: '6K5' });
});

test('lookupPlace gives up waiting after 5 s and uses the fallback table', async () => {
  vi.useFakeTimers();
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
  vi.useRealTimers();

  expect(settledEarly).toBe(false);
  expect(result).toMatchObject({ found: true, code: 'KBDN', towered: null });
  expect(store.getState().chart.status).toBe('loading');
});

test('whenChartSettled always unsubscribes, whether the chart settles or time runs out', async () => {
  vi.useFakeTimers();
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
  vi.useRealTimers();

  expect(unsubscribes).toHaveLength(2);
  expect(unsubscribes.map((spy) => spy.mock.calls.length)).toEqual([1, 1]);
  expect(ready).toBeUndefined();
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
  vi.useRealTimers();

  expect(settledEarly).toBe(false);
  expect(result).toMatchObject({ shown: true, diagram: 'loading' });
});

function box(
  west: number,
  south: number,
  east: number,
  north: number,
): Pick<AirspaceShelf, 'rings' | 'bbox'> {
  return {
    rings: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
    bbox: [west, south, east, north],
  };
}

const pdxShelves: readonly AirspaceShelf[] = [
  {
    id: 'KPDX-C-0',
    airport: 'KPDX',
    name: 'PORTLAND CLASS C',
    class: 'C',
    type: 'C',
    floor: { ft: 1100, ref: 'MSL' },
    ceiling: { ft: 4000, exclusive: false },
    partTime: false,
    ...box(-122, 45, -121, 46),
  },
  {
    id: 'KPDX-E2-0',
    airport: 'KPDX',
    name: 'PORTLAND E2',
    class: 'E',
    type: 'E2',
    floor: { ft: 0, ref: 'SFC' },
    ceiling: null,
    partTime: false,
    ...box(-122, 45, -121, 46),
  },
];

const rdmShelf: AirspaceShelf = {
  id: 'KRDM-D-0',
  airport: 'KRDM',
  name: 'REDMOND CLASS D',
  class: 'D',
  type: 'D',
  floor: { ft: 0, ref: 'SFC' },
  ceiling: { ft: 6000, exclusive: false },
  partTime: true,
  ...box(-121.3, 44.1, -121, 44.4),
};

function airspaceStore(shelves: readonly AirspaceShelf[] = pdxShelves) {
  const store = readyStore();
  store.setAirspace({ cycle: '2610', effective: '2026-10-08', shelves });

  return store;
}

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

  expect(result).toMatchObject([{ hex: 'aaaaaa', distanceNm: 0.2 }]);
  expect(store.getState().highlightedAirspace).toBe('KRDM');
});

test('findAircraft with inAirspace and no class keeps any shelf of the airport', () => {
  const state = {
    ...airspaceStore([...pdxShelves, rdmShelf]).getState(),
  };
  const traffic = applySnapshot(state, {
    at: 1,
    aircraft: [
      plane('aaaaaa', { lat: 45.5, lon: -121.5, altitudeFt: 25000 }),
      plane('bbbbbb', { lat: 45.5, lon: -121.5, altitudeFt: 3000 }),
    ],
  });

  const rows = findAircraft(traffic, {
    ...any,
    inAirspace: { airport: 'KPDX', class: null },
  });

  expect(rows.map((row) => row.hex)).toEqual(['bbbbbb']);
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

test('setLayers applies the airspace layer', async () => {
  const store = createAtcStore();
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const result = await tools.setLayers.handler({
    airports: null,
    airspace: false,
  });

  expect(result).toEqual({ layers: { airports: true, airspace: false } });
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
