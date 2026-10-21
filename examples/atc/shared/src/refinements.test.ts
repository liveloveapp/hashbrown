import { expect, test } from 'vitest';
import type { Aircraft } from './aircraft';
import { type MapFilter, resolveFilter } from './find-aircraft';
import { NO_REFINEMENTS, refinements, stableRefinements } from './refinements';
import { type AppliedMapFilter, applyMapFilter, INITIAL_STATE } from './store';
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

function plane(
  callsign: string,
  hex: string,
  overrides: Partial<Aircraft> = {},
): Aircraft {
  return testAircraft({ hex, callsign, label: callsign, ...overrides });
}

const texts = (list: readonly { text: string }[]) => list.map((r) => r.text);

// Mostly United, at mixed altitudes, one of them a turboprop; one farther
// than 10 nm from Seattle.
const mixed = [
  plane('UAL1', 'a00001', { altitudeFt: 3000 }),
  plane('UAL2', 'a00002', { altitudeFt: 12000 }),
  plane('UAL3', 'a00003', { altitudeFt: 30000, lat: 47.7 }),
  plane('DAL4', 'a00004', { altitudeFt: 8000 }),
  plane('N123AB', 'a00005', { altitudeFt: 2000, kind: 'single' }),
];

test('no refinements without a filter', () => {
  const result = refinements(null, mixed);

  expect(result).toEqual([]);
});

test('refinements follow the rules in order and never repeat a clause', () => {
  const none = apply({ near: { airport: 'KSEA', radiusNm: 40 } });
  const altitude = apply({ maxAltitudeFt: 40000 });
  const everything = apply({
    kind: 'jet',
    minAltitudeFt: 1000,
    airline: 'United',
    near: { airport: 'KSEA', radiusNm: 5 },
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

  expect(texts(first)).toEqual(['Below 5,000 ft', 'Only United Airlines']);
  expect(texts(second)).toEqual(['Only United Airlines', 'Only jets']);
  expect(texts(third)).toEqual(['Below 5,000 ft', 'Within 10 nm']);
  expect(last).toEqual([]);
});

test('an airline is suggested only when it is common among the matches', () => {
  const applied = apply({ minAltitudeFt: 1000, kind: 'jet' });
  const few = [
    plane('UAL1', 'b00001'),
    plane('UAL2', 'b00002'),
    plane('DAL3', 'b00003'),
  ];
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
  expect(texts(common)).toEqual(['Only United Airlines']);
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

test('a refinement that would keep every match or none is not suggested', () => {
  const applied = apply({ near: { airport: 'KSEA', radiusNm: 40 } });
  const allLowJets = [
    plane('UAL1', 'e00001', { altitudeFt: 3000 }),
    plane('DAL2', 'e00002', { altitudeFt: 4000 }),
  ];
  const allHighProps = [
    plane('N1', 'f00001', { altitudeFt: 9000, kind: 'single' }),
    plane('N2', 'f00002', { altitudeFt: 11000, kind: 'twin' }),
  ];
  const allUnited = [
    plane('UAL1', 'g00001', { altitudeFt: 3000 }),
    plane('UAL2', 'g00002', { altitudeFt: 9000 }),
    plane('UAL3', 'g00003', { altitudeFt: 9000 }),
  ];

  const low = refinements(applied, allLowJets);
  const high = refinements(applied, allHighProps);
  const united = refinements(applied, allUnited);

  expect(low).toEqual([]);
  expect(high).toEqual([]);
  expect(texts(united)).toEqual(['Below 5,000 ft']);
});

test('only jets is never suggested for a filter that names a type', () => {
  const applied = apply({ typeCode: 'B738', maxAltitudeFt: 40000 });
  const aircraft = [
    plane('N1', 'h00001', { kind: 'single' }),
    plane('N2', 'h00002', { kind: 'jet' }),
  ];

  const result = refinements(applied, aircraft);

  expect(texts(result)).not.toContain('Only jets');
});

test('an airline code without a known name is never suggested', () => {
  const applied = apply({ minAltitudeFt: 1000 });
  const charter = [
    plane('EJA1', 'i00001'),
    plane('EJA2', 'i00002'),
    plane('EJA3', 'i00003'),
    plane('N1', 'i00004'),
  ];

  const result = refinements(applied, charter);

  expect(result).toEqual([]);
});

test('within 10 nm is suggested only while the near clause resolved', () => {
  const filter = {
    ...emptyFilter(),
    kind: 'jet' as const,
    minAltitudeFt: 1000,
    near: { airport: 'KZZZ', radiusNm: 40 },
  };
  const dropped = applyMapFilter(INITIAL_STATE, filter).mapFilter;
  const known = apply({ ...filter, near: { airport: 'KSEA', radiusNm: 40 } });

  const unknown = refinements(dropped, mixed);
  const resolved = refinements(known, mixed);

  expect(dropped?.unknownPlaces).toEqual(['KZZZ']);
  expect(texts(unknown)).not.toContain('Within 10 nm');
  expect(texts(resolved)).toContain('Within 10 nm');
});

test('stable refinements keep their list while traffic changes under the same filter', () => {
  const applied = apply({ near: { airport: 'KSEA', radiusNm: 40 } });
  const first = stableRefinements(NO_REFINEMENTS, applied, mixed);
  const moved = mixed.map((a) => ({ ...a, altitudeFt: 2000 }));

  const second = stableRefinements(first, applied, moved);

  expect(texts(first.list)).toEqual(['Below 5,000 ft', 'Only United Airlines']);
  expect(second).toBe(first);
});

test('stable refinements recompute for a new filter and clear without one', () => {
  const near = apply({ near: { airport: 'KSEA', radiusNm: 40 } });
  const united = apply({ airline: 'United' });
  const first = stableRefinements(NO_REFINEMENTS, near, mixed);

  const second = stableRefinements(first, united, mixed);
  const cleared = stableRefinements(second, null, mixed);

  expect(second.key).toBe(united.filter);
  expect(texts(second.list)).toEqual(['Below 5,000 ft']);
  expect(cleared).toBe(NO_REFINEMENTS);
});

test('stable refinements keep trying while the filter matches nothing', () => {
  const applied = apply({ airline: 'Alaska' });
  const alaska = [
    plane('ASA1', 'j00001', { altitudeFt: 3000 }),
    plane('ASA2', 'j00002', { altitudeFt: 30000 }),
  ];
  const empty = stableRefinements(NO_REFINEMENTS, applied, mixed);

  const still = stableRefinements(empty, applied, mixed);
  const later = stableRefinements(empty, applied, [...mixed, ...alaska]);

  expect(empty.list).toEqual([]);
  expect(still).toBe(empty);
  expect(texts(later.list)).toEqual(['Below 5,000 ft']);
  expect(later.key).toBe(applied.filter);
});
