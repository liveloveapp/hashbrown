import { expect, test } from 'vitest';
import {
  displayLabel,
  isAirlineCallsign,
  normalizeAdsbLol,
  parseSnapshot,
} from './aircraft';

const united = {
  hex: 'AA7F28',
  type: 'adsb_icao',
  flight: 'UAL1372 ',
  r: 'N77585',
  t: 'B39M',
  ownOp: 'BANK OF UTAH TRUSTEE',
  alt_baro: 35000,
  gs: 491.6,
  track: 94.55,
  baro_rate: 0,
  lat: 44.406372,
  lon: -94.1,
};

test('isAirlineCallsign accepts airline flight numbers only', () => {
  const callsigns = [
    'UAL1372',
    'SKW4024',
    'N352LL',
    'UAL',
    'ual12',
    'AAL12<b>',
  ];

  const results = callsigns.map(isAirlineCallsign);

  expect(results).toEqual([true, true, false, false, false, false]);
});

test('normalizeAdsbLol keeps only whitelisted fields of airline aircraft', () => {
  const payload = { ac: [united] };

  const snapshot = normalizeAdsbLol(payload, 1000);

  expect(snapshot).toEqual({
    at: 1000,
    aircraft: [
      {
        hex: 'aa7f28',
        label: 'UAL1372',
        callsign: 'UAL1372',
        registration: 'N77585',
        typeCode: 'B39M',
        category: null,
        kind: 'jet',
        lat: 44.406372,
        lon: -94.1,
        altitudeFt: 35000,
        onGround: false,
        groundSpeedKt: 491.6,
        trackDeg: 94.55,
        verticalRateFpm: 0,
      },
    ],
  });
});

test('normalizeAdsbLol drops non-ICAO hex and missing positions', () => {
  const payload = {
    ac: [
      { ...united, hex: '~aa7f28' },
      { ...united, lat: undefined },
      'not an object',
    ],
  };

  const snapshot = normalizeAdsbLol(payload, 1000);

  expect(snapshot.aircraft).toEqual([]);
});

test('normalizeAdsbLol keeps private, rotor and unidentified aircraft', () => {
  const payload = {
    ac: [
      { ...united, hex: 'a3f001', flight: 'N352LL  ', r: 'N352LL', t: 'C172' },
      { ...united, hex: 'a3f002', flight: undefined, r: 'N911LF', t: 'EC35' },
      {
        ...united,
        hex: 'a3f003',
        flight: undefined,
        r: undefined,
        t: undefined,
      },
    ],
  };

  const snapshot = normalizeAdsbLol(payload, 1000);

  expect(
    snapshot.aircraft.map(
      ({ hex, label, callsign, registration, typeCode }) => ({
        hex,
        label,
        callsign,
        registration,
        typeCode,
      }),
    ),
  ).toEqual([
    {
      hex: 'a3f001',
      label: 'N352LL',
      callsign: 'N352LL',
      registration: 'N352LL',
      typeCode: 'C172',
    },
    {
      hex: 'a3f002',
      label: 'N911LF',
      callsign: null,
      registration: 'N911LF',
      typeCode: 'EC35',
    },
    {
      hex: 'a3f003',
      label: 'A3F003',
      callsign: null,
      registration: null,
      typeCode: null,
    },
  ]);
  expect(JSON.stringify(snapshot)).not.toContain('BANK OF UTAH');
});

test('displayLabel prefers airline callsign, then registration, then callsign, then hex', () => {
  const cases = [
    { hex: 'aa7f28', callsign: 'UAL1372', registration: 'N77585' },
    { hex: 'aa7f28', callsign: 'N352LL', registration: 'N12345' },
    { hex: 'aa7f28', callsign: 'LIFEGRD1', registration: null },
    { hex: 'aa7f28', callsign: null, registration: 'C-GABC' },
    { hex: 'aa7f28', callsign: null, registration: null },
  ];

  const labels = cases.map(displayLabel);

  expect(labels).toEqual(['UAL1372', 'N12345', 'LIFEGRD1', 'CGABC', 'AA7F28']);
});

test('normalizeAdsbLol skips invalid label sources and falls through', () => {
  const payload = {
    ac: [
      { ...united, hex: 'a3f001', flight: 'N1<b>', r: 'N352LL' },
      { ...united, hex: 'a3f002', flight: 'TOOLONGCALL', r: '"><img src=x>' },
      { ...united, hex: 'a3f003', flight: 42, r: 'N 1 2' },
    ],
  };

  const snapshot = normalizeAdsbLol(payload, 1000);

  expect(
    snapshot.aircraft.map(({ label, callsign, registration }) => ({
      label,
      callsign,
      registration,
    })),
  ).toEqual([
    { label: 'N352LL', callsign: null, registration: 'N352LL' },
    { label: 'A3F002', callsign: null, registration: null },
    { label: 'A3F003', callsign: null, registration: null },
  ]);
});

