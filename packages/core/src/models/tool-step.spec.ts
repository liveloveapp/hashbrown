import {
  ɵmergeStepMetadata as mergeStepMetadata,
  ɵmergeToolStep as mergeToolStep,
  ɵreadAnswerAnnotations as readAnswerAnnotations,
  ɵreadToolStep as readToolStep,
  type ɵToolStep as ToolStep,
} from './tool-step';

const step = (overrides: Partial<ToolStep> = {}): ToolStep => ({
  v: 1,
  kind: 'server',
  status: 'running',
  ...overrides,
});

test('reads a legacy custom value as a v1 step', () => {
  const legacy = {
    toolCallId: 'c1',
    status: 'completed',
    label: 'Fetched',
    sources: [{ title: 'A', href: 'https://a' }, { title: 'B' }],
  };

  const result = readToolStep(legacy);

  expect(result).toEqual({
    v: 1,
    toolCallId: 'c1',
    kind: 'server',
    status: 'completed',
    label: 'Fetched',
    sources: [
      { id: 'c1:0', kind: 'url', title: 'A', href: 'https://a' },
      { id: 'c1:1', kind: 'record', title: 'B' },
    ],
  });
});

test('uses the tool call id argument for legacy source ids', () => {
  const legacy = { status: 'completed', sources: [{ title: 'A' }] };

  const result = readToolStep(legacy, 'c9');

  expect(result?.sources?.[0].id).toBe('c9:0');
});

test('converts ISO timestamps to epoch milliseconds', () => {
  const legacy = {
    status: 'completed',
    startedAt: '2026-10-21T00:00:00.000Z',
    settledAt: 1792540800500,
  };

  const result = readToolStep(legacy);

  expect(result?.startedAt).toBe(1792540800000);
  expect(result?.settledAt).toBe(1792540800500);
});

test('cuts a label to 120 code points, not UTF-16 units', () => {
  const label = '😀'.repeat(130);

  const result = readToolStep({
    v: 1,
    kind: 'server',
    status: 'running',
    label,
  });

  expect(Array.from(result?.label ?? '')).toHaveLength(120);
  expect(result?.label).toBe('😀'.repeat(120));
});

test('reads an unknown status as undefined', () => {
  const result = readToolStep({ v: 1, kind: 'server', status: 'exploded' });

  expect(result).toBeDefined();
  expect(result?.status).toBeUndefined();
});

test('keeps provider kind and open fields, and drops unknown shapes', () => {
  const value = {
    v: 1,
    kind: 'provider',
    builtin: 'web_search',
    icon: 'sparkle',
    status: 'running',
    queries: ['a', 3],
    parentToolCallId: 'p',
    error: { message: 'x', code: 'y' },
  };

  expect(readToolStep(value)).toEqual({
    v: 1,
    kind: 'provider',
    builtin: 'web_search',
    icon: 'sparkle',
    status: 'running',
    queries: ['a'],
    parentToolCallId: 'p',
    error: { message: 'x', code: 'y' },
  });
  expect(readToolStep('nope')).toBeUndefined();
  expect(readToolStep(null)).toBeUndefined();
  expect(readToolStep({ v: 2, kind: 'server', status: 'running' })).toBe(
    undefined,
  );
});

test('failed wins over a later completed step', () => {
  const failed = step({ status: 'failed', error: { message: 'boom' } });
  const completed = step({ status: 'completed' });

  const result = mergeToolStep(failed, completed, 'message');

  expect(result.status).toBe('failed');
  expect(result.error).toEqual({ message: 'boom' });
});

test('failed overrides a settled step', () => {
  const completed = step({ status: 'completed' });
  const failed = step({ status: 'failed', error: { message: 'boom' } });

  const result = mergeToolStep(completed, failed, 'message');

  expect(result.status).toBe('failed');
});

test('denied clears the running label and sources', () => {
  const running = step({
    label: 'Searching',
    sources: [{ id: 's', kind: 'url', title: 'A' }],
  });

  const result = mergeToolStep(
    running,
    { v: 1, kind: 'server', status: 'denied' },
    'call',
  );

  expect(result.status).toBe('denied');
  expect(result.label).toBeUndefined();
  expect(result.sources).toBeUndefined();
});

test('running never un-settles a completed step', () => {
  const completed = step({ status: 'completed', label: 'Done' });

  const result = mergeToolStep(completed, step({ label: 'Again' }), 'call');

  expect(result.status).toBe('completed');
});

test('running lifts an unsettled step and a read without status keeps status', () => {
  const running = step({ label: 'a' });

  const lifted = mergeToolStep(running, step({ label: 'b' }), 'call');
  const kept = mergeToolStep(
    step({ status: 'completed' }),
    { v: 1, kind: 'server', label: 'c' },
    'call',
  );

  expect(lifted.label).toBe('b');
  expect(kept.status).toBe('completed');
});

test('a message step beats a call step when both settle', () => {
  const settledByCall = step({ status: 'completed' });
  const denied = step({ status: 'denied' });

  const fromMessage = mergeToolStep(settledByCall, denied, 'message');
  const fromCall = mergeToolStep(settledByCall, denied, 'call');

  expect(fromMessage.status).toBe('denied');
  expect(fromCall.status).toBe('completed');
});

test('does not mutate its inputs', () => {
  const previous = Object.freeze(step({ label: 'a' }));
  const next = Object.freeze(step({ status: 'completed' }));

  const result = mergeToolStep(previous, next, 'message');

  expect(result).not.toBe(previous);
  expect(previous.status).toBe('running');
});

test('merges step metadata, keeping other keys shallow-merged', () => {
  const previous = {
    openai: { id: 'a', x: 1 },
    'b4.step': step({ label: 'a' }),
  };
  const next = {
    openai: { id: 'b' },
    'b4.step': step({ status: 'completed' }),
  };

  const result = mergeStepMetadata(previous, next, 'call');

  expect(result?.['openai']).toEqual({ id: 'b' });
  expect((result?.['b4.step'] as ToolStep).status).toBe('completed');
  expect((result?.['b4.step'] as ToolStep).label).toBe('a');
});

test('merge metadata handles undefined sides', () => {
  const next = { 'b4.step': step() };

  expect(mergeStepMetadata(undefined, undefined, 'call')).toBeUndefined();
  expect(mergeStepMetadata(undefined, next, 'call')).toEqual(next);
  expect(mergeStepMetadata(next, undefined, 'call')).toBe(next);
});

test('reads answer annotations', () => {
  const value = {
    v: 1,
    citations: [{ sourceId: 's', quote: 'q', block: 0 }, { nope: true }],
    sources: [{ id: 's', kind: 'url', title: 'T' }],
  };

  const result = readAnswerAnnotations(value);

  expect(result?.citations).toEqual([{ sourceId: 's', quote: 'q', block: 0 }]);
  expect(result?.sources).toEqual([{ id: 's', kind: 'url', title: 'T' }]);
  expect(readAnswerAnnotations(7)).toBeUndefined();
});

test('a failed merge without an error gets a default error', () => {
  const running = step();

  const result = mergeToolStep(
    running,
    { v: 1, kind: 'server', status: 'failed' },
    'call',
  );
  const fresh = mergeToolStep(undefined, { v: 1, kind: 'server' }, 'call');

  expect(result.error).toEqual({ message: 'Tool call did not finish' });
  expect(fresh.status).toBe('running');
});
