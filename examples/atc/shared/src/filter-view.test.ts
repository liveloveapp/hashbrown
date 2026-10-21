import { expect, test } from 'vitest';
import type { MapFilter } from './find-aircraft';
import { resolveFilter } from './find-aircraft';
import { filterChips, filterSummary, parseStreamedFilter } from './filter-view';
import { INITIAL_STATE } from './store';

/** A filter with every field "any", overridden by `overrides`. */
function filterOf(overrides: Partial<MapFilter> = {}): MapFilter {
  return {
    airline: null,
    typeCode: null,
    kind: null,
    minAltitudeFt: null,
    maxAltitudeFt: null,
    approaching: null,
    near: null,
    inAirspace: null,
    ...overrides,
  };
}

test('a half-streamed airport code is a streaming chip and never resolves', () => {
  const parsed = parseStreamedFilter({ near: { airport: 'KSE' } });

  const chips = filterChips(
    INITIAL_STATE,
    { ...parsed.filter, ...parsed.pending } as MapFilter,
    new Set(Object.keys(parsed.pending) as (keyof MapFilter)[]),
  );

  expect(parsed.complete.has('near')).toBe(false);
  expect(parsed.filter.near).toBeNull();
  expect(chips).toEqual([
    { key: 'near', label: 'Near KSE', state: 'streaming' },
  ]);
});

test('a malformed streaming value yields no chip and does not throw', () => {
  const broken = { near: 7, kind: { x: 1 } } as unknown as MapFilter;

  const chips = filterChips(INITIAL_STATE, broken, new Set(['near', 'kind']));

  expect(chips).toEqual([]);
});

test('a complete unknown code is an unknown chip', () => {
  const filter = filterOf({ approaching: 'KZZZ' });

  const chips = filterChips(INITIAL_STATE, filter, new Set());

  expect(chips).toEqual([
    { key: 'approaching', label: 'Approaching KZZZ', state: 'unknown' },
  ]);
});

test('a complete known code is a set chip', () => {
  const filter = filterOf({ near: { airport: 'KSEA', radiusNm: 25 } });

  const chips = filterChips(INITIAL_STATE, filter, new Set());

  expect(chips).toEqual([
    { key: 'near', label: 'Within 25 nm of KSEA', state: 'set' },
  ]);
});

test('labels read naturally', () => {
  const filter = filterOf({ kind: 'jet', maxAltitudeFt: 10000 });

  const chips = filterChips(INITIAL_STATE, filter, new Set());

  expect(chips.map((chip) => chip.label)).toEqual(['Jets', 'Below 10,000 ft']);
});

test('airspace, airline and type labels', () => {
  const filter = filterOf({
    airline: 'UAL',
    typeCode: 'B738',
    minAltitudeFt: 2500,
    inAirspace: { airport: 'KSEA', class: 'B' },
  });

  const chips = filterChips(INITIAL_STATE, filter, new Set());

  expect(chips.map((chip) => chip.label)).toEqual([
    'Airline UAL',
    'Type B738',
    'Above 2,500 ft',
    'In KSEA Class B airspace',
  ]);
});

test('filterSummary reads as a plain phrase', () => {
  const filter = filterOf({
    kind: 'jet',
    maxAltitudeFt: 10000,
    near: { airport: 'KSEA', radiusNm: 25 },
  });

  const summary = filterSummary(filter);

  expect(summary).toBe('jets below 10,000 ft within 25 nm of KSEA');
});

test('filterSummary of an empty filter is empty', () => {
  const summary = filterSummary(filterOf());

  expect(summary).toBe('');
});

test('filterSummary without a kind says aircraft', () => {
  const summary = filterSummary(filterOf({ approaching: 'KSEA' }));

  expect(summary).toBe('aircraft approaching KSEA');
});

test('an empty partial parses to an all-null filter with nothing complete', () => {
  const parsed = parseStreamedFilter(undefined);

  expect(parsed.filter).toEqual(filterOf());
  expect(parsed.complete.size).toBe(0);
  expect(parsed.pending).toEqual({});
});

test('complete fields are recorded, explicit nulls included', () => {
  const parsed = parseStreamedFilter({
    kind: 'jet',
    maxAltitudeFt: 10000,
    airline: null,
    near: { airport: 'KSEA', radiusNm: 25 },
  });

  expect([...parsed.complete].sort()).toEqual([
    'airline',
    'kind',
    'maxAltitudeFt',
    'near',
  ]);
  expect(parsed.filter.near).toEqual({ airport: 'KSEA', radiusNm: 25 });
  expect(parsed.filter.minAltitudeFt).toBeNull();
});

test('the sanitized filter of a malformed partial never throws in resolveFilter', () => {
  const partials: unknown[] = [
    { near: {} },
    { near: { airport: 5, radiusNm: 'x' } },
    { near: { airport: 'KSE' } },
    { near: 'KSEA' },
    { inAirspace: { class: 'B' } },
    { inAirspace: { airport: 'KSEA', class: 'Z' } },
    { inAirspace: [] },
    { approaching: 12 },
    { kind: 'blimp' },
    { minAltitudeFt: 'high', maxAltitudeFt: Number.NaN },
    'nonsense',
    [1, 2],
    null,
  ];

  for (const partial of partials) {
    const { filter } = parseStreamedFilter(partial);

    expect(() => resolveFilter(INITIAL_STATE, filter)).not.toThrow();
  }
});

test('a malformed field is pending, not complete, and null in the filter', () => {
  const parsed = parseStreamedFilter({ kind: 'blimp', airline: 'UAL' });

  expect(parsed.filter.kind).toBeNull();
  expect(parsed.complete.has('kind')).toBe(false);
  expect(parsed.pending).toEqual({ kind: 'blimp' });
  expect(parsed.complete.has('airline')).toBe(true);
});
