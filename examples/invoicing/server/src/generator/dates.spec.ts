import { expect, test } from 'vitest';
import { addDays, daysBetween, monthAt } from './dates';

test('addDays crosses month and year boundaries', () => {
  expect(addDays('2026-09-01', 14)).toBe('2026-09-15');
  expect(addDays('2024-12-25', 10)).toBe('2025-01-04');
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
});

test('daysBetween is signed and whole', () => {
  expect(daysBetween('2026-09-01', '2026-09-15')).toBe(14);
  expect(daysBetween('2026-09-15', '2026-09-01')).toBe(-14);
  expect(daysBetween('2026-09-01', '2026-09-01')).toBe(0);
});

test('monthAt walks forward from a first month', () => {
  expect(monthAt('2024-10', 0)).toBe('2024-10');
  expect(monthAt('2024-10', 3)).toBe('2025-01');
  expect(monthAt('2024-10', 23)).toBe('2026-09');
});
