import { expect, test } from 'vitest';
import type { Aircraft } from './aircraft';
import { applySnapshot, INITIAL_STATE } from './store';
import {
  arrivalsRows,
  boardShowsEta,
  feedBadgeView,
  flightCardView,
  messageText,
  routeText,
} from './views';

const plane: Aircraft = {
  hex: 'aaaaaa',
  label: 'UAL100',
  callsign: 'UAL100',
  registration: null,
  typeCode: 'B39M',
  category: null,
  kind: 'jet',
  lat: 47.5716,
  lon: -122.3088,
  altitudeFt: 5000,
  onGround: false,
  groundSpeedKt: 240,
  trackDeg: 180,
  verticalRateFpm: -800,
};

test('flightCardView describes a live aircraft', () => {
  const state = applySnapshot(INITIAL_STATE, { at: 1, aircraft: [plane] });

  const view = flightCardView(state, 'AAAAAA');

  expect(view).toEqual({
    status: 'live',
    hex: 'aaaaaa',
    label: 'UAL100',
    subtitle: 'United Airlines',
    aircraftType: 'Boeing 737 MAX 9',
    altitude: '5,000 ft',
    speed: '240 kt',
    heading: '180°',
    route: null,
    lastSeen: null,
    selected: false,
  });
});

test('flightCardView marks the selected aircraft', () => {
  const state = applySnapshot(
    { ...INITIAL_STATE, selectedHex: 'aaaaaa' },
    { at: 1, aircraft: [plane] },
  );

  expect(flightCardView(state, 'aaaaaa')).toMatchObject({ selected: true });
});

test('flightCardView shows private aircraft by label with no airline line', () => {
  const state = applySnapshot(INITIAL_STATE, {
    at: 1,
    aircraft: [
      {
        ...plane,
        hex: 'a00001',
        label: 'N352LL',
        callsign: 'N352LL',
        registration: 'N352LL',
        typeCode: 'C172',
        category: null,
        kind: 'single',
      },
      {
        ...plane,
        hex: 'a00002',
        label: 'LIFEGRD1',
        callsign: 'LIFEGRD1',
        registration: 'N911LF',
        typeCode: 'EC35',
        category: null,
        kind: 'rotor',
      },
      {
        ...plane,
        hex: 'a00003',
        label: 'A00003',
        callsign: null,
        registration: null,
        typeCode: null,
        category: null,
        kind: 'jet',
      },
    ],
  });

  const views = ['a00001', 'a00002', 'a00003'].map((hex) =>
    flightCardView(state, hex),
  );

  expect(views).toMatchObject([
    { label: 'N352LL', subtitle: null, route: null },
    { label: 'LIFEGRD1', subtitle: 'N911LF', route: null },
    {
      label: 'A00003',
      subtitle: null,
      aircraftType: 'Unknown type',
      route: null,
    },
  ]);
});

test('flightCardView freezes departed aircraft and reports unknown IDs', () => {
  const seen = applySnapshot(INITIAL_STATE, {
    at: Date.UTC(2026, 9, 9, 12, 4),
    aircraft: [plane],
  });
  const gone = applySnapshot(seen, {
    at: Date.UTC(2026, 9, 9, 12, 5),
    aircraft: [],
  });

  const departed = flightCardView(gone, 'aaaaaa', 'UTC');
  const unknown = flightCardView(gone, 'not-a-plane');

  expect(departed).toMatchObject({
    status: 'out-of-range',
    lastSeen: '12:04',
    altitude: '5,000 ft',
  });
  expect(unknown).toEqual({ status: 'unknown', hex: 'not-a-plane' });
});

test('routeText distinguishes not looked up, missing and found', () => {
  const stops = [
    {
      iata: 'SFO',
      name: 'San Francisco International Airport',
      city: 'San Francisco',
    },
    {
      iata: 'SEA',
      name: 'Seattle-Tacoma International Airport',
      city: 'Seattle',
    },
  ];
  const routes = new Map([
    ['UAL100', { stops }],
    ['DAL1', null],
  ]);

  const texts = [
    routeText(routes, 'UAL100'),
    routeText(routes, 'DAL1'),
    routeText(routes, 'SWA1'),
  ];

  expect(texts).toEqual([
    'SFO → SEA · scheduled route',
    'Route unavailable',
    null,
  ]);
});

