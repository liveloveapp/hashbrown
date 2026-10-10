import { expect, test } from 'vitest';
import { isNearBottom, sheetAfterDrag } from './sheet';

test('a scroller at the end follows new content', () => {
  const metrics = { scrollTop: 500, scrollHeight: 1000, clientHeight: 500 };

  expect(isNearBottom(metrics)).toBe(true);
});

test('a scroller within the threshold still follows', () => {
  const metrics = { scrollTop: 460, scrollHeight: 1000, clientHeight: 500 };

  expect(isNearBottom(metrics)).toBe(true);
});

test('a user who scrolled up is left alone', () => {
  const metrics = { scrollTop: 100, scrollHeight: 1000, clientHeight: 500 };

  expect(isNearBottom(metrics)).toBe(false);
});

test('dragging the handle up opens the sheet and down closes it', () => {
  expect(sheetAfterDrag(false, -80)).toBe(true);
  expect(sheetAfterDrag(true, 80)).toBe(false);
  expect(sheetAfterDrag(true, -80)).toBe(true);
});

test('a tap on the handle toggles the sheet', () => {
  expect(sheetAfterDrag(false, 2)).toBe(true);
  expect(sheetAfterDrag(true, -3)).toBe(false);
});
