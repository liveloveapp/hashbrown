import type { Decision } from '@hashbrownai/core';
import { expect, test } from 'vitest';
import type { routeSchema } from './contracts';
import {
  createRouterInput,
  routerBadge,
  submitTarget,
  trackDecisionInput,
} from './router-input';

type RouteResult = Decision.Result<typeof routeSchema>;

function decision(
  intent: 'filter' | 'chat' | 'other',
  confidence: number,
): RouteResult {
  return {
    value: { intent, clear: false },
    meta: {
      intent: { confidence, probabilities: { [intent]: confidence } },
      clear: { probability: 0.1 },
    },
  };
}

const { initial, reduce } = createRouterInput();

test('a decision for older text is not used for the current text', () => {
  const typed = reduce(initial, { type: 'typed', text: 'only jets' });
  const older = reduce(typed, {
    type: 'decided',
    text: 'only jets',
    result: decision('filter', 0.97),
  });

  const retyped = reduce(older, { type: 'typed', text: 'only jets below' });
  const late = reduce(retyped, {
    type: 'decided',
    text: 'only jets',
    result: decision('chat', 0.99),
  });

  expect(retyped.decidedFor).toBe('only jets');
  expect(retyped.pending).toBe(true);
  expect(submitTarget(retyped, 0)).toBe('wait');
  expect(late).toEqual(retyped);
  expect(routerBadge(late).label).toBe('→ filter 0.97');
});

test('a decision for the current text routes Enter', () => {
  const typed = reduce(initial, { type: 'typed', text: 'only jets' });

  const decided = reduce(typed, {
    type: 'decided',
    text: 'only jets',
    result: decision('filter', 0.97),
  });

  expect(decided.pending).toBe(false);
  expect(decided.decidedFor).toBe('only jets');
  expect(submitTarget(decided, 0)).toEqual({ kind: 'filter' });
});

test('submitTarget waits up to 1000 ms then goes to chat', () => {
  const typed = reduce(initial, { type: 'typed', text: 'only jets' });

  const early = submitTarget(typed, 999);
  const late = submitTarget(typed, 1000);

  expect(early).toBe('wait');
  expect(late).toEqual({ kind: 'chat' });
});

test('a failed or unavailable decision gives a chat badge without error', () => {
  const typed = reduce(initial, { type: 'typed', text: 'hello' });

  const failed = reduce(typed, { type: 'failed', text: 'hello' });

  expect(failed.failed).toBe(true);
  expect(routerBadge(failed)).toEqual({ label: '→ chat', tone: 'chat' });
  expect(submitTarget(failed, 0)).toEqual({ kind: 'chat' });
});

test('clearing the text resets the router', () => {
  const typed = reduce(initial, { type: 'typed', text: 'hello' });
  const decided = reduce(typed, {
    type: 'decided',
    text: 'hello',
    result: decision('chat', 0.9),
  });

  const cleared = reduce(decided, { type: 'typed', text: '   ' });

  expect(cleared).toEqual(initial);
  expect(routerBadge(cleared)).toEqual({ label: '', tone: 'idle' });
});

test('trackDecisionInput remembers the text each answer was for', async () => {
  const calls: string[] = [];
  const tracked = trackDecisionInput(async (request) => {
    calls.push(String(request.state));
    if (request.state === 'bad') throw new Error('down');
    return {} as Decision.Response;
  });
  const signal = new AbortController().signal;

  await tracked.transport({ state: 'hello', questions: {} }, signal);
  const first = tracked.answeredFor();
  await tracked
    .transport(
      { state: { system: 's', input: 'bad' } as never, questions: {} },
      signal,
    )
    .catch(() => undefined);

  expect(first).toBe('hello');
  expect(tracked.answeredFor()).toBe('bad');
  expect(calls).toHaveLength(2);
});
