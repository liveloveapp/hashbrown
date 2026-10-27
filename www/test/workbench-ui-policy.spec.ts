import type { Message, RunAgentInput } from '@ag-ui/core';
import type { ResponseCreateParamsStreaming } from 'openai/resources/responses/responses';
import { expect, test } from 'vitest';
import { applyWorkbenchUiToolPolicy } from '../examples/quickstart/server/workbench-ui-policy';
import { createWorkbenchOpenAIStream } from '../examples/quickstart/server/workbench-openai';
import { pinWorkbenchInput } from '../examples/quickstart/server/workbench-app';
import { createSupportProviderEvents } from '../src/tools/docs-request-transform-fixtures';
import { createServer } from 'node:http';

const snapshot = { revision: 0, plan: null };
const user: Message = { id: 'u', role: 'user', content: 'Plan' };
const call: Message = {
  id: 'a',
  role: 'assistant',
  toolCalls: [
    {
      id: 'c',
      type: 'function',
      function: { name: 'readContext', arguments: '{}' },
    },
  ],
};
const result: Message = {
  id: 't',
  role: 'tool',
  toolCallId: 'c',
  content: JSON.stringify(snapshot),
};
const input = (messages: Message[]): RunAgentInput => ({
  threadId: 't',
  runId: 'r',
  state: {},
  tools: [],
  context: [],
  messages,
});
const mapped: ResponseCreateParamsStreaming = {
  model: 'fixture-model',
  stream: true,
  input: [],
  tools: [
    {
      type: 'function',
      name: 'readContext',
      parameters: { type: 'object' },
      strict: true,
    },
  ],
  text: {
    format: {
      type: 'json_schema',
      name: 'ui',
      schema: { type: 'object' },
      strict: true,
    },
  },
  max_output_tokens: 2048,
};

test('requires fresh readContext on every ordinary UI user turn, preserving mapped options', () => {
  const before = structuredClone(mapped);

  for (const lesson of ['ui-kits', 'ui-chatbot'] as const) {
    const first = applyWorkbenchUiToolPolicy(mapped, input([user]), lesson);
    const next = applyWorkbenchUiToolPolicy(
      mapped,
      input([user, call, result, { ...user, id: 'u2' }]),
      lesson,
    );
    expect(first.tool_choice).toEqual({
      type: 'function',
      name: 'readContext',
    });
    expect(next.tool_choice).toEqual(first.tool_choice);
    expect(first.parallel_tool_calls).toBe(false);
    expect({
      ...first,
      tool_choice: undefined,
      parallel_tool_calls: undefined,
    }).toEqual({
      ...mapped,
      tool_choice: undefined,
      parallel_tool_calls: undefined,
    });
  }
  expect(mapped).toEqual(before);
});

test('disables further tools only after a successful matched current-turn application context result', () => {
  for (const context of [
    snapshot,
    {
      revision: 1,
      plan: {
        title: 'Trusted demo',
        steps: ['Outline the demo.', 'Record it.'],
      },
    },
  ]) {
    const messages = [
      user,
      call,
      { ...result, content: JSON.stringify(context) },
    ];

    expect(
      applyWorkbenchUiToolPolicy(mapped, input(messages), 'ui-kits')
        .tool_choice,
    ).toBe('none');
    expect(
      applyWorkbenchUiToolPolicy(mapped, input(messages), 'ui-chatbot')
        .tool_choice,
    ).toBe('none');
  }
});

test('ignores historical, unknown, rejected, invalid, reversed and mismatched tool results', () => {
  const cases: Message[][] = [
    [call, result, user],
    [user, result],
    [user, result, call],
    [
      user,
      {
        ...call,
        toolCalls: [
          {
            id: 'c',
            type: 'function',
            function: { name: 'unknown', arguments: '{}' },
          },
        ],
      },
      result,
    ],
    [user, call, { ...result, toolCallId: 'other' }],
    [user, call, { ...result, error: 'Rejected' }],
    ...[
      '',
      '{',
      '{}',
      '{"error":"Rejected"}',
      '{"revision":-1,"plan":null}',
      '{"revision":1,"plan":{"title":"Plan","steps":["Only one"]}}',
    ].map((content) => [user, call, { ...result, content }]),
  ];

  for (const messages of cases)
    expect(
      applyWorkbenchUiToolPolicy(mapped, input(messages), 'ui-kits')
        .tool_choice,
    ).toEqual({ type: 'function', name: 'readContext' });
});

test('does not change native tool policy for any other lesson', () => {
  const before = { ...mapped, tool_choice: 'auto' as const };

  for (const lesson of [
    'generative-ui',
    'request-transformation',
    'system-instructions',
    undefined,
  ] as const)
    expect(applyWorkbenchUiToolPolicy(before, input([user]), lesson)).toBe(
      before,
    );
});

test('actual adapter sends native readContext policy while retaining pinned schema, tools and output limit', async () => {
  const payloads: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    payloads.push(JSON.parse(body));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const event of createSupportProviderEvents('{"ui":[]}'))
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    res.end();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const stream = createWorkbenchOpenAIStream({
    apiKey: 'fixture-only',
    model: 'fixture-model',
    baseURL: `http://127.0.0.1:${address.port}/v1`,
  });

  try {
    for (const messages of [
      [user],
      [user, call, result],
      [user, call, result, { ...user, id: 'u2' }],
    ]) {
      const pinned = pinWorkbenchInput(input(messages), 'ui-kits');
      for await (const event of stream(
        pinned,
        new AbortController().signal,
        'ui-kits',
      ))
        void event;
    }

    expect(payloads.map((payload) => payload['tool_choice'])).toEqual([
      { type: 'function', name: 'readContext' },
      'none',
      { type: 'function', name: 'readContext' },
    ]);
    expect(
      payloads.every((payload) => payload['parallel_tool_calls'] === false),
    ).toBe(true);
    expect(
      payloads.every((payload) => payload['max_output_tokens'] === 2048),
    ).toBe(true);
    expect(
      payloads.every((payload) =>
        JSON.stringify(payload['tools']).includes('readContext'),
      ),
    ).toBe(true);
    expect(
      payloads.every((payload) =>
        JSON.stringify(payload['text']).includes('StepsCard'),
      ),
    ).toBe(true);
    expect(payloads[1]['input']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'function_call',
          name: 'readContext',
          call_id: 'c',
        }),
        expect.objectContaining({ type: 'function_call_output', call_id: 'c' }),
      ]),
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test('structured tool content cannot satisfy the text-only context result policy', () => {
  const structuredResult: Message = {
    id: 'structured',
    role: 'tool',
    toolCallId: 'c',
    content: [{ type: 'text', text: JSON.stringify(snapshot) }],
  };

  for (const lesson of ['ui-kits', 'ui-chatbot'] as const) {
    expect(
      applyWorkbenchUiToolPolicy(
        mapped,
        input([user, call, structuredResult]),
        lesson,
      ).tool_choice,
    ).toEqual({ type: 'function', name: 'readContext' });
  }
});
