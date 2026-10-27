import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { workbenchExchanges } from '../examples/quickstart/runtime/workbench-requests';

const request = (requestId: string, extra: Record<string, unknown> = {}) => ({
  url: 'http://localhost:4300/api/workbench/chat',
  requestId,
  attempt: 1,
  input: { threadId: 't', runId: requestId, messages: [] },
  ...extra,
});

test('groups a request, its tool call and the continuation in one turn', () => {
  const store = createWorkbenchStore();
  store.send('Look it up');
  store.record('request', request('r1'));
  store.record('response', {
    status: 200,
    url: request('r1').url,
    source: 'a',
  });
  store.record('event', { type: 'RUN_STARTED' });
  store.record('event', {
    type: 'TOOL_CALL_START',
    toolCallId: 'call-1',
    toolCallName: 'readContext',
  });
  store.record('event', { type: 'RUN_FINISHED' });
  store.record('tool', { name: 'readContext', result: { ok: true } });
  store.record('request', request('r2'));
  store.record('event', { type: 'RUN_FINISHED' });
  const events = store.getSnapshot().events;

  const [turn] = workbenchExchanges(events, {});

  const [first, tool, continuation] = turn.exchanges;
  expect(turn.exchanges.map((exchange) => exchange.name)).toEqual([
    'Model request',
    'readContext',
    'Continuation',
  ]);
  expect(first.path).toBe('/api/workbench/chat');
  expect(first.pathConfigured).toBe(false);
  expect(first.status).toBe('ok');
  expect(tool.kind).toBe('tool');
  expect(tool.parentId).toBe(first.id);
  expect(tool.answeredById).toBe(continuation.id);
  expect(tool.tool).toEqual({
    name: 'readContext',
    result: { ok: true },
    callId: 'call-1',
  });
  expect(first.eventIndexes).toEqual([
    first.firstIndex,
    first.firstIndex + 1,
    first.firstIndex + 2,
    first.firstIndex + 3,
    first.firstIndex + 4,
  ]);
  expect(tool.eventIndexes).toEqual([tool.firstIndex]);
  expect(continuation.eventIndexes).toHaveLength(2);
  expect(events[continuation.firstIndex].kind).toBe('request');
  expect(turn.userText).toBe('Look it up');
});

test('marks a 403 as an error with its problem and recovers in the next turn', () => {
  const store = createWorkbenchStore();
  store.send('First');
  store.record('request', request('r1'));
  store.record('response', {
    status: 403,
    url: request('r1').url,
    source: 'a',
    problem: 'Demo denial is enabled',
  });
  store.settle('error');
  store.send('Second');
  store.record('request', request('r2'));
  store.record('response', {
    status: 200,
    url: request('r2').url,
    source: 'a',
  });
  store.record('event', { type: 'RUN_FINISHED' });
  store.settle('complete', 'stop');

  const turns = workbenchExchanges(store.getSnapshot().events, {
    settledStatus: 'complete',
  });

  expect(turns).toHaveLength(2);
  expect(turns[0].exchanges[0].status).toBe('error');
  expect(turns[0].exchanges[0].httpStatus).toBe(403);
  expect(turns[0].exchanges[0].problem).toBe('Demo denial is enabled');
  expect(turns[1].exchanges[0].status).toBe('ok');
});

test('names resume, retry and follow-up requests', () => {
  const store = createWorkbenchStore();
  store.send('Go');
  store.record('request', request('r1'));
  store.record('resume', { batchId: 'b', intent: true });
  store.record('request', request('r2'));
  store.record('request', request('r2'));
  store.record('request', request('r3'));

  const [turn] = workbenchExchanges(store.getSnapshot().events, {});

  expect(turn.exchanges.map((exchange) => exchange.name)).toEqual([
    'Model request',
    'Resume',
    'Retry',
    'Follow-up request',
  ]);
  expect(
    turn.exchanges.every((exchange) => exchange.answeredById === undefined),
  ).toBe(true);
});

test('names a request with a greater attempt a retry', () => {
  const store = createWorkbenchStore();
  store.send('Go');
  store.record('request', request('r1'));
  store.record('request', request('r2', { attempt: 2 }));

  const [turn] = workbenchExchanges(store.getSnapshot().events, {});

  expect(turn.exchanges[1].name).toBe('Retry');
});

test('uses the configured endpoint for decision requests', () => {
  const store = createWorkbenchStore('decision');
  store.send('Decide');
  store.record('request', { requestId: 'd1', input: { question: 'q' } });
  store.record('event', { decision: 'approve' });

  const [turn] = workbenchExchanges(store.getSnapshot().events, {
    format: 'decision',
    endpoint: 'http://localhost:4300/api/workbench/decide',
  });

  const [exchange] = turn.exchanges;
  expect(exchange.name).toBe('Decision request');
  expect(exchange.pathConfigured).toBe(true);
  expect(exchange.path).toBe('/api/workbench/decide');
  expect(exchange.status).toBe('ok');
});

