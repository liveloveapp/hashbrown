import { expect, test, vi } from 'vitest';
import type { Aircraft } from './aircraft';
import { AIRPORTS } from './places';
import {
  applyAirspace,
  applyAirspaceFailed,
  applyChart,
  applyChartLimited,
  applyFollow,
  applyHighlight,
  applyLayers,
  applySnapshot,
  applySurfaces,
  cancelViewRequest,
  createAtcStore,
  DEPARTED_TTL_MS,
  INITIAL_STATE,
  lookupAircraft,
  requestAircraft,
  requestAirport,
  requestAirspace,
  requestArea,
  requestReset,
} from './store';
import { testAircraft } from './testing';

function aircraft(hex: string, altitudeFt = 30000): Aircraft {
  return testAircraft({ hex, label: 'UAL1', callsign: 'UAL1', altitudeFt });
}

test('applySnapshot replaces positions and records departures with their last-seen time', () => {
  const first = applySnapshot(INITIAL_STATE, {
    at: 1000,
    aircraft: [aircraft('aaaaaa'), aircraft('bbbbbb')],
  });

  const second = applySnapshot(first, {
    at: 6000,
    aircraft: [aircraft('aaaaaa', 31000)],
  });

  expect(lookupAircraft(second, 'aaaaaa')).toEqual({
    status: 'live',
    aircraft: aircraft('aaaaaa', 31000),
  });
  expect(lookupAircraft(second, 'bbbbbb')).toEqual({
    status: 'out-of-range',
    aircraft: aircraft('bbbbbb'),
    lastSeenAt: 1000,
  });
  expect(second.updatedAt).toBe(6000);
});

test('an aircraft that comes back is live again', () => {
  const gone = applySnapshot(
    applySnapshot(INITIAL_STATE, { at: 1, aircraft: [aircraft('aaaaaa')] }),
    { at: 2, aircraft: [] },
  );

  const back = applySnapshot(gone, { at: 3, aircraft: [aircraft('aaaaaa')] });

  expect(lookupAircraft(back, 'aaaaaa').status).toBe('live');
  expect(back.departed.size).toBe(0);
});

test('lookupAircraft ignores case and whitespace and reports unknown IDs', () => {
  const state = applySnapshot(INITIAL_STATE, {
    at: 1,
    aircraft: [aircraft('a1b2c3')],
  });

  const results = [
    lookupAircraft(state, ' A1B2C3 ').status,
    lookupAircraft(state, 'a1b2').status,
  ];

  expect(results).toEqual(['live', 'unknown']);
});

test('applySnapshot does not mutate the previous state', () => {
  const before = applySnapshot(INITIAL_STATE, {
    at: 1,
    aircraft: [aircraft('aaaaaa')],
  });
  const keys = [...before.aircraft.keys()];

  applySnapshot(before, { at: 2, aircraft: [] });

  expect([...before.aircraft.keys()]).toEqual(keys);
  expect(before.departed.size).toBe(0);
});

test('the store notifies subscribers and normalizes IDs and callsigns', () => {
  const store = createAtcStore({ now: () => 42 });
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);

  store.select('A1B2C3');
  store.highlight(['AAAAAA', ' bbbbbb']);
  store.follow('CCCCCC');
  store.pulse('DDDDDD');
  store.setRoute('ual1 ', null);
  unsubscribe();
  store.clearHighlight();

  const state = store.getState();
  expect(listener).toHaveBeenCalledTimes(5);
  expect(state.selectedHex).toBe('a1b2c3');
  expect(state.highlighted.size).toBe(0);
  expect(state.followingHex).toBe('cccccc');
  expect(state.pulse).toEqual({ hex: 'dddddd', at: 42 });
  expect(state.routes.get('UAL1')).toBeNull();
});

test('setFeedStatus does not notify when the status is unchanged', () => {
  const store = createAtcStore();
  const listener = vi.fn();
  store.subscribe(listener);

  store.setFeedStatus('connecting');
  store.setFeedStatus('live');

  expect(listener).toHaveBeenCalledTimes(1);
});