test('normalizeAdsbLol marks aircraft on the ground', () => {
  const payload = {
    ac: [
      { ...united, alt_baro: 'ground', baro_rate: undefined, geom_rate: -64 },
    ],
  };

  const [aircraft] = normalizeAdsbLol(payload, 1000).aircraft;

  expect(aircraft).toMatchObject({
    altitudeFt: null,
    onGround: true,
    verticalRateFpm: -64,
  });
});

test('normalizeAdsbLol returns an empty snapshot for malformed payloads', () => {
  const payloads = [null, 'oops', { ac: 'nope' }, {}];

  const snapshots = payloads.map((payload) => normalizeAdsbLol(payload, 5));

  expect(snapshots).toEqual(payloads.map(() => ({ at: 5, aircraft: [] })));
});

test('parseSnapshot accepts a normalized snapshot and rejects anything else', () => {
  const valid = normalizeAdsbLol({ ac: [united] }, 1000);

  const parsed = parseSnapshot(JSON.parse(JSON.stringify(valid)));

  expect(parsed).toEqual(valid);
  expect(() => parseSnapshot({ at: 'x', aircraft: [] })).toThrow(
    'Invalid aircraft snapshot',
  );
  expect(() => parseSnapshot({ at: 1, aircraft: [{ hex: 'zz' }] })).toThrow(
    'Invalid aircraft snapshot',
  );
});

test('parseSnapshot rejects a non-boolean onGround', () => {
  const snapshot = normalizeAdsbLol({ ac: [united] }, 1000);
  const invalid = {
    ...snapshot,
    aircraft: [{ ...snapshot.aircraft[0], onGround: 'no' }],
  };

  const act = () => parseSnapshot(invalid);

  expect(act).toThrow('Invalid aircraft snapshot');
});

test('parseSnapshot rejects a string altitudeFt', () => {
  const snapshot = normalizeAdsbLol({ ac: [united] }, 1000);
  const invalid = {
    ...snapshot,
    aircraft: [{ ...snapshot.aircraft[0], altitudeFt: '35000' }],
  };

  const act = () => parseSnapshot(invalid);

  expect(act).toThrow('Invalid aircraft snapshot');
});

test('parseSnapshot rejects a non-finite lat', () => {
  const snapshot = normalizeAdsbLol({ ac: [united] }, 1000);
  const invalid = {
    ...snapshot,
    aircraft: [{ ...snapshot.aircraft[0], lat: Number.POSITIVE_INFINITY }],
  };

  const act = () => parseSnapshot(invalid);

  expect(act).toThrow('Invalid aircraft snapshot');
});

test('parseSnapshot rejects an unsafe or missing label', () => {
  const snapshot = normalizeAdsbLol({ ac: [united] }, 1000);
  const labels = ['<b>', 'ual1372', '', null, 'ABCDEFGHI'];

  const acts = labels.map(
    (label) => () =>
      parseSnapshot({
        ...snapshot,
        aircraft: [{ ...snapshot.aircraft[0], label }],
      }),
  );

  for (const act of acts) {
    expect(act).toThrow('Invalid aircraft snapshot');
  }
});

test('parseSnapshot rejects an invalid callsign or registration', () => {
  const snapshot = normalizeAdsbLol({ ac: [united] }, 1000);
  const invalid = [
    { callsign: '<b>' },
    { callsign: 42 },
    { registration: 'N1 <b>' },
    { registration: undefined },
  ];

  const acts = invalid.map(
    (fields) => () =>
      parseSnapshot({
        ...snapshot,
        aircraft: [{ ...snapshot.aircraft[0], ...fields }],
      }),
  );

  for (const act of acts) {
    expect(act).toThrow('Invalid aircraft snapshot');
  }
});

test('parseSnapshot accepts null nullable fields', () => {
  const snapshot = normalizeAdsbLol({ ac: [united] }, 1000);
  const nulled = {
    ...snapshot,
    aircraft: [
      {
        ...snapshot.aircraft[0],
        callsign: null,
        registration: null,
        typeCode: null,
        altitudeFt: null,
        groundSpeedKt: null,
        trackDeg: null,
        verticalRateFpm: null,
      },
    ],
  };

  const parsed = parseSnapshot(nulled);

  expect(parsed).toEqual(nulled);
});

