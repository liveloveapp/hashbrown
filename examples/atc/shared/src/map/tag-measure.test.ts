// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { createTextMeasure } from './tag-measure';

test('a tag is as wide as its label, the gap, a space and the altitude, its padding and border, and 2 px of slack', () => {
  const measure = createTextMeasure(document.createElement('div'));

  const width = measure.width('UAL1', '4,500');

  // Without a canvas (jsdom): 7.5 px a label character, and 6.6 px for the
  // space and each character of the monospace altitude.
  expect(width).toBe(Math.ceil(4 * 7.5 + 4 + (1 + 5) * 6.6 + 16 + 2));
  measure.destroy();
});

test('a tag without an altitude keeps the gap of its empty altitude span', () => {
  const measure = createTextMeasure(document.createElement('div'));

  const width = measure.width('UAL1', '');

  // The span stays in the tag, and an empty inline box still takes its margin.
  expect(width).toBe(4 * 7.5 + 4 + 16 + 2);
  measure.destroy();
});
