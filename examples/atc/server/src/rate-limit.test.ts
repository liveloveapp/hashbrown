import { expect, test } from 'vitest';
import { createFixedWindowLimiter } from './rate-limit';

/** A clock the test moves by hand. */
function clock(start = 1_000) {
  let time = start;

  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

test('the limiter allows up to the limit and blocks the next', () => {
  const time = clock();
  const limiter = createFixedWindowLimiter({
    limit: 3,
    windowMs: 60_000,
    now: time.now,
  });

  const results = [1, 2, 3, 4].map(() => limiter.take('a'));

  expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
  expect(results[3].retryAfterSec).toBe(60);
});

test('the limiter reports the seconds left in the window, rounded up', () => {
  const time = clock();
  const limiter = createFixedWindowLimiter({
    limit: 1,
    windowMs: 60_000,
    now: time.now,
  });
  limiter.take('a');

  time.advance(45_500);
  const blocked = limiter.take('a');

  expect(blocked).toEqual({ allowed: false, retryAfterSec: 15 });
});

test('the limiter resets after the window', () => {
  const time = clock();
  const limiter = createFixedWindowLimiter({
    limit: 1,
    windowMs: 60_000,
    now: time.now,
  });
  limiter.take('a');
  expect(limiter.take('a').allowed).toBe(false);

  time.advance(60_000);
  const result = limiter.take('a');

  expect(result.allowed).toBe(true);
});

test('the limiter counts keys independently', () => {
  const time = clock();
  const limiter = createFixedWindowLimiter({
    limit: 1,
    windowMs: 60_000,
    now: time.now,
  });
  limiter.take('a');

  const other = limiter.take('b');
  const again = limiter.take('a');

  expect(other.allowed).toBe(true);
  expect(again.allowed).toBe(false);
});

test('the limiter prunes expired windows and bounds the keys it holds', () => {
  const time = clock();
  const limiter = createFixedWindowLimiter({
    limit: 1,
    windowMs: 60_000,
    now: time.now,
    maxKeys: 3,
  });
  limiter.take('a');
  limiter.take('b');
  limiter.take('c');

  limiter.take('d');
  const evicted = limiter.take('a');
  const kept = limiter.take('d');

  expect(evicted.allowed).toBe(true);
  expect(kept.allowed).toBe(false);
});

test('the limiter drops expired windows before evicting live ones', () => {
  const time = clock();
  const limiter = createFixedWindowLimiter({
    limit: 1,
    windowMs: 60_000,
    now: time.now,
    maxKeys: 2,
  });
  limiter.take('old');
  time.advance(30_000);
  limiter.take('live');
  time.advance(30_000);

  limiter.take('new');
  const live = limiter.take('live');

  expect(live.allowed).toBe(false);
});
