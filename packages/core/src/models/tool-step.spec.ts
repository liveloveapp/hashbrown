import {
  completeRunningStep,
  isProviderToolCall,
  ɵmergeStepMetadata as mergeStepMetadata,
  ɵmergeToolStep as mergeToolStep,
  ɵreadAnswerAnnotations as readAnswerAnnotations,
  readResultFailure,
  ɵreadToolStep as readToolStep,
  seedFrameResultStep,
  stampStepMetadataStart,
  stampStepStart,
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

test('keeps provider kind and open fields', () => {
  const value = {
    v: 1,
    kind: 'provider',
    builtin: 'web_search',
    icon: 'sparkle',
    status: 'failed',
    queries: ['a', 3],
    parentToolCallId: 'p',
    error: { message: 'x', code: 'y' },
  };

  const result = readToolStep(value);

  expect(result).toEqual({
    v: 1,
    kind: 'provider',
    builtin: 'web_search',
    icon: 'sparkle',
    status: 'failed',
    queries: ['a'],
    parentToolCallId: 'p',
    error: { message: 'x', code: 'y' },
  });
});

test('drops values that are not v1 or legacy steps', () => {
  const unsupported = { v: 2, kind: 'server', status: 'running' };

  const results = ['nope', null, unsupported].map((v) => readToolStep(v));

  expect(results).toEqual([undefined, undefined, undefined]);
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
  const settledByCall = step({ status: 'denied' });
  const completed = step({ status: 'completed' });

  const fromMessage = mergeToolStep(settledByCall, completed, 'message');
  const fromCall = mergeToolStep(settledByCall, completed, 'call');

  expect(fromMessage.status).toBe('completed');
  expect(fromCall.status).toBe('denied');
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
  expect(result?.['b4.step'] as ToolStep).not.toHaveProperty('label');
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
});

test('drops answer annotations that are not an object', () => {
  const result = readAnswerAnnotations(7);

  expect(result).toBeUndefined();
});

test('a failed merge from a running step gets a default error', () => {
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

test('a failed first write gets a default error', () => {
  const failed = {
    v: 1 as const,
    kind: 'server' as const,
    status: 'failed' as const,
  };

  const result = mergeToolStep(undefined, failed, 'call');

  expect(result.error).toEqual({ message: 'Tool call did not finish' });
});

test('a previously failed step without an error gets a default error', () => {
  const failed = step({ status: 'failed' });

  const result = mergeToolStep(failed, step({ status: 'completed' }), 'call');

  expect(result.error).toEqual({ message: 'Tool call did not finish' });
});

test('a failed first metadata write gets a default error', () => {
  const next = { 'b4.step': step({ status: 'failed' }) };

  const result = mergeStepMetadata(undefined, next, 'call');

  expect((result?.['b4.step'] as ToolStep).error).toEqual({
    message: 'Tool call did not finish',
  });
});

test('a settled step keeps its label when a label-less settle repeats', () => {
  const denied = step({ status: 'denied', label: 'Denied by user' });

  const result = mergeToolStep(
    denied,
    { v: 1, kind: 'server', status: 'denied' },
    'call',
  );

  expect(result.label).toBe('Denied by user');
});

test('a supplied label survives a bad settle', () => {
  const running = step({ label: 'Searching the web' });
  const failed = step({ status: 'failed', label: 'Web search failed' });

  const result = mergeToolStep(running, failed, 'message');

  expect(result.label).toBe('Web search failed');
});

test('a legacy value keeps a stored provider kind', () => {
  const provider = { 'b4.step': step({ kind: 'provider', label: 'a' }) };
  const legacy = { 'b4.step': { status: 'completed' } };

  const result = mergeStepMetadata(provider, legacy, 'call');

  expect((result?.['b4.step'] as ToolStep).kind).toBe('provider');
  expect((result?.['b4.step'] as ToolStep).status).toBe('completed');
});

test('an explicit kind in the next value is honoured', () => {
  const server = { 'b4.step': step({ kind: 'server' }) };
  const provider = { 'b4.step': { v: 1, kind: 'provider', status: 'running' } };

  const result = mergeStepMetadata(server, provider, 'call');

  expect((result?.['b4.step'] as ToolStep).kind).toBe('provider');
});

test('an unreadable next step keeps the previous step', () => {
  const previous = { 'b4.step': step({ label: 'a' }), openai: { id: 1 } };
  const unreadable = {
    'b4.step': { v: 2, kind: 'server', status: 'completed' },
  };

  const result = mergeStepMetadata(previous, unreadable, 'call');

  expect(result?.['b4.step']).toBe(previous['b4.step']);
});

test('an unreadable first step keeps its raw value', () => {
  const unreadable = { 'b4.step': 'junk', openai: { id: 1 } };
  const future = { 'b4.step': { v: 2, status: 'completed' } };

  const first = mergeStepMetadata(undefined, unreadable, 'call');
  const overOther = mergeStepMetadata({ openai: { id: 2 } }, future, 'call');

  expect(first).toEqual({ 'b4.step': 'junk', openai: { id: 1 } });
  expect(overOther).toEqual({
    'b4.step': { v: 2, status: 'completed' },
    openai: { id: 2 },
  });
  expect(readToolStep(first?.['b4.step'])).toBeUndefined();
  expect(readToolStep(overOther?.['b4.step'])).toBeUndefined();
});

test('an invalid kind in the next value does not count as stated', () => {
  const provider = { 'b4.step': step({ kind: 'provider', label: 'a' }) };
  const bogus = { 'b4.step': { v: 1, kind: 'bogus', status: 'completed' } };
  const nulled = { 'b4.step': { v: 1, kind: null, status: 'completed' } };

  const fromBogus = mergeStepMetadata(provider, bogus, 'call');
  const fromNull = mergeStepMetadata(provider, nulled, 'call');

  expect((fromBogus?.['b4.step'] as ToolStep).kind).toBe('provider');
  expect((fromNull?.['b4.step'] as ToolStep).kind).toBe('provider');
});

test('stamps startedAt from the event timestamp only when the step has none', () => {
  const legacy = { toolCallId: 'c1', status: 'running' };
  const timed = step({ startedAt: 5 });

  const stamped = stampStepStart(legacy, 1500);
  const kept = stampStepStart(timed, 1500);
  const untimed = stampStepStart(legacy, undefined);
  const junk = stampStepStart('junk', 1500);

  expect(stamped).toEqual({ ...legacy, startedAt: 1500 });
  expect(kept).toBe(timed);
  expect(untimed).toBe(legacy);
  expect(junk).toBe('junk');
});

test('stamps the step in metadata and leaves stepless metadata alone', () => {
  const metadata = { 'b4.step': step(), openai: { id: 1 } };
  const stepless = { openai: { id: 1 } };

  const stamped = stampStepMetadataStart(metadata, 1000);
  const untouched = stampStepMetadataStart(stepless, 1000);

  expect(stamped).toEqual({
    'b4.step': step({ startedAt: 1000 }),
    openai: { id: 1 },
  });
  expect(metadata['b4.step']).not.toHaveProperty('startedAt');
  expect(untouched).toBe(stepless);
  expect(stampStepMetadataStart(undefined, 1000)).toBeUndefined();
});

test('a settle with no label drops the running label and sources and keeps the rest', () => {
  const running = step({
    label: 'Searching',
    icon: 'search',
    startedAt: 1000,
    queries: ['q'],
    builtin: 'web_search',
    provider: 'openai',
    sources: [{ id: 's', kind: 'url', title: 'A' }],
  });

  const result = mergeToolStep(
    running,
    { v: 1, kind: 'server', status: 'completed' },
    'message',
  );

  expect(result).toEqual({
    v: 1,
    kind: 'server',
    status: 'completed',
    icon: 'search',
    startedAt: 1000,
    queries: ['q'],
    builtin: 'web_search',
    provider: 'openai',
  });
});

test('a settle that restates its label and sources keeps them', () => {
  const running = step({
    label: 'Searching',
    sources: [{ id: 's', kind: 'url', title: 'A' }],
  });
  const completed = step({
    status: 'completed',
    label: 'Searched',
    sources: [{ id: 't', kind: 'url', title: 'B' }],
  });

  const result = mergeToolStep(running, completed, 'call');

  expect(result.label).toBe('Searched');
  expect(result.sources).toEqual([{ id: 't', kind: 'url', title: 'B' }]);
});

test('a running write never changes a settled step', () => {
  const completed = step({ status: 'completed', label: 'Done', icon: 'a' });
  const running = step({ label: 'Again', icon: 'b', startedAt: 5 });

  const fromCall = mergeToolStep(completed, running, 'call');
  const fromMessage = mergeToolStep(completed, running, 'message');

  expect(fromCall).toEqual(completed);
  expect(fromMessage).toEqual(completed);
});

test('any v other than 1 is not a step and a missing v is legacy', () => {
  const values = [0, 2, '1', null, 1.5].map((v) => ({
    v,
    kind: 'server',
    status: 'running',
  }));

  const rejected = values.map((value) => readToolStep(value));
  const legacy = readToolStep({ status: 'running' });
  const current = readToolStep({ v: 1, status: 'running' });

  expect(rejected).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  expect(legacy).toEqual({ v: 1, kind: 'server', status: 'running' });
  expect(current).toEqual({ v: 1, kind: 'server', status: 'running' });
});

test('a RESULT error fails a step that a call already completed', () => {
  const metadata = {
    'b4.step': step({ status: 'completed', label: 'Done', icon: 'a' }),
  };

  const result = completeRunningStep(metadata, 'Rate limited');

  expect(result?.['b4.step']).toEqual({
    v: 1,
    kind: 'server',
    status: 'failed',
    icon: 'a',
    error: { message: 'Rate limited' },
  });
});

test('a RESULT error keeps the error of a step that already failed', () => {
  const metadata = {
    'b4.step': step({ status: 'failed', error: { message: 'boom' } }),
  };

  const result = completeRunningStep(metadata, 'Rate limited');

  expect(result).toBe(metadata);
});

test('a frame-only RESULT gives a stepless call a completed or failed step', () => {
  const other = { openai: { id: 'x' } };

  const completed = seedFrameResultStep(other, { error: undefined });
  const failed = seedFrameResultStep(undefined, { error: 'boom' });
  const unanswered = seedFrameResultStep(other, undefined);
  const stepped = { 'b4.step': step() };
  const kept = seedFrameResultStep(stepped, { error: undefined });

  expect(completed).toEqual({
    openai: { id: 'x' },
    'b4.step': { v: 1, kind: 'server', status: 'completed' },
  });
  expect(failed).toEqual({
    'b4.step': {
      v: 1,
      kind: 'server',
      status: 'failed',
      error: { message: 'boom' },
    },
  });
  expect(unanswered).toBe(other);
  expect(kept).toBe(stepped);
});

test('a call write moves a completed step into denied or cancelled', () => {
  const completed = step({ status: 'completed', label: 'Done', icon: 'a' });

  const denied = mergeToolStep(
    completed,
    { v: 1, kind: 'server', status: 'denied' },
    'call',
  );
  const cancelled = mergeToolStep(
    completed,
    { v: 1, kind: 'server', status: 'cancelled', label: 'Stopped' },
    'call',
  );

  expect(denied).toEqual({ v: 1, kind: 'server', status: 'denied', icon: 'a' });
  expect(cancelled).toEqual({
    v: 1,
    kind: 'server',
    status: 'cancelled',
    icon: 'a',
    label: 'Stopped',
  });
});

test('a call write onto a settled step only fills missing fields', () => {
  const completed = step({ status: 'completed', label: 'A' });
  const late = step({ status: 'completed', label: 'B', icon: 'i' });

  const fromCall = mergeToolStep(completed, late, 'call');
  const fromMessage = mergeToolStep(completed, late, 'message');

  expect(fromCall).toEqual({
    v: 1,
    kind: 'server',
    status: 'completed',
    label: 'A',
    icon: 'i',
  });
  expect(fromMessage.label).toBe('B');
});

test('an empty RESULT error string is no failure', () => {
  const metadata = { 'b4.step': step({ label: 'Busy' }) };

  const result = completeRunningStep(metadata, '');

  expect(result?.['b4.step']).toEqual({
    v: 1,
    kind: 'server',
    status: 'completed',
  });
});

test('reads a result failure from a non-empty string or an Error-like message', () => {
  const values = ['boom', '', new Error('bad'), { message: '' }, 3, undefined];

  const result = values.map((value) => readResultFailure(value));

  expect(result).toEqual([
    'boom',
    undefined,
    'bad',
    undefined,
    undefined,
    undefined,
  ]);
});

test('reads error only on a failed step', () => {
  const error = { message: 'x', code: 'y' };

  const completed = readToolStep({ v: 1, status: 'completed', error });
  const failed = readToolStep({ v: 1, status: 'failed', error });

  expect(completed).not.toHaveProperty('error');
  expect(failed?.error).toEqual(error);
});

test('every merge strips error from a step that is not failed', () => {
  const stray = { error: { message: 'stale' } };

  const first = mergeToolStep(
    undefined,
    { v: 1, kind: 'server', status: 'completed', ...stray },
    'call',
  );
  const settled = mergeToolStep(
    step({ ...stray }),
    { v: 1, kind: 'server', status: 'denied' },
    'message',
  );
  const kept = mergeToolStep(
    step({ status: 'completed', ...stray }),
    { v: 1, kind: 'server', status: 'completed' },
    'call',
  );

  expect(first).not.toHaveProperty('error');
  expect(settled).not.toHaveProperty('error');
  expect(kept).not.toHaveProperty('error');
});

test('a RESULT completes a running step from its normalized form', () => {
  const metadata = {
    'b4.step': {
      status: 'running',
      label: 'Busy',
      icon: 'i',
      error: { message: 'stale' },
      sources: [{ title: 'A' }],
      extra: true,
    },
  };

  const result = completeRunningStep(metadata, undefined, 'c1');

  expect(result?.['b4.step']).toEqual({
    v: 1,
    kind: 'server',
    status: 'completed',
    icon: 'i',
    sources: [{ id: 'c1:0', kind: 'record', title: 'A' }],
  });
});

test('a value without a string status is not a step', () => {
  const values = [{ v: 1 }, { v: 1, status: 3 }, { status: null }];

  const result = values.map((value) => readToolStep(value));

  expect(result).toEqual([undefined, undefined, undefined]);
  expect(readToolStep({ v: 1, status: 'paused' })).toEqual({
    v: 1,
    kind: 'server',
  });
});

test('empty strings read as absent', () => {
  const value = {
    v: 1,
    toolCallId: '',
    status: 'failed',
    label: '',
    icon: '',
    builtin: '',
    provider: '',
    error: { message: '', code: '' },
    sources: [
      { id: '', title: 'A', href: '' },
      { id: 's', title: '' },
    ],
  };

  const read = readToolStep(value, 'c1');
  const merged = read && mergeToolStep(undefined, read, 'call');

  expect(read).toEqual({
    v: 1,
    toolCallId: 'c1',
    kind: 'server',
    status: 'failed',
    sources: [{ id: 'c1:0', kind: 'record', title: 'A' }],
  });
  expect(merged?.error).toEqual({ message: 'Tool call did not finish' });
});

test('metadata merges give legacy sources ids from the call id and store no call id', () => {
  const legacy = {
    'b4.step': { status: 'running', sources: [{ title: 'A' }] },
  };

  const first = mergeStepMetadata(undefined, legacy, 'call', 'c1');
  const next = mergeStepMetadata(
    { 'b4.step': { status: 'running', sources: [{ title: 'B' }] } },
    { 'b4.step': { status: 'running', label: 'x' } },
    'call',
    'c1',
  );

  expect(first?.['b4.step']).toEqual({
    v: 1,
    kind: 'server',
    status: 'running',
    sources: [{ id: 'c1:0', kind: 'record', title: 'A' }],
  });
  expect((next?.['b4.step'] as ToolStep).sources).toEqual([
    { id: 'c1:0', kind: 'record', title: 'B' },
  ]);
});

test('a provider kind marks a call as a provider call even without a readable status', () => {
  const statusless = { metadata: { 'b4.step': { v: 1, kind: 'provider' } } };
  const future = { metadata: { 'b4.step': { v: 2, kind: 'provider' } } };
  const server = { metadata: { 'b4.step': { kind: 'server' } } };

  const results = [statusless, future, server].map(isProviderToolCall);

  expect(results).toEqual([true, false, false]);
});

test('a status-only write onto an unreadable provider step keeps its provider identity', () => {
  const previous = {
    'b4.step': {
      v: 1,
      kind: 'provider',
      builtin: 'web_search',
      provider: 'openai',
    },
  };

  const result = mergeStepMetadata(
    previous,
    { 'b4.step': { status: 'running' } },
    'call',
    'c1',
  );

  expect(result?.['b4.step']).toEqual({
    v: 1,
    kind: 'provider',
    builtin: 'web_search',
    provider: 'openai',
    status: 'running',
  });
  expect(isProviderToolCall({ metadata: result })).toBe(true);
});

test('a write stating a server kind never turns a provider step into a server step', () => {
  const readable = { 'b4.step': step({ kind: 'provider', builtin: 'x' }) };
  const unreadable = { 'b4.step': { v: 1, kind: 'provider', builtin: 'x' } };
  const write = { 'b4.step': { v: 1, kind: 'server', status: 'running' } };

  const fromReadable = mergeStepMetadata(readable, write, 'message', 'c1');
  const fromUnreadable = mergeStepMetadata(unreadable, write, 'message', 'c1');

  expect(fromReadable?.['b4.step']).toMatchObject({
    kind: 'provider',
    builtin: 'x',
  });
  expect(fromUnreadable?.['b4.step']).toMatchObject({
    kind: 'provider',
    builtin: 'x',
  });
});

test('a frame-only RESULT seed keeps an unreadable provider identity', () => {
  const metadata = {
    'b4.step': { v: 1, kind: 'provider', builtin: 'web_search' },
  };

  const seeded = seedFrameResultStep(metadata, {});

  expect(seeded?.['b4.step']).toEqual({
    v: 1,
    kind: 'provider',
    builtin: 'web_search',
    status: 'completed',
  });
});
