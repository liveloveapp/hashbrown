import { expect, test } from 'vitest';
import type { Aircraft } from './aircraft';
import {
  aircraftDetailView,
  type AircraftDetailView,
  DETAIL_TRIM_LEVELS,
  fitDetailView,
  trimDetailView,
} from './detail-view';
import { applySnapshot, INITIAL_STATE } from './store';

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

function fullView(now?: number): AircraftDetailView | null {
  const loaded = applySnapshot(INITIAL_STATE, { at: 1000, aircraft: [full] });
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

  return aircraftDetailView(state, 'AAAAAA', now);
}

/** Every row label in a view, in order. */
function labels(view: AircraftDetailView | null): string[] {
  return (view?.groups ?? []).flatMap((group) =>
    group.rows.map((row) => row.label),
  );
}

test('aircraftDetailView groups every reading with units', () => {
  const view = fullView();

  expect(view).toEqual({
    hex: 'aaaaaa',
    label: 'UAL100',
    subtitle: 'United Airlines',
    hiddenRows: 0,
    groups: [
      {
        title: 'Identity',
        rows: [
          { label: 'Type', value: 'Boeing 737 MAX 9', wide: true },
          { label: 'Emergency', value: 'General emergency', wide: true },
          { label: 'Registration', value: 'N37502' },
          { label: 'ICAO type', value: 'B39M' },
          { label: 'Kind', value: 'Jet' },
          { label: 'Model year', value: '2019' },
          { label: 'Callsign', value: 'UAL100' },
          { label: 'Squawk', value: '7700' },
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
          { label: 'Vertical rate', value: '-800 fpm' },
          { label: 'QNH', value: '1013.2 hPa' },
          { label: 'Altimeter', value: '29.92 inHg' },
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
          { label: 'Position', value: '47.5716, -122.3088', wide: true },
          { label: 'Last message', value: '3s ago' },
          { label: 'Route', value: 'SFO → SEA · scheduled route', wide: true },
        ],
      },
    ],
  });
});

test('aircraftDetailView counts the message age up from the snapshot time', () => {
  const ages = [fullView(1000), fullView(5400), fullView(64_000)].map(
    (view) =>
      view?.groups
        .flatMap((group) => group.rows)
        .find((row) => row.label === 'Last message')?.value,
  );

  expect(ages).toEqual(['3s ago', '7s ago', '66s ago']);
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
    hiddenRows: 0,
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
        rows: [{ label: 'Position', value: '47.5716, -122.3088', wide: true }],
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

test('trimDetailView drops weather, then speed details, then the speed group', () => {
  const view = fullView();
  if (view === null) throw new Error('no view');

  const levels = Array.from({ length: DETAIL_TRIM_LEVELS + 1 }, (_, level) =>
    trimDetailView(view, level),
  );

  expect(levels.map((v) => v.hiddenRows)).toEqual([0, 2, 5, 7, 9]);
  expect(labels(levels[1])).not.toContain('Wind');
  expect(labels(levels[2])).toContain('Ground speed');
  expect(labels(levels[2])).not.toContain('Mach');
  expect(labels(levels[3])).toContain('Track');
  expect(labels(levels[3])).not.toContain('Magnetic heading');
  expect(levels[4]?.groups.map((group) => group.title)).toEqual([
    'Identity',
    'Altitude',
    'Position',
  ]);
});

test('fitDetailView keeps the fullest view that fits, or none', () => {
  const view = fullView();
  if (view === null) throw new Error('no view');
  const rows = (v: AircraftDetailView) =>
    v.groups.reduce((sum, group) => sum + group.rows.length, 0);
  const measure = (v: AircraftDetailView) => rows(v) * 10;

  const roomy = fitDetailView(view, 1000, measure);
  const tight = fitDetailView(view, 250, measure);
  const tiny = fitDetailView(view, 100, measure);

  expect(roomy?.hiddenRows).toBe(0);
  expect(tight?.hiddenRows).toBe(5);
  expect(tiny).toBeNull();
});