test('applySnapshot ignores snapshots no newer than the current state', () => {
  const current = applySnapshot(INITIAL_STATE, {
    at: 2000,
    aircraft: [aircraft('aaaaaa', 31000)],
  });

  const older = applySnapshot(current, {
    at: 1000,
    aircraft: [aircraft('aaaaaa', 30000)],
  });
  const same = applySnapshot(current, {
    at: 2000,
    aircraft: [aircraft('aaaaaa', 30000)],
  });

  expect(older).toBe(current);
  expect(same).toBe(current);
});

test('the store does not notify listeners for an old snapshot', () => {
  const store = createAtcStore();
  store.applySnapshot({ at: 2000, aircraft: [aircraft('aaaaaa')] });
  const listener = vi.fn();
  store.subscribe(listener);

  store.applySnapshot({ at: 2000, aircraft: [aircraft('aaaaaa')] });
  store.applySnapshot({ at: 1000, aircraft: [aircraft('aaaaaa')] });

  expect(listener).not.toHaveBeenCalled();
});

/** A state with one plane over Bend and one over Seattle. */
const twoPlanes = applySnapshot(INITIAL_STATE, {
  at: 1,
  aircraft: [
    { ...aircraft('aaaaaa'), lat: AIRPORTS.KBDN.lat, lon: AIRPORTS.KBDN.lon },
    { ...aircraft('bbbbbb'), lat: AIRPORTS.KSEA.lat, lon: AIRPORTS.KSEA.lon },
  ],
});
const bend = { airport: 'KBDN', radiusNm: 25 } as const;

test('an area request draws the area and asks the map to move, newest first', () => {
  const first = requestArea(twoPlanes, bend);

  const second = requestArea(first, { airport: 'KSEA', radiusNm: 10 });

  expect(first.shownArea).toEqual(bend);
  expect(first.viewRequest).toEqual({ seq: 1, kind: 'area', area: bend });
  expect(second.shownArea).toEqual({ airport: 'KSEA', radiusNm: 10 });
  expect(second.viewRequest?.seq).toBe(2);
});

test('a reset clears the area and asks for the home view', () => {
  const shown = requestArea(twoPlanes, bend);

  const reset = requestReset(shown);

  expect(reset.shownArea).toBeNull();
  expect(reset.viewRequest).toEqual({ seq: 2, kind: 'reset' });
});

test('following wins: area and reset requests do not move the map, and follow drops a pending move', () => {
  const following = applyFollow(twoPlanes, 'AAAAAA');

  const area = requestArea(following, bend);
  const reset = requestReset(following);
  const takenOver = applyFollow(requestArea(twoPlanes, bend), 'aaaaaa');

  expect(area.shownArea).toEqual(bend);
  expect(area.viewRequest).toBeNull();
  expect(reset.viewRequest).toBeNull();
  expect(takenOver.viewRequest).toBeNull();
  expect(takenOver.followingHex).toBe('aaaaaa');
});

test('a new highlighted set asks the map to fit it; the same set or an empty one does not', () => {
  const highlighted = applyHighlight(twoPlanes, ['aaaaaa', 'bbbbbb']);

  const same = applyHighlight(highlighted, ['BBBBBB', 'aaaaaa']);
  const cleared = applyHighlight(highlighted, []);

  expect(highlighted.viewRequest).toEqual({ seq: 1, kind: 'highlight' });
  expect(same).toBe(highlighted);
  expect(cleared.viewRequest).toBeNull();
  expect(cleared.highlighted.size).toBe(0);
});

test('highlighting planes inside the shown area keeps the area view; planes outside it replace it', () => {
  const shown = requestArea(twoPlanes, bend);

  const inside = applyHighlight(shown, ['aaaaaa']);
  const outside = applyHighlight(shown, ['aaaaaa', 'bbbbbb']);

  expect(inside.viewRequest).toEqual(shown.viewRequest);
  expect(inside.shownArea).toEqual(bend);
  expect(outside.viewRequest).toEqual({ seq: 2, kind: 'highlight' });
  expect(outside.shownArea).toBeNull();
});

test('highlighting while following asks for no move', () => {
  const following = applyFollow(twoPlanes, 'aaaaaa');

  const highlighted = applyHighlight(following, ['bbbbbb']);

  expect(highlighted.viewRequest).toBeNull();
  expect(highlighted.highlighted.has('bbbbbb')).toBe(true);
});