test('fails the last exchange when the store settled to error', () => {
  const store = createWorkbenchStore('decision');
  store.send('Decide');
  store.record('request', { requestId: 'd1', input: {} });

  const [turn] = workbenchExchanges(store.getSnapshot().events, {
    format: 'decision',
    settledStatus: 'error',
  });

  expect(turn.exchanges[0].status).toBe('error');
  expect(turn.exchanges[0].path).toBeUndefined();
});

test('leaves the streaming exchange pending', () => {
  const store = createWorkbenchStore();
  store.send('Stream');
  store.record('request', request('r1'));
  store.record('event', { type: 'RUN_STARTED' });
  store.record('event', { type: 'TEXT_MESSAGE_CONTENT', delta: 'Hi' });
  const events = store.getSnapshot().events;

  const [turn] = workbenchExchanges(events, { settledStatus: 'loading' });

  expect(turn.exchanges[0].status).toBe('pending');
  expect(turn.exchanges[0].endMs).toBe(events.at(-1)?.elapsedMs);
  expect(turn.exchanges[0].lastIndex).toBe(events.length - 1);
});

test('returns no turns for an empty run', () => {
  expect(workbenchExchanges([], {})).toEqual([]);
});

test("ignores events before a turn's first request", () => {
  const store = createWorkbenchStore();
  store.send('Hello');
  store.record('request', request('r1'));
  const events = store.getSnapshot().events;

  const [turn] = workbenchExchanges(events, {});

  expect(events[0].kind).toBe('user');
  expect(turn.exchanges).toHaveLength(1);
  expect(turn.exchanges[0].eventIndexes).not.toContain(0);
});

test('links every tool call in an exchange to its continuation', () => {
  const store = createWorkbenchStore();
  store.send('Two tools');
  store.record('request', request('r1'));
  store.record('tool', { name: 'readContext', result: 1 });
  store.record('tool', { name: 'writePlan', result: 2 });
  store.record('request', request('r2'));

  const [turn] = workbenchExchanges(store.getSnapshot().events, {});

  const [first, one, two, continuation] = turn.exchanges;
  expect(turn.exchanges.map((exchange) => exchange.name)).toEqual([
    'Model request',
    'readContext',
    'writePlan',
    'Continuation',
  ]);
  expect(one.parentId).toBe(first.id);
  expect(two.parentId).toBe(first.id);
  expect(one.answeredById).toBe(continuation.id);
  expect(two.answeredById).toBe(continuation.id);
});

test('leaves the call id out when no tool call event matches', () => {
  const store = createWorkbenchStore();
  store.send('Tool');
  store.record('request', request('r1'));
  store.record('event', {
    type: 'TOOL_CALL_START',
    toolCallId: 'other',
    toolCallName: 'somethingElse',
  });
  store.record('tool', { name: 'readContext', result: 1 });

  const [turn] = workbenchExchanges(store.getSnapshot().events, {});

  expect(turn.exchanges[1].tool).toEqual({ name: 'readContext', result: 1 });
});

test('marks a RUN_ERROR event as a failure', () => {
  const store = createWorkbenchStore();
  store.send('Fail');
  store.record('request', request('r1'));
  store.record('event', { type: 'RUN_ERROR', message: 'boom' });

  const [turn] = workbenchExchanges(store.getSnapshot().events, {});

  expect(turn.exchanges[0].status).toBe('error');
});

test('marks an error event as a failure', () => {
  const store = createWorkbenchStore();
  store.send('Fail');
  store.record('request', request('r1'));
  store.record('error', { message: 'boom' });

  const [turn] = workbenchExchanges(store.getSnapshot().events, {});

  expect(turn.exchanges[0].status).toBe('error');
});

test('marks the pending exchange cancelled when the store settled cancelled', () => {
  const store = createWorkbenchStore();
  store.send('Stop');
  store.record('request', request('r1'));
  store.record('event', { type: 'RUN_STARTED' });

  const [turn] = workbenchExchanges(store.getSnapshot().events, {
    settledStatus: 'cancelled',
  });

  expect(turn.exchanges[0].status).toBe('cancelled');
});

test('marks an exchange with a cancel event cancelled', () => {
  const store = createWorkbenchStore();
  store.send('Stop');
  store.record('request', request('r1'));
  store.record('cancel', { manual: true });

  const [turn] = workbenchExchanges(store.getSnapshot().events, {});

  expect(turn.exchanges[0].status).toBe('cancelled');
  expect(turn.exchanges[0].eventIndexes).toHaveLength(2);
});
