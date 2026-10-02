import { expect, test } from 'vitest';
import { appendServerTiming, createServerTiming } from './server-timing';

test('measure records each phase and the header lists them in order', async () => {
  const ticks = [0, 4.25, 10, 22.5];
  const timing = createServerTiming(() => ticks.shift() ?? 0);

  const session = await timing.measure('session', async () => 'id');
  const snapshot = await timing.measure('snapshot', async () => 'json');

  expect([session, snapshot]).toEqual(['id', 'json']);
  expect(timing.header()).toBe('session;dur=4.3, snapshot;dur=12.5');
});

test('a phase that throws is still recorded, and the error propagates', async () => {
  const ticks = [0, 3];
  const timing = createServerTiming(() => ticks.shift() ?? 0);

  const failed = timing.measure('session', async () => {
    throw new Error('stale');
  });

  await expect(failed).rejects.toThrow('stale');
  expect(timing.header()).toBe('session;dur=3.0');
});

test('appendServerTiming joins an earlier header without losing it', () => {
  const values = [
    appendServerTiming(undefined, 'session;dur=1.0'),
    appendServerTiming('init;dur=40.0', 'session;dur=1.0'),
    appendServerTiming('init;dur=40.0', ''),
  ];

  expect(values).toEqual([
    'session;dur=1.0',
    'init;dur=40.0, session;dur=1.0',
    'init;dur=40.0',
  ]);
});
