import { expect, test } from 'vitest';
import type { Aircraft } from './aircraft';
import { applySnapshot, INITIAL_STATE } from './store';
import {
  aircraftDetailView,
  arrivalsRows,
  feedBadgeView,
  flightCardView,
  messageText,
  routeText,
  toolCallLabel,
  toolChipView,
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
  });
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

test('arrivalsRows computes distance and ETA to the airport', () => {
  const state = applySnapshot(INITIAL_STATE, { at: 1, aircraft: [plane] });

  const rows = arrivalsRows(state, 'SEA', ['aaaaaa', 'bbbbbb']);

  expect(rows).toEqual([
    {
      hex: 'aaaaaa',
      status: 'live',
      label: 'UAL100',
      aircraftType: 'Boeing 737 MAX 9',
      altitude: '5,000 ft',
      distance: '7 nm',
      eta: '2 min',
    },
    {
      hex: 'bbbbbb',
      status: 'unknown',
      label: 'n/a',
      aircraftType: 'Unknown aircraft',
      altitude: 'n/a',
      distance: 'n/a',
      eta: 'n/a',
    },
  ]);
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

test('toolCallLabel summarises findAircraft filters', () => {
  const base = {
    airline: null,
    typeCode: null,
    kind: null,
    minAltitudeFt: null,
    maxAltitudeFt: null,
    approaching: null,
    sortBy: 'distance',
    limit: 10,
  };

  const labels = [
    toolCallLabel('findAircraft', { ...base, approaching: 'SEA' }),
    toolCallLabel('findAircraft', { ...base, sortBy: 'altitude' }),
    toolCallLabel('findAircraft', {
      ...base,
      airline: 'UAL',
      typeCode: '737',
      minAltitudeFt: 10000,
      maxAltitudeFt: 30000,
    }),
  ];

  expect(labels).toEqual([
    'findAircraft · approaching SEA',
    'findAircraft · sorted by altitude',
    'findAircraft · UAL, 737, above 10,000 ft, below 30,000 ft',
  ]);
});

test('toolCallLabel summarises the other tools by their main argument', () => {
  const calls: [string, unknown][] = [
    ['lookupRoute', { callsign: ' ual1372 ' }],
    ['highlightAircraft', { hexes: ['a', 'b', 'c'] }],
    ['highlightAircraft', { hexes: ['a'] }],
    ['followAircraft', { hex: 'A1B2C3' }],
    ['getSelectedAircraft', {}],
    ['clearHighlight', {}],
  ];

  const labels = calls.map(([name, args]) => toolCallLabel(name, args));

  expect(labels).toEqual([
    'lookupRoute · UAL1372',
    'highlightAircraft · 3 aircraft',
    'highlightAircraft · 1 aircraft',
    'followAircraft · a1b2c3',
    'getSelectedAircraft',
    'clearHighlight',
  ]);
});

test('toolCallLabel falls back to the name for partial or odd arguments', () => {
  const calls: [string, unknown][] = [
    ['findAircraft', undefined],
    ['findAircraft', { approaching: null }],
    ['lookupRoute', { callsign: 42 }],
    ['highlightAircraft', { hexes: 'nope' }],
    ['followAircraft', null],
  ];

  const labels = calls.map(([name, args]) => toolCallLabel(name, args));

  expect(labels).toEqual([
    'findAircraft',
    'findAircraft',
    'lookupRoute',
    'highlightAircraft',
    'followAircraft',
  ]);
});

test('toolCallLabel shortens long free-text arguments', () => {
  const airline = 'x'.repeat(60);

  const label = toolCallLabel('findAircraft', { airline, sortBy: 'distance' });

  expect(label).toBe(`findAircraft · ${'x'.repeat(23)}…`);
});

test('toolChipView spins only while the call is pending and the chat is busy', () => {
  const args = { hexes: ['a', 'b'] };
  const pending = {
    name: 'highlightAircraft',
    args,
    status: 'pending' as const,
  };
  const done = {
    ...pending,
    status: 'done' as const,
    result: { status: 'fulfilled' as const },
  };
  const failed = {
    ...pending,
    status: 'done' as const,
    result: { status: 'rejected' as const },
  };

  const states = [
    toolChipView(pending, true).state,
    toolChipView(pending, false).state,
    toolChipView(done, true).state,
    toolChipView(failed, true).state,
  ];

  expect(states).toEqual(['running', 'stopped', 'done', 'failed']);
  expect(toolChipView(pending, true).label).toBe(
    'highlightAircraft · 2 aircraft',
  );
});

test('messageText reads string content and ignores anything else', () => {
  const texts = [
    messageText('hello'),
    messageText([{ type: 'text', text: 'x' }]),
    messageText(undefined),
  ];

  expect(texts).toEqual(['hello', '', '']);
});

test('aircraftDetailView groups every reading with units', () => {
  const full: Aircraft = {
    ...plane,
    registration: 'N37502',
    category: 'A3',
    description: 'BOEING 737 MAX 9',
    year: '2019',
    squawk: '7700',
    emergency: 'general',
    geometricAltitudeFt: 5125,
    selectedAltitudeFt: 4000,
    qnhHpa: 1013.2,
    indicatedAirspeedKt: 231,
    trueAirspeedKt: 248.4,
    mach: 0.3846,
    magneticHeadingDeg: 165.2,
    selectedHeadingDeg: 170,
    windDirectionDeg: 262,
    windSpeedKt: 18,
    outsideAirTempC: 4,
    seenS: 2.6,
  };
  const loaded = applySnapshot(INITIAL_STATE, { at: 1, aircraft: [full] });
  const state = {
    ...loaded,
    routes: new Map([
      [
        'UAL100',
        {
          stops: [
            { iata: 'SFO', name: 'San Francisco', city: 'San Francisco' },
            { iata: 'SEA', name: 'Seattle-Tacoma', city: 'Seattle' },
          ],
        },
      ],
    ]),
  };

  const view = aircraftDetailView(state, 'AAAAAA');

  expect(view).toEqual({
    hex: 'aaaaaa',
    label: 'UAL100',
    subtitle: 'United Airlines',
    groups: [
      {
        title: 'Identity',
        rows: [
          { label: 'Registration', value: 'N37502' },
          { label: 'Type', value: 'Boeing 737 MAX 9' },
          { label: 'ICAO type', value: 'B39M' },
          { label: 'Kind', value: 'Jet' },
          { label: 'Model year', value: '2019' },
          { label: 'Callsign', value: 'UAL100' },
          { label: 'Squawk', value: '7700' },
          { label: 'Emergency', value: 'General emergency' },
          { label: 'Category', value: 'A3, large' },
          { label: 'Hex', value: 'AAAAAA' },
        ],
      },
      {
        title: 'Altitude',
        rows: [
          { label: 'Pressure altitude', value: '5,000 ft' },
          { label: 'Geometric altitude', value: '5,125 ft' },
          { label: 'Selected altitude', value: '4,000 ft' },
          { label: 'Altimeter', value: '1013.2 hPa, 29.92 inHg' },
          { label: 'Vertical rate', value: '-800 fpm' },
        ],
      },
      {
        title: 'Speed and direction',
        rows: [
          { label: 'Ground speed', value: '240 kt' },
          { label: 'Indicated airspeed', value: '231 kt' },
          { label: 'True airspeed', value: '248 kt' },
          { label: 'Mach', value: '0.385' },
          { label: 'Track', value: '180°' },
          { label: 'Magnetic heading', value: '165°' },
          { label: 'Selected heading', value: '170°' },
          { label: 'Wind', value: '262° at 18 kt' },
          { label: 'Outside air', value: '4 °C' },
        ],
      },
      {
        title: 'Position',
        rows: [
          { label: 'Position', value: '47.5716, -122.3088' },
          { label: 'Last message', value: '3s ago' },
          { label: 'Route', value: 'SFO → SEA · scheduled route' },
        ],
      },
    ],
  });
});

test('aircraftDetailView omits rows with no value and handles hex-only aircraft', () => {
  const bare: Aircraft = {
    ...plane,
    label: 'AAAAAA',
    callsign: null,
    typeCode: null,
    altitudeFt: null,
    groundSpeedKt: null,
    trackDeg: null,
    verticalRateFpm: null,
  };
  const state = applySnapshot(INITIAL_STATE, { at: 1, aircraft: [bare] });

  const view = aircraftDetailView(state, 'aaaaaa');

  expect(view).toEqual({
    hex: 'aaaaaa',
    label: 'AAAAAA',
    subtitle: null,
    groups: [
      {
        title: 'Identity',
        rows: [
          { label: 'Kind', value: 'Jet' },
          { label: 'Hex', value: 'AAAAAA' },
        ],
      },
      {
        title: 'Position',
        rows: [{ label: 'Position', value: '47.5716, -122.3088' }],
      },
    ],
  });
  expect(JSON.stringify(view)).not.toContain('n/a');
});

test('aircraftDetailView shows ground, climbs and unknown aircraft', () => {
  const grounded: Aircraft = { ...plane, onGround: true, altitudeFt: null };
  const climbing: Aircraft = {
    ...plane,
    hex: 'bbbbbb',
    verticalRateFpm: 1216,
  };
  const state = applySnapshot(INITIAL_STATE, {
    at: 1,
    aircraft: [grounded, climbing],
  });

  const ground = aircraftDetailView(state, 'aaaaaa');
  const climb = aircraftDetailView(state, 'bbbbbb');
  const unknown = aircraftDetailView(state, 'cccccc');

  expect(ground?.groups[1]?.rows[0]).toEqual({
    label: 'Pressure altitude',
    value: 'On ground',
  });
  expect(climb?.groups[1]?.rows.at(-1)).toEqual({
    label: 'Vertical rate',
    value: '+1,216 fpm',
  });
  expect(unknown).toBeNull();
});
