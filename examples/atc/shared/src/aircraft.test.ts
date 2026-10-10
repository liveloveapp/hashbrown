import { expect, test } from 'vitest';
import {
  isAirlineCallsign,
  normalizeAdsbLol,
  parseReplayFile,
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
        callsign: 'UAL1372',
        typeCode: 'B39M',
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

test('normalizeAdsbLol drops non-ICAO hex, private aircraft and missing positions', () => {
  const payload = {
    ac: [
      { ...united, hex: '~aa7f28' },
      { ...united, flight: 'N352LL  ' },
      { ...united, lat: undefined },
      'not an object',
    ],
  };

  const snapshot = normalizeAdsbLol(payload, 1000);

  expect(snapshot.aircraft).toEqual([]);
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

test('parseReplayFile requires at least one frame', () => {
  const frame = normalizeAdsbLol({ ac: [united] }, 1000);

  const replay = parseReplayFile({
    area: 'ord',
    recordedAt: 1000,
    frames: [frame],
  });

  expect(replay.frames).toHaveLength(1);
  expect(() =>
    parseReplayFile({ area: 'ord', recordedAt: 1000, frames: [] }),
  ).toThrow('Invalid replay file');
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

test('parseSnapshot accepts null nullable fields', () => {
  const snapshot = normalizeAdsbLol({ ac: [united] }, 1000);
  const nulled = {
    ...snapshot,
    aircraft: [
      {
        ...snapshot.aircraft[0],
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
