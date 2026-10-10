import { expect, test, vi } from 'vitest';
import type { Aircraft } from './aircraft';
import { applySnapshot, createAtcStore, INITIAL_STATE } from './store';
import { createAtcTools, findAircraft, type FindAircraftInput } from './tools';

function plane(hex: string, overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    hex,
    callsign: 'UAL100',
    typeCode: 'B738',
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
  minAltitudeFt: null,
  maxAltitudeFt: null,
  approaching: null,
  sortBy: 'altitude',
  limit: 20,
};

const state = applySnapshot(INITIAL_STATE, {
  at: 1,
  aircraft: [
    plane('aaaaaa', { altitudeFt: 38000, groundSpeedKt: 480 }),
    plane('bbbbbb', {
      callsign: 'DAL200',
      typeCode: 'A321',
      altitudeFt: 5000,
      groundSpeedKt: 200,
      verticalRateFpm: -900,
      lat: 44.2,
    }),
    plane('cccccc', {
      callsign: 'SWA300',
      typeCode: 'B38M',
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
  const approaching = findAircraft(state, { ...any, approaching: 'RDM' }).map(
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
    callsign: 'UAL100',
    airline: 'United Airlines',
    aircraftType: 'Boeing 737-800',
    altitudeFt: 38000,
    groundSpeedKt: 480,
    trackDeg: 90,
    distanceNm: 0,
  });
});

test('lookupRoute caches routes, including misses', async () => {
  const store = createAtcStore();
  const fetchRoute = vi.fn(async () => null);
  const tools = createAtcTools({ store, fetchRoute });

  const first = await tools.lookupRoute.handler({ callsign: 'ual100' });
  await tools.lookupRoute.handler({ callsign: 'UAL100' });

  expect(first).toEqual({ found: false });
  expect(fetchRoute).toHaveBeenCalledTimes(1);
  expect(store.getState().routes.get('UAL100')).toBeNull();
});

test('map tools update the store and report unknown aircraft', async () => {
  const store = createAtcStore();
  store.applySnapshot({ at: 1, aircraft: [plane('aaaaaa')] });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const highlighted = await tools.highlightAircraft.handler({
    hexes: ['AAAAAA', 'ffffff'],
  });
  const followed = await tools.followAircraft.handler({ hex: 'ffffff' });
  const following = await tools.followAircraft.handler({ hex: 'aaaaaa' });
  await tools.clearHighlight.handler({});

  expect(highlighted).toEqual({ highlighted: 1, unknown: ['ffffff'] });
  expect(followed).toEqual({ following: false, reason: 'Unknown aircraft' });
  expect(following).toEqual({ following: true });
  expect(store.getState().followingHex).toBe('aaaaaa');
  expect(store.getState().highlighted.size).toBe(0);
});

test('getSelectedAircraft returns the selected row or null', async () => {
  const store = createAtcStore();
  store.applySnapshot({ at: 1, aircraft: [plane('aaaaaa')] });
  const tools = createAtcTools({ store, fetchRoute: async () => null });

  const before = await tools.getSelectedAircraft.handler({});
  store.select('aaaaaa');
  const after = await tools.getSelectedAircraft.handler({});

  expect(before).toBeNull();
  expect(after?.hex).toBe('aaaaaa');
});