test('arrivalsRows computes distance and ETA to the airport as bare figures, units in the headers', () => {
  const state = applySnapshot(
    { ...INITIAL_STATE, selectedHex: 'aaaaaa' },
    { at: 1, aircraft: [plane, { ...plane, hex: 'cccccc', onGround: true }] },
  );

  const rows = arrivalsRows(state, 'KSEA', ['aaaaaa', 'bbbbbb', 'cccccc']);

  expect(rows).toEqual([
    {
      hex: 'aaaaaa',
      status: 'live',
      label: 'UAL100',
      aircraftType: 'Boeing 737 MAX 9',
      altitude: '5,000',
      distance: '7',
      eta: '2',
      selectable: true,
      selected: true,
    },
    {
      hex: 'bbbbbb',
      status: 'unknown',
      label: 'n/a',
      aircraftType: 'Unknown aircraft',
      altitude: 'n/a',
      distance: 'n/a',
      eta: 'n/a',
      selectable: false,
      selected: false,
    },
    expect.objectContaining({ hex: 'cccccc', altitude: 'GND' }),
  ]);
});

test('arrivalsRows keeps a departed aircraft, not selectable, with no live figures', () => {
  const seen = applySnapshot(INITIAL_STATE, { at: 1, aircraft: [plane] });
  const gone = applySnapshot(seen, { at: 2, aircraft: [] });

  const [row] = arrivalsRows(gone, 'KSEA', ['aaaaaa']);

  expect(row).toMatchObject({
    status: 'out-of-range',
    altitude: '5,000',
    distance: 'n/a',
    eta: 'n/a',
    selectable: false,
  });
});

test('boardShowsEta is true only when a listed aircraft is approaching the airport', () => {
  const level = { ...plane, hex: 'bbbbbb', verticalRateFpm: 0 };
  const state = applySnapshot(INITIAL_STATE, {
    at: 1,
    aircraft: [plane, level],
  });

  const results = [
    boardShowsEta(state, 'KSEA', ['aaaaaa', 'bbbbbb']),
    boardShowsEta(state, 'KSEA', ['bbbbbb']),
    boardShowsEta(state, 'KBDN', ['aaaaaa']),
    boardShowsEta(state, 'KSEA', ['ffffff']),
    boardShowsEta(state, 'KSEA', []),
  ];

  expect(results).toEqual([true, false, false, false, false]);
});

test('feedBadgeView labels each feed status with the aircraft count when live', () => {
  const statuses = ['connecting', 'live', 'delayed', 'stalled'] as const;

  const views = statuses.map((status) => feedBadgeView(status, 312));

  expect(views).toEqual([
    { label: 'Connecting…', count: null, live: false },
    { label: 'Live', count: '312 aircraft', live: true },
    { label: 'Data delayed', count: null, live: false },
    { label: 'Data delayed', count: null, live: false },
  ]);
});

test('feedBadgeView formats large counts and a single aircraft', () => {
  const counts = [1, 1234];

  const labels = counts.map((count) => feedBadgeView('live', count).count);

  expect(labels).toEqual(['1 aircraft', '1,234 aircraft']);
});

test('messageText reads string content and ignores anything else', () => {
  const texts = [
    messageText('hello'),
    messageText([{ type: 'text', text: 'x' }]),
    messageText(undefined),
  ];

  expect(texts).toEqual(['hello', '', '']);
});

test('an airline callsign with an unknown code shows no airline beside the label', () => {
  const state = applySnapshot(INITIAL_STATE, {
    at: 1,
    aircraft: [
      { ...plane, label: 'XYZ123', callsign: 'XYZ123', registration: null },
      {
        ...plane,
        hex: 'bbbbbb',
        label: 'XYZ124',
        callsign: 'XYZ124',
        registration: 'N123AB',
      },
    ],
  });

  const subtitles = ['aaaaaa', 'bbbbbb'].map((hex) => {
    const view = flightCardView(state, hex);
    return view.status === 'unknown' ? undefined : view.subtitle;
  });

  expect(subtitles).toEqual([null, 'N123AB']);
});
