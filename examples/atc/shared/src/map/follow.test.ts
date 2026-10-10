import { expect, test } from 'vitest';
import { followPanOffset } from './follow';

test('followPanOffset pans by whole pixels, only when at least 1 px off centre', () => {
  const centre = { x: 200, y: 150 };

  const offsets = [
    followPanOffset({ x: 200.4, y: 150.6 }, centre),
    followPanOffset({ x: 201.2, y: 150 }, centre),
    followPanOffset({ x: 190.6, y: 160.4 }, centre),
  ];

  expect(offsets).toEqual([null, { x: 1, y: 0 }, { x: -9, y: 10 }]);
});