test('cancelling drops the pending move and keeps the area outline', () => {
  const shown = requestArea(twoPlanes, bend);

  const cancelled = cancelViewRequest(shown);
  const again = cancelViewRequest(cancelled);

  expect(cancelled.viewRequest).toBeNull();
  expect(cancelled.shownArea).toEqual(bend);
  expect(again).toBe(cancelled);
});

test('the store exposes the view requests', () => {
  const store = createAtcStore();
  store.applySnapshot({ at: 1, aircraft: [aircraft('aaaaaa')] });

  store.showArea(bend);
  const area = store.getState().viewRequest?.kind;
  store.cancelViewRequest();
  const cancelled = store.getState().viewRequest;
  store.resetView();

  expect(area).toBe('area');
  expect(cancelled).toBeNull();
  expect(store.getState().viewRequest?.kind).toBe('reset');
  expect(store.getState().shownArea).toBeNull();
});

test('revealing an aircraft selects it and asks the map to bring it into view', () => {
  const revealed = requestAircraft(twoPlanes, 'BBBBBB');

  const following = requestAircraft(applyFollow(twoPlanes, 'aaaaaa'), 'bbbbbb');

  expect(revealed.selectedHex).toBe('bbbbbb');
  expect(revealed.viewRequest).toEqual({
    seq: 1,
    kind: 'aircraft',
    hex: 'bbbbbb',
  });
  expect(following.selectedHex).toBe('bbbbbb');
  expect(following.viewRequest).toBeNull();
});

test('the store reveals aircraft', () => {
  const store = createAtcStore();

  store.revealAircraft('aaaaaa');

  expect(store.getState().selectedHex).toBe('aaaaaa');
  expect(store.getState().viewRequest?.kind).toBe('aircraft');
});

test('applySnapshot forgets aircraft that left more than DEPARTED_TTL_MS ago', () => {
  const plane = (hex: string): Aircraft => ({
    hex,
    label: hex.toUpperCase(),
    callsign: null,
    registration: null,
    typeCode: null,
    category: null,
    kind: 'jet',
    lat: 44,
    lon: -121,
    altitudeFt: 10000,
    onGround: false,
    groundSpeedKt: 300,
    trackDeg: 90,
    verticalRateFpm: 0,
  });
  const left = applySnapshot(
    applySnapshot(INITIAL_STATE, { at: 1000, aircraft: [plane('aaaaaa')] }),
    { at: 2000, aircraft: [] },
  );

  const soon = applySnapshot(left, {
    at: 1000 + DEPARTED_TTL_MS,
    aircraft: [],
  });
  const later = applySnapshot(left, {
    at: 1001 + DEPARTED_TTL_MS,
    aircraft: [],
  });

  expect(soon.departed.has('aaaaaa')).toBe(true);
  expect(later.departed.has('aaaaaa')).toBe(false);
});

test('showing an airport turns the airports layer on and requests its view', () => {
  const hidden = applyLayers(INITIAL_STATE, { airports: false });

  const next = requestAirport(hidden, 'KRDM');

  expect(next.layers.airports).toBe(true);
  expect(next.viewRequest).toEqual({
    seq: 1,
    kind: 'airport',
    airport: 'KRDM',
  });
  expect(next.shownArea).toBeNull();
});

test('showing an airport while following drops the request', () => {
  const following = applyFollow(INITIAL_STATE, 'a1');

  const next = requestAirport(following, 'KRDM');

  expect(next.viewRequest).toBeNull();
  expect(next.layers.airports).toBe(true);
});

test('setting layers to their current values returns the same state', () => {
  const next = applyLayers(INITIAL_STATE, { airports: true });

  expect(next).toBe(INITIAL_STATE);
});

test('a chart payload makes the chart ready', () => {
  const next = applyChart(INITIAL_STATE, {
    cycle: '2610',
    effective: '2026-10-01',
    airports: [],
  });

  expect(next.chart).toEqual({ status: 'ready', cycle: '2610', airports: [] });
});

test('limited chart status keeps no airports', () => {
  const next = applyChartLimited(INITIAL_STATE);

  expect(next.chart.status).toBe('limited');
  expect(next.chart.airports).toEqual([]);
});

