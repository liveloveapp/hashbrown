// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { Aircraft } from '../aircraft';
import { altText, createTextMeasure } from './tag-measure';

const plane = {
  label: 'UAL1',
  altitudeFt: 4500,
  onGround: false,
} as Aircraft;

test('a tag is as wide as its text, its padding and border, and 2 px of slack for tabular digits', () => {
  const measure = createTextMeasure(document.createElement('div'));

  const width = measure.width('UAL1', '4,500');

  // Without a canvas (jsdom): 7.5 px a label character and 6.6 px a digit.
  expect(width).toBe(Math.ceil(4 * 7.5 + 4 + 5 * 6.6 + 16 + 2));
  measure.destroy();
});

test('a tag without an altitude keeps the gap of its empty altitude span', () => {
  const measure = createTextMeasure(document.createElement('div'));

  const width = measure.width('UAL1', '');

  // The span stays in the tag, and an empty inline box still takes its margin.
  expect(width).toBe(4 * 7.5 + 4 + 16 + 2);
  measure.destroy();
});

test('altText matches the tag: feet with a comma, GND on the ground, empty when unknown', () => {
  const texts = [
    altText(plane),
    altText({ ...plane, onGround: true }),
    altText({ ...plane, altitudeFt: null }),
  ];

  expect(texts).toEqual(['4,500', 'GND', '']);
});
