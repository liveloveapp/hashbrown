import { expect, test } from 'vitest';
import { collectRun } from './collect-run';

const sse = (events: unknown[]) =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

test('collects text, tool calls and results from an AG-UI stream', async () => {
  const body = sse([
    { type: 'RUN_STARTED', threadId: 't', runId: 'r' },
    {
      type: 'TOOL_CALL_START',
      toolCallId: 'c1',
      toolCallName: 'ledgerSummary',
    },
    { type: 'TOOL_CALL_ARGS', toolCallId: 'c1', delta: '{}' },
    { type: 'TOOL_CALL_END', toolCallId: 'c1' },
    {
      type: 'TOOL_CALL_RESULT',
      toolCallId: 'c1',
      messageId: 'm1',
      role: 'tool',
      content: '{"asOf":"2026-09-15"}',
    },
    { type: 'TOOL_CALL_START', toolCallId: 'c2', toolCallName: 'render' },
    { type: 'TOOL_CALL_ARGS', toolCallId: 'c2', delta: '{"text":"Hi",' },
    { type: 'TOOL_CALL_ARGS', toolCallId: 'c2', delta: '"components":[]}' },
    { type: 'TOOL_CALL_END', toolCallId: 'c2' },
    { type: 'TEXT_MESSAGE_START', messageId: 'echo', role: 'assistant' },
    {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'echo',
      delta: '{"ui":[{"AssistantText":{"props":{"text":"Hi"},"children":[]}}]}',
    },
    { type: 'TEXT_MESSAGE_END', messageId: 'echo' },
    {
      type: 'TOOL_CALL_RESULT',
      toolCallId: 'c2',
      messageId: 'm2',
      role: 'tool',
      content: '{"rendered":true}',
    },
    { type: 'TEXT_MESSAGE_START', messageId: 'final', role: 'assistant' },
    { type: 'TEXT_MESSAGE_CONTENT', messageId: 'final', delta: '{"ui"' },
    { type: 'TEXT_MESSAGE_CONTENT', messageId: 'final', delta: ':[]}' },
    { type: 'TEXT_MESSAGE_END', messageId: 'final' },
    { type: 'RUN_FINISHED', threadId: 't', runId: 'r' },
  ]);

  const run = await collectRun(new Response(body), 't');

  expect(run.threadId).toBe('t');
  expect(run.toolCalls).toEqual([
    { id: 'c1', name: 'ledgerSummary', args: {} },
    { id: 'c2', name: 'render', args: { text: 'Hi', components: [] } },
  ]);
  expect(run.toolResults).toEqual([
    { name: 'ledgerSummary', content: '{"asOf":"2026-09-15"}', isError: false },
    { name: 'render', content: '{"rendered":true}', isError: false },
  ]);
  expect(run.finalMessage).toBe('{"ui":[]}');
  expect(run.tokens).toHaveLength(3);
  expect(run.messages.map((m) => m.role)).toEqual(['assistant', 'assistant']);
  expect(run.error).toBeUndefined();
});

test('marks tool errors and surfaces RUN_ERROR', async () => {
  const body = sse([
    { type: 'TOOL_CALL_START', toolCallId: 'c1', toolCallName: 'render' },
    { type: 'TOOL_CALL_ARGS', toolCallId: 'c1', delta: '{"text":""}' },
    { type: 'TOOL_CALL_END', toolCallId: 'c1' },
    {
      type: 'TOOL_CALL_RESULT',
      toolCallId: 'c1',
      messageId: 'm',
      role: 'tool',
      content: '{"error":"invalid_ui: text is empty"}',
    },
    { type: 'RUN_ERROR', message: 'boom' },
  ]);

  const run = await collectRun(new Response(body), 't');

  expect(run.toolResults[0]).toMatchObject({
    name: 'render',
    isError: true,
    status: 'error',
  });
  expect(run.error).toBe('boom');
  expect(run.finalMessage).toBe('');
});