test('surfaces are stored per airport without touching others', () => {
  const loading = applySurfaces(INITIAL_STATE, 'KRDM', 'loading');

  const next = applySurfaces(loading, 'KBDN', 'failed');

  expect(next.surfaces.get('KRDM')).toBe('loading');
  expect(next.surfaces.get('KBDN')).toBe('failed');
  expect(loading.surfaces.has('KBDN')).toBe(false);
});

const airspacePayload = {
  cycle: '2610',
  effective: '2026-10-08',
  shelves: [
    {
      id: 'KPDX-C-0',
      airport: 'KPDX',
      name: 'PORTLAND CLASS C',
      class: 'C' as const,
      type: 'C' as const,
      floor: { ft: 0, ref: 'SFC' as const },
      ceiling: { ft: 4000, exclusive: false },
      partTime: false,
      rings: [],
      bbox: [-122, 45, -121, 46] as const,
    },
  ],
};

test('airspace starts loading, empty and on, with nothing highlighted', () => {
  const state = INITIAL_STATE;

  expect(state.airspace).toEqual({
    status: 'loading',
    cycle: null,
    shelves: [],
  });
  expect(state.layers.airspace).toBe(true);
  expect(state.highlightedAirspace).toBeNull();
});

test('an airspace payload makes airspace ready', () => {
  const next = applyAirspace(INITIAL_STATE, airspacePayload);

  expect(next.airspace).toEqual({
    status: 'ready',
    cycle: '2610',
    shelves: airspacePayload.shelves,
  });
});

test('airspace fails only while still loading', () => {
  const failed = applyAirspaceFailed(INITIAL_STATE);
  const ready = applyAirspace(INITIAL_STATE, airspacePayload);

  const after = applyAirspaceFailed(ready);

  expect(failed.airspace.status).toBe('failed');
  expect(after).toBe(ready);
});

test('showing airspace highlights it, turns the layer on and requests the view', () => {
  const hidden = applyLayers(
    { ...INITIAL_STATE, shownArea: { airport: 'KSEA', radiusNm: 10 } },
    { airspace: false },
  );

  const next = requestAirspace(hidden, 'KPDX');

  expect(next.highlightedAirspace).toBe('KPDX');
  expect(next.layers.airspace).toBe(true);
  expect(next.shownArea).toBeNull();
  expect(next.viewRequest).toEqual({
    seq: 1,
    kind: 'airspace',
    airport: 'KPDX',
  });
});

test('showing airspace while following sets highlight and layer but no move', () => {
  const following = applyLayers(applyFollow(INITIAL_STATE, 'a1'), {
    airspace: false,
  });

  const next = requestAirspace(following, 'KPDX');

  expect(next.viewRequest).toBeNull();
  expect(next.highlightedAirspace).toBe('KPDX');
  expect(next.layers.airspace).toBe(true);
});

test('clearing the highlight and resetting the view clear the airspace highlight', () => {
  const store = createAtcStore();
  store.showAirspace('KPDX');

  store.clearHighlight();
  const cleared = store.getState().highlightedAirspace;
  store.showAirspace('KPDX');
  store.resetView();

  expect(cleared).toBeNull();
  expect(store.getState().highlightedAirspace).toBeNull();
});

test('an empty aircraft highlight keeps the highlighted airspace', () => {
  const shown = requestAirspace(INITIAL_STATE, 'KPDX');

  const next = applyHighlight(shown, []);

  expect(next.highlightedAirspace).toBe('KPDX');
});

test('the store keeps the airspace highlight when highlighting no aircraft', () => {
  const store = createAtcStore();
  store.showAirspace('KPDX');

  store.highlight([]);

  expect(store.getState().highlightedAirspace).toBe('KPDX');
});

test('area and airport requests clear the airspace highlight', () => {
  const shown = requestAirspace(INITIAL_STATE, 'KPDX');

  const area = requestArea(shown, { airport: 'KSEA', radiusNm: 25 });
  const airport = requestAirport(shown, 'KSEA');

  expect(area.highlightedAirspace).toBeNull();
  expect(airport.highlightedAirspace).toBeNull();
});

test('the store applies airspace and its failure', () => {
  const store = createAtcStore();

  store.setAirspaceFailed();
  const failed = store.getState().airspace.status;
  store.setAirspace(airspacePayload);

  expect(failed).toBe('failed');
  expect(store.getState().airspace.status).toBe('ready');
});
