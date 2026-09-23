import { expect, test } from 'vitest';
import {
  type AgUiTape,
  parseSseEvents,
  prepareReplay,
  validateTape,
} from './fixture-tape';

const tape = (events: Record<string, unknown>[]): AgUiTape => ({
  version: 1,
  recordedAt: '2026-09-23T00:00:00.000Z',
  question: 'q',
  events: events.map((event) => ({ event })),
});

const complete = [
  { type: 'RUN_STARTED', threadId: 't0', runId: 'r0' },
  { type: 'TOOL_CALL_START', toolCallId: 'c1', toolCallName: 'render' },
  { type: 'TOOL_CALL_ARGS', toolCallId: 'c1', delta: '{"text":"hi"}' },
  { type: 'TOOL_CALL_END', toolCallId: 'c1' },
  { type: 'TOOL_CALL_RESULT', toolCallId: 'c1', content: '{"rendered":true}' },
  { type: 'MESSAGES_SNAPSHOT', messages: [] },
  { type: 'RUN_FINISHED', threadId: 't0', runId: 'r0' },
];

test('parses server-sent events into AG-UI events', () => {
  const body =
    'data: {"type":"RUN_STARTED"}\n\ndata: {"type":"RUN_FINISHED"}\n\n';

  const events = parseSseEvents(body);

  expect(events).toEqual([{ type: 'RUN_STARTED' }, { type: 'RUN_FINISHED' }]);
});

test('accepts a complete take with a successful render call', () => {
  const input = tape(complete);

  const problems = validateTape(input);

  expect(problems).toEqual([]);
});

test('rejects a take without a successful render call', () => {
  const input = tape([complete[0], complete[6]]);

  const problems = validateTape(input);

  expect(problems).toContain('missing successful render tool call');
});

test('rejects provider metadata and secrets', () => {
  const input = tape([
    ...complete.slice(0, 6),
    { type: 'RAW', event: { authorization: 'Bearer sk-abc' } },
    complete[6],
  ]);

  const problems = validateTape(input);

  expect(problems).toEqual(
    expect.arrayContaining([
      'contains RAW event',
      'contains a secret-like value',
    ]),
  );
});

test('rewrites run identity and drops message snapshots for replay', () => {
  const input = tape(complete);

  const events = prepareReplay(input, { threadId: 't9', runId: 'r9' });

  expect(events[0]).toEqual({
    type: 'RUN_STARTED',
    threadId: 't9',
    runId: 'r9',
  });
  expect(events.at(-1)).toEqual({
    type: 'RUN_FINISHED',
    threadId: 't9',
    runId: 'r9',
  });
  expect(events.some((e) => e.type === 'MESSAGES_SNAPSHOT')).toBe(false);
  expect(input.events[0].event).toEqual(complete[0]);
});

test('accepts a render result serialized as a LangChain tool message', () => {
  const wrapped = JSON.stringify({
    lc: 1,
    type: 'constructor',
    id: ['langchain_core', 'messages', 'ToolMessage'],
    kwargs: { status: 'success', content: '{"rendered":true}' },
  });
  const input = tape(
    complete.map((event) =>
      event.type === 'TOOL_CALL_RESULT'
        ? { ...event, content: wrapped }
        : event,
    ),
  );

  const problems = validateTape(input);

  expect(problems).toEqual([]);
});

test('rejects a render result that reports an error', () => {
  const wrapped = JSON.stringify({
    lc: 1,
    type: 'constructor',
    id: ['langchain_core', 'messages', 'ToolMessage'],
    kwargs: { status: 'error', content: '{"rendered":true}' },
  });
  const input = tape(
    complete.map((event) =>
      event.type === 'TOOL_CALL_RESULT'
        ? { ...event, content: wrapped }
        : event,
    ),
  );

  const problems = validateTape(input);

  expect(problems).toContain('missing successful render tool call');
});
