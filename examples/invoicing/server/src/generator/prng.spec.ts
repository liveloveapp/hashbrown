import { expect, test } from 'vitest';
import { createRandom } from './prng';

test('the same seed yields the same sequence', () => {
  const a = createRandom(42);
  const b = createRandom(42);

  const first = [a.next(), a.next(), a.next(), a.int(1, 6), a.int(1, 6)];
  const second = [b.next(), b.next(), b.next(), b.int(1, 6), b.int(1, 6)];

  expect(second).toEqual(first);
});

test('different seeds yield different sequences', () => {
  const a = createRandom(1);
  const b = createRandom(2);

  expect([a.next(), a.next()]).not.toEqual([b.next(), b.next()]);
});

test('floats stay in [0, 1) and ints are inclusive of both bounds', () => {
  const random = createRandom(7);
  const seen = new Set<number>();

  for (let i = 0; i < 2000; i += 1) {
    const value = random.next();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    seen.add(random.int(3, 5));
  }

  expect([...seen].sort()).toEqual([3, 4, 5]);
});
