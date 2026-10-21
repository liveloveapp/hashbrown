import { expect, test } from 'vitest';
import { type MapFilter, resolveFilter } from './find-aircraft';
import { refinements } from './refinements';
import { type AppliedMapFilter, INITIAL_STATE } from './store';
import { testAircraft } from './testing';

function emptyFilter(): MapFilter {
  return {
    airline: null,
    typeCode: null,
    kind: null,
    minAltitudeFt: null,
    maxAltitudeFt: null,
    approaching: null,
    near: null,
    inAirspace: null,
  };
}

function apply(overrides: Partial<MapFilter>): AppliedMapFilter {
  const filter = { ...emptyFilter(), ...overrides };
  const resolved = resolveFilter(INITIAL_STATE, filter);
  if ('unknownPlaces' in resolved) {
    throw new Error('unknown place in test filter');
  }

  return { filter, resolved, unknownPlaces: [] };
}

function plane(callsign: string, hex: string) {
  return testAircraft({ hex, callsign, label: callsign });
}

const mixed = [
  plane('UAL1', 'a00001'),
  plane('UAL2', 'a00002'),
  plane('UAL3', 'a00003'),
  plane('DAL4', 'a00004'),
  plane('N123AB', 'a00005'),
];

test('no refinements without a filter', () => {
  const result = refinements(null, mixed);

  expect(result).toEqual([]);
});

test('refinements follow the rules in order and never repeat a clause', () => {
  const none = apply({});
  const altitude = apply({ maxAltitudeFt: 10000 });
  const everything = apply({
    kind: 'jet',
    minAltitudeFt: 1000,
    airline: 'United',
    near: { airport: 'KBDN', radiusNm: 5 },
  });
  const wide = apply({
    near: { airport: 'KSEA', radiusNm: 40 },
    kind: 'jet',
    airline: 'United',
  });

  const first = refinements(none, mixed);
  const second = refinements(altitude, mixed);
  const third = refinements(wide, mixed);
  const last = refinements(everything, mixed);

  expect(first.map((r) => r.text)).toEqual([
    'Below 5,000 ft',
    'Only United Airlines',
  ]);
  expect(second.map((r) => r.text)).toEqual([
    'Only United Airlines',
    'Only jets',
  ]);
  expect(third.map((r) => r.text)).toEqual(['Below 5,000 ft', 'Within 10 nm']);
  expect(last).toEqual([]);
});

test('an airline is suggested only when it is common among the matches', () => {
  const applied = apply({ minAltitudeFt: 1000, kind: 'jet' });
  const few = [plane('UAL1', 'b00001'), plane('UAL2', 'b00002')];
  const spread = [
    plane('UAL1', 'c00001'),
    plane('UAL2', 'c00002'),
    plane('UAL3', 'c00003'),
    plane('DAL4', 'c00004'),
    plane('ASA5', 'c00005'),
    plane('N1', 'c00006'),
    plane('N2', 'c00007'),
    plane('N3', 'c00008'),
  ];

  const tooFew = refinements(applied, few);
  const tooSpread = refinements(applied, spread);
  const common = refinements(applied, mixed);

  expect(tooFew).toEqual([]);
  expect(tooSpread).toEqual([]);
  expect(common).toEqual([{ text: 'Only United Airlines' }]);
});

test('no refinements when the applied filter matches no aircraft', () => {
  const applied = apply({ airline: 'Alaska' });

  const result = refinements(applied, mixed);

  expect(result).toEqual([]);
});

test('a tie between airlines goes to the first name alphabetically', () => {
  const applied = apply({ minAltitudeFt: 1000, kind: 'jet' });
  const tied = [
    plane('UAL1', 'd00001'),
    plane('UAL2', 'd00002'),
    plane('UAL3', 'd00003'),
    plane('DAL1', 'd00004'),
    plane('DAL2', 'd00005'),
    plane('DAL3', 'd00006'),
  ];

  const result = refinements(applied, tied);

  expect(result).toEqual([{ text: 'Only Delta Air Lines' }]);
});

test('no airline is suggested when the filter already names one', () => {
  const applied = apply({
    airline: 'United',
    minAltitudeFt: 1000,
    kind: 'jet',
  });

  const result = refinements(applied, mixed);

  expect(result).toEqual([]);
});
