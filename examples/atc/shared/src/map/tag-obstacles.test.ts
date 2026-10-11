import { expect, test } from 'vitest';
import { createObstacleGrid, intersects } from './tag-obstacles';

test('a rect covering another plane icon is blocked; its own plane is not', () => {
  const covers = createObstacleGrid([
    { hex: 'a', x: 100, y: 100 },
    { hex: 'b', x: 150, y: 100 },
  ]);
  const rect = { left: 113, top: 90, right: 173, bottom: 110 };

  const results = [covers(rect, 'a'), covers(rect, 'b')];

  expect(results).toEqual([true, false]);
});

test('icons just clear of a rect do not block it', () => {
  const covers = createObstacleGrid([{ hex: 'b', x: 185, y: 100 }]);

  const result = covers({ left: 113, top: 90, right: 173, bottom: 110 }, 'a');

  expect(result).toBe(false);
});

test('a question only looks at the planes near the rect, not at every plane', () => {
  let reads = 0;
  const planes = Array.from({ length: 500 }, (_, i) => {
    const x = (i * 7919) % 1600;
    const y = (i * 104729) % 1000;
    return {
      hex: `p${i}`,
      get x() {
        reads++;
        return x;
      },
      get y() {
        reads++;
        return y;
      },
    };
  });
  const covers = createObstacleGrid(planes);
  const built = reads;

  for (let i = 0; i < 30; i++) {
    covers(
      { left: i * 50, top: i * 30, right: i * 50 + 60, bottom: i * 30 + 20 },
      'z',
    );
  }

  // Each question reads the x and y of a handful of planes, not of all 500.
  expect((reads - built) / 30).toBeLessThan(40);
});

test('intersects keeps a gap when asked', () => {
  const a = { left: 0, top: 0, right: 10, bottom: 10 };
  const b = { left: 11, top: 0, right: 20, bottom: 10 };

  const results = [intersects(a, b), intersects(a, b, 2)];

  expect(results).toEqual([false, true]);
});
