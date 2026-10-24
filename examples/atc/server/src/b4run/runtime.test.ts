import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, onTestFinished, test, vi } from 'vitest';
import { createAgentRuntime } from './runtime';
import { AGENT_URL } from './handler';
import { PINNED_RESPONSE_SCHEMAS } from '../run-policy';

interface CapturedRequest {
  readonly response_format: {
    readonly json_schema: { readonly schema: unknown };
  };
  readonly max_completion_tokens: number;
  readonly tools: readonly { readonly function: { readonly name: string } }[];
}
interface ProtocolEvent {
  readonly type: string;
  readonly runId?: string;
  readonly toolCallName?: string;
  readonly toolCallId?: string;
}

const schema = PINNED_RESPONSE_SCHEMAS[0];
const tools = [
  {
    name: 'findAircraft',
    description: 'Find aircraft',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'highlightAircraft',
    description: 'Highlight aircraft',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];
const user = { id: 'user', role: 'user', content: 'Find the fastest aircraft' };

function provider(
  turns: { call?: string; id?: string; calls?: string[]; content?: string }[],
) {
  const requests: CapturedRequest[] = [];
  vi.stubEnv('OPENAI_API_KEY', 'unused-test-key');
  vi.stubEnv('OPENAI_BASE_URL', 'https://atc-test.invalid/v1');
  vi.stubGlobal('fetch', async (url: string | Request, init?: RequestInit) => {
    const request = url instanceof Request ? url : new Request(url, init);
    expect(new URL(request.url).hostname).toBe('atc-test.invalid');
    requests.push((await request.json()) as CapturedRequest);
    const turn = turns.shift();
    if (!turn) throw new Error('Unexpected provider request');
    const calls = turn.calls ?? (turn.call ? [turn.call] : []);
    const delta = calls.length
      ? {
          role: 'assistant',
          content: null,
          tool_calls: calls.map((name, index) => ({
            index,
            id: turn.id ?? `call-${index}`,
            type: 'function',
            function: { name: `client_${name}`, arguments: '{}' },
          })),
        }
      : { role: 'assistant', content: turn.content };
    const chunk = (delta: object, finish_reason: string | null) => ({
      id: `completion-${requests.length}`,
      object: 'chat.completion.chunk',
      created: 1,
      model: 'gpt-5-mini',
      choices: [{ index: 0, delta, finish_reason }],
    });
    return new Response(
      [chunk(delta, null), chunk({}, calls.length ? 'tool_calls' : 'stop')]
        .map((value) => `data: ${JSON.stringify(value)}\n\n`)
        .join('') + 'data: [DONE]\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  onTestFinished(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  return requests;
}

async function runtime(now?: () => number) {
  const appRoot = await mkdtemp(join(tmpdir(), 'atc-runtime-'));
  const runtime = await createAgentRuntime({
    appRoot,
    run: {
      apiKey: 'unused-test-key',
      model: 'gpt-5-mini',
      reasoningEffort: null,
    },
    env: {},
    now,
  });
  onTestFinished(async () => {
    await runtime.close();
    await rm(appRoot, { recursive: true, force: true });
  });
  return runtime;
}

function request(messages: object[], runId: string, visitor = 'visitor-a') {
  return new Request(AGENT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-atc-visitor': visitor },
    body: JSON.stringify({
      threadId: 'browser-thread',
      runId,
      messages,
      tools,
      state: {},
      context: [],
      forwardedProps: { responseSchema: schema },
    }),
  });
}
function events(text: string): ProtocolEvent[] {
  return text.split('\n\n').flatMap((frame) => {
    const data = frame.split('\n').find((line) => line.startsWith('data:'));
    return data ? [JSON.parse(data.slice(5))] : [];
  });
}

test('the real agent parks browser tools, resumes with the same schema and caps every call', async () => {
  const captured = provider([
    { call: 'findAircraft', id: 'find' },
    { call: 'highlightAircraft', id: 'highlight' },
    { content: '{"ui":[]}' },
  ]);
  const agent = await runtime();
  const history: object[] = [user];
  const outputs: ProtocolEvent[][] = [];

  for (const [index, name] of [
    'findAircraft',
    'highlightAircraft',
    undefined,
  ].entries()) {
    const response = await agent.fetch(request(history, `run-${index}`));
    expect(response.status).toBe(200);
    const batch = events(await response.text());
    outputs.push(batch);
    expect(batch.at(-1)?.type, JSON.stringify(batch)).toBe('RUN_FINISHED');
    expect(batch.at(-1)?.runId).toBe(`run-${index}`);
    if (name) {
      const call = batch.find(
        (event) =>
          event.type === 'TOOL_CALL_START' && event.toolCallName === name,
      );
      if (!call) throw new Error(`Missing browser call: ${name}`);
      history.push(
        {
          id: `assistant-${index}`,
          role: 'assistant',
          toolCalls: [
            {
              id: call.toolCallId,
              type: 'function',
              function: { name, arguments: '{}' },
            },
          ],
        },
        {
          id: `result-${index}`,
          role: 'tool',
          toolCallId: call.toolCallId,
          content: 'done',
        },
      );
    }
  }

  expect(captured).toHaveLength(3);
  captured.forEach((body) => {
    expect(body.response_format.json_schema.schema).toEqual(schema);
    expect(body.max_completion_tokens).toBe(4096);
    expect(body.tools.map((tool) => tool.function.name).sort()).toEqual([
      'client_findAircraft',
      'client_highlightAircraft',
    ]);
  });
  const replay = outputs[1].find(
    (event) => event.type === 'TOOL_CALL_START' && event.toolCallId === 'find',
  );
  expect(replay).not.toHaveProperty('parentMessageId');
  expect(
    outputs[1].filter(
      (event) => event.type === 'TOOL_CALL_ARGS' && event.toolCallId === 'find',
    ),
  ).toEqual([]);
});

test('another visitor cannot resume an existing anonymous conversation', async () => {
  const captured = provider([{ call: 'findAircraft', id: 'find' }]);
  const agent = await runtime();
  await (await agent.fetch(request([user], 'first'))).text();

  const response = await agent.fetch(request([user], 'other', 'visitor-b'));

  expect(response.status).toBe(403);
  expect(captured).toHaveLength(1);
});

test('anonymous conversations cannot resume after their admission window expires', async () => {
  const captured = provider([{ call: 'findAircraft', id: 'find' }]);
  let now = Date.now();
  const agent = await runtime(() => now);
  await (await agent.fetch(request([user], 'first'))).text();

  now += 25 * 60 * 60 * 1000;
  const response = await agent.fetch(request([user], 'expired'));

  expect(response.status).toBe(404);
  expect(captured).toHaveLength(1);
});

test('parallel browser results resume only once after all results arrive', async () => {
  const captured = provider([
    { calls: ['findAircraft', 'highlightAircraft'] },
    { content: '{"ui":[]}' },
  ]);
  const agent = await runtime();
  const history: object[] = [user];

  const first = events(
    await (await agent.fetch(request(history, 'parallel'))).text(),
  );
  const calls = first.filter((event) => event.type === 'TOOL_CALL_START');
  expect(calls.map((call) => call.toolCallName)).toEqual([
    'findAircraft',
    'highlightAircraft',
  ]);
  history.push({
    id: 'assistant',
    role: 'assistant',
    toolCalls: calls.map((call) => ({
      id: call.toolCallId,
      type: 'function',
      function: { name: call.toolCallName, arguments: '{}' },
    })),
  });
  history.push({
    id: 'find-result',
    role: 'tool',
    toolCallId: calls[0].toolCallId,
    content: 'found',
  });
  await (await agent.fetch(request(history, 'partial'))).text();
  expect(captured).toHaveLength(1);
  history.push({
    id: 'highlight-result',
    role: 'tool',
    toolCallId: calls[1].toolCallId,
    content: 'highlighted',
  });
  const complete = events(
    await (await agent.fetch(request(history, 'complete'))).text(),
  );
  await (await agent.fetch(request(history, 'duplicate'))).text();

  expect(complete.at(-1)?.type).toBe('RUN_FINISHED');
  expect(captured).toHaveLength(2);
  captured.forEach((body) =>
    expect(body.response_format.json_schema.schema).toEqual(schema),
  );
});
