import { expect, test } from 'vitest';
import { ATC_MARK } from './atc-mark';

test('the ATC lettermark keeps its viewBox, stroke and three letter paths', () => {
  const mark = ATC_MARK;

  expect(mark.viewBox).toBe('0 0 250 80');
  expect(mark.strokeWidth).toBe(10);
  expect(mark.paths).toEqual([
    'M8 72 L40 8 L72 72',
    'M92 8 H148 M120 8 V72',
    'M232 20 A32 32 0 1 0 232 60',
  ]);
});