test('parseSnapshot strips fields outside the Aircraft shape', () => {
  const snapshot = normalizeAdsbLol({ ac: [united] }, 1000);
  const withOwner = {
    ...snapshot,
    aircraft: [{ ...snapshot.aircraft[0], ownOp: 'BANK OF UTAH TRUSTEE' }],
  };

  const parsed = parseSnapshot(withOwner);

  expect(parsed).toEqual(snapshot);
  expect(parsed.aircraft[0]).not.toHaveProperty('ownOp');
});

test('normalizeAdsbLol keeps a valid category and derives the kind', () => {
  const payload = {
    ac: [
      { hex: 'a3f010', lat: 44, lon: -121, t: 'ZZZZ', category: 'A7' },
      { hex: 'a3f011', lat: 44, lon: -121, t: 'C172', category: 'A1' },
      { hex: 'a3f012', lat: 44, lon: -121, category: '<script>' },
      { hex: 'a3f013', lat: 44, lon: -121 },
    ],
  };

  const aircraft = normalizeAdsbLol(payload, 1).aircraft;

  expect(aircraft.map((a) => [a.category, a.kind])).toEqual([
    ['A7', 'rotor'],
    ['A1', 'single'],
    [null, 'jet'],
    [null, 'jet'],
  ]);
});

test('parseSnapshot rejects an invalid category and recomputes the kind', () => {
  const snapshot = normalizeAdsbLol({ ac: [united] }, 1000);
  const tampered = (category: string, kind: string) => ({
    ...snapshot,
    aircraft: [{ ...snapshot.aircraft[0], category, kind }],
  });

  const parsed = parseSnapshot(tampered('A7', 'jet'));

  expect(parsed.aircraft[0].kind).toBe('jet');
  expect(() => parseSnapshot(tampered('<b>', 'jet'))).toThrow();
});

const readings = {
  alt_geom: 35612.4,
  nav_altitude_mcp: 36000,
  nav_heading: 95.2,
  nav_qnh: 1013.6,
  ias: 271,
  tas: 468,
  mach: 0.792,
  mag_heading: 80.5,
  wd: 262,
  ws: 41,
  oat: -48,
  squawk: '2316',
  emergency: 'none',
  year: '2019',
  desc: 'BOEING 737 MAX 9',
  seen: 0.4,
};

test('normalizeAdsbLol keeps the extra readings the detail card shows', () => {
  const payload = { ac: [{ ...united, ...readings }] };

  const [aircraft] = normalizeAdsbLol(payload, 1000).aircraft;

  expect(aircraft).toMatchObject({
    geometricAltitudeFt: 35612,
    selectedAltitudeFt: 36000,
    selectedHeadingDeg: 95.2,
    qnhHpa: 1013.6,
    indicatedAirspeedKt: 271,
    trueAirspeedKt: 468,
    mach: 0.792,
    magneticHeadingDeg: 80.5,
    windDirectionDeg: 262,
    windSpeedKt: 41,
    outsideAirTempC: -48,
    squawk: '2316',
    emergency: 'none',
    year: '2019',
    description: 'BOEING 737 MAX 9',
    seenS: 0.4,
  });
  expect(aircraft).not.toHaveProperty('ownOp');
});

test('normalizeAdsbLol drops extra readings that fail their checks', () => {
  const bad = {
    alt_geom: 'high',
    nav_qnh: Number.NaN,
    mach: '0.8',
    seen: -1,
    squawk: '7A00',
    emergency: 'panic',
    year: '19',
    desc: '<img src=x>',
  };
  const payload = { ac: [{ ...united, ...bad }] };

  const [aircraft] = normalizeAdsbLol(payload, 1000).aircraft;

  for (const key of [
    'geometricAltitudeFt',
    'qnhHpa',
    'mach',
    'seenS',
    'squawk',
    'emergency',
    'year',
    'description',
  ]) {
    expect(aircraft).not.toHaveProperty(key);
  }
});

test('parseSnapshot keeps valid extra readings and rejects invalid ones', () => {
  const snapshot = normalizeAdsbLol({ ac: [{ ...united, ...readings }] }, 1);
  const tampered = (extra: Record<string, unknown>) => ({
    ...snapshot,
    aircraft: [{ ...snapshot.aircraft[0], ...extra }],
  });

  const parsed = parseSnapshot(snapshot);

  expect(parsed).toEqual(snapshot);
  expect(() => parseSnapshot(tampered({ squawk: '7A00' }))).toThrow();
  expect(() => parseSnapshot(tampered({ emergency: 'panic' }))).toThrow();
  expect(() => parseSnapshot(tampered({ year: 'old' }))).toThrow();
  expect(() => parseSnapshot(tampered({ mach: '0.8' }))).toThrow();
  expect(() => parseSnapshot(tampered({ description: '<b>x</b>' }))).toThrow();
});
