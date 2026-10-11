import { expect, test } from 'vitest';
import { currentCycle } from './cycle';

test('the cycle effective on 1 October 2026 is 2610', () => {
  const date = new Date(Date.UTC(2026, 9, 10));

  const cycle = currentCycle(date);

  expect(cycle).toEqual({
    ident: '2610',
    effective: '2026-10-01',
    nasrDate: '01_Oct_2026',
  });
});

test('a new cycle starts every 28 days', () => {
  const lastDay = new Date(Date.UTC(2026, 9, 28));
  const firstDay = new Date(Date.UTC(2026, 9, 29));

  const before = currentCycle(lastDay);
  const after = currentCycle(firstDay);

  expect(before.ident).toBe('2610');
  expect(after).toEqual({
    ident: '2611',
    effective: '2026-10-29',
    nasrDate: '29_Oct_2026',
  });
});

test('the first cycle of a year is numbered 01', () => {
  const date = new Date(Date.UTC(2026, 0, 23));

  const cycle = currentCycle(date);

  expect(cycle.ident).toBe('2601');
  expect(cycle.effective).toBe('2026-01-22');
});

test('cycles before the reference date count backwards', () => {
  const date = new Date(Date.UTC(2025, 11, 30));

  const cycle = currentCycle(date);

  expect(cycle.ident).toBe('2513');
  expect(cycle.effective).toBe('2025-12-25');
});
