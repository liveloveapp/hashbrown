import { expect, test } from 'vitest';
import {
  createRunTimer,
  runTimerOf,
  type RunTimingLine,
  timeContext,
} from './run-timing';

const clock =
  (...ticks: number[]) =>
  () =>
    ticks.shift() ?? 0;

test('each step logs its offset from the run start, its duration and outcome', async () => {
  const lines: RunTimingLine[] = [];
  const timer = createRunTimer(
    '/assistant',
    'run-1',
    (line) => lines.push(line),
    clock(100, 1300, 1340, 5000, 5100, 5200),
  );

  await timer.time('ledgerSummary', async () => 'ok');
  const failure = await timer
    .time('aging', async () => {
      throw new Error('bad_currency');
    })
    .catch((error: unknown) => error);
  timer.done();

  expect(failure).toEqual(new Error('bad_currency'));
  expect(lines).toEqual([
    {
      event: 'invoicing.run.step',
      route: '/assistant',
      runId: 'run-1',
      step: 'ledgerSummary',
      at: 1200,
      dur: 40,
      ok: true,
    },
    {
      event: 'invoicing.run.step',
      route: '/assistant',
      runId: 'run-1',
      step: 'aging',
      at: 4900,
      dur: 100,
      ok: false,
    },
    {
      event: 'invoicing.run.done',
      route: '/assistant',
      runId: 'run-1',
      total: 5100,
    },
  ]);
});

test('timeContext times the functions and keeps everything else by reference', async () => {
  const lines: RunTimingLine[] = [];
  const timer = createRunTimer('/review', 'run-2', (line) => lines.push(line));
  const rendered = { ui: false };
  const schema = { type: 'object' };
  const context = Object.freeze({
    rendered,
    responseSchema: schema,
    prepare: async (input: { readonly ids: readonly string[] }) =>
      input.ids.length,
  });

  const timed = timeContext(context, timer);
  const result = await timed.prepare({ ids: ['a', 'b'] });

  expect(result).toBe(2);
  expect(timed.rendered).toBe(rendered);
  expect(timed.responseSchema).toBe(schema);
  expect(Object.isFrozen(timed)).toBe(true);
  expect(runTimerOf(timed)).toBe(timer);
  expect(runTimerOf(context)).toBeUndefined();
  expect(
    lines.map((line) => line.event === 'invoicing.run.step' && line.step),
  ).toEqual(['prepare']);
});
