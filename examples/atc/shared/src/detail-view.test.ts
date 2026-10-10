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

test('aircraftDetailView leads with a summary and groups every other reading with units', () => {
  const view = fullView();

  expect(view).toEqual({
    hex: 'aaaaaa',
    label: 'UAL100',
    subtitle: 'United Airlines',
    hiddenRows: 0,
    summary: {
      type: 'Boeing 737 MAX 9',
      route: 'SFO → SEA · scheduled route',
      figures: [
        { label: 'Altitude', value: '5,000 ft' },
        { label: 'Speed', value: '240 kt' },
        { label: 'Heading', value: '180°' },
      ],
    },
    groups: [
      {
        title: 'Identity',
        rows: [
          {
            label: 'Emergency',
            value: 'General emergency',
            wide: true,
            text: true,
          },
          { label: 'Registration', value: 'N37502' },
          { label: 'ICAO type', value: 'B39M' },
          { label: 'Kind', value: 'Jet', text: true },
          { label: 'Model year', value: '2019' },
          { label: 'Callsign', value: 'UAL100' },
          { label: 'Squawk', value: '7700' },
          { label: 'Category', value: 'A3, large', text: true },
          { label: 'Hex', value: 'AAAAAA' },
        ],
      },
      {
        title: 'Altitude',
        rows: [
          { label: 'Geometric altitude', value: '5,125 ft' },
          { label: 'Selected altitude', value: '4,000 ft' },
          { label: 'Vertical rate', value: '-800 fpm' },
          { label: 'QNH', value: '1013.2 hPa' },
          { label: 'Altimeter', value: '29.92 inHg' },
        ],
      },
      {
        id: 'speed',
        title: 'Speed and direction',
        rows: [
          { id: 'ias', label: 'Indicated airspeed', value: '231 kt' },
          { id: 'tas', label: 'True airspeed', value: '248 kt' },
          { id: 'mach', label: 'Mach', value: '0.385' },
          { id: 'magnetic-heading', label: 'Magnetic heading', value: '165°' },
          { id: 'selected-heading', label: 'Selected heading', value: '170°' },
          { id: 'wind', label: 'Wind', value: '262° at 18 kt' },
          { id: 'outside-air', label: 'Outside air', value: '4 °C' },
        ],
      },
      {
        title: 'Position',
        rows: [
          { label: 'Position', value: '47.5716, -122.3088', wide: true },
          { id: 'age', label: 'Last message', value: '3s ago' },
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
        .find((row) => row.id === 'age')?.value,
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
    summary: { type: null, route: null, figures: [] },
    groups: [
      {
        title: 'Identity',
        rows: [
          { label: 'Kind', value: 'Jet', text: true },
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

  expect(ground?.summary.figures[0]).toEqual({
    label: 'Altitude',
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

  expect(levels.map((v) => v.hiddenRows)).toEqual([0, 2, 5, 7]);
  expect(labels(levels[1])).not.toContain('Wind');
  expect(labels(levels[2])).toContain('Magnetic heading');
  expect(labels(levels[2])).not.toContain('Mach');
  expect(levels[3]?.groups.map((group) => group.title)).toEqual([
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
  const tight = fitDetailView(view, 200, measure);
  const tiny = fitDetailView(view, 100, measure);

  expect(roomy?.hiddenRows).toBe(0);
  expect(tight?.hiddenRows).toBe(5);
  expect(tiny).toBeNull();
});

test('trimDetailView trims by row id, so relabelled rows still trim', () => {
  const view: AircraftDetailView = {
    hex: 'aaaaaa',
    label: 'UAL100',
    subtitle: null,
    summary: { type: null, route: null, figures: [] },
    groups: [
      {
        id: 'speed',
        title: 'Speed',
        rows: [
          { id: 'wind', label: 'Weather', value: '262° at 18 kt' },
          { label: 'Ground speed', value: '110 kt' },
        ],
      },
    ],
    hiddenRows: 0,
  };

  const trimmed = trimDetailView(view, 1);

  expect(trimmed.groups[0]?.rows.map((row) => row.label)).toEqual([
    'Ground speed',
  ]);
  expect(trimmed.hiddenRows).toBe(1);
});
