import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import type OpenAI from 'openai';
import { HashbrownOpenAI } from './index';
import type { OpenAIReasoningOption } from './stream/reasoning';
import type { OpenAIHashbrownRunAgentInput } from './stream/types';
import { historyFromEvents } from './testing/history-from-events';

// Live OpenAI checks for the replay rules aimock cannot reproduce (reasoning
// and function_call pairing, item ids). They call the paid API, so they run
// only when HASHBROWN_LIVE_TESTS=1 and OPENAI_API_KEY are both set; CI's
// `nx run-many -t e2e` (which has OPENAI_API_KEY) skips them. Run them with:
//
//   set -a; source .env; set +a; HASHBROWN_LIVE_TESTS=1 npx nx e2e openai
const liveEnabled = process.env['HASHBROWN_LIVE_TESTS'] === '1';
const apiKey = process.env['OPENAI_API_KEY'];
const liveTest = liveEnabled && apiKey ? test : test.skip;
const LIVE_TIMEOUT = 120_000;

const LOOKUP_TOOL = {
  name: 'lookup',
  description: 'Looks up a short fact about a code word.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false,
  },
};

function liveInput(
  runId: string,
  userMessage: string,
): OpenAIHashbrownRunAgentInput {
  return {
    threadId: 'thread-openai-live',
    runId,
    messages: [
      {
        id: `${runId}:system`,
        role: 'system',
        content: 'You are a terse test assistant.',
      },
      { id: `${runId}:user`, role: 'user', content: userMessage },
    ],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

async function runLive(
  model: string,
  input: OpenAIHashbrownRunAgentInput,
  reasoning?: OpenAIReasoningOption,
  onRequest?: (options: OpenAI.Responses.ResponseCreateParamsStreaming) => void,
): Promise<AGUIEvent[]> {
  return Array.fromAsync(
    HashbrownOpenAI.stream.text({
      apiKey: apiKey as string,
      model,
      input,
      reasoning,
      transformRequestOptions: (options) => {
        onRequest?.(options);
        return { ...options, max_output_tokens: 2_000 };
      },
    }),
    (event) => EventSchemas.parse(event),
  );
}

function types(events: readonly AGUIEvent[]): EventType[] {
  return events.map((event) => event.type);
}

function errorOf(events: readonly AGUIEvent[]): string | undefined {
  const error = events.find((event) => event.type === EventType.RUN_ERROR);
  return error?.type === EventType.RUN_ERROR ? error.message : undefined;
}

function lookupResult(toolCall: { readonly id: string }): string {
  return JSON.stringify({ fact: `The code word for ${toolCall.id} is green.` });
}

async function toolRoundTrip(
  reasoning: OpenAIReasoningOption | undefined,
  runId: string,
  transformHistory: (messages: Message[]) => Message[] = (messages) => messages,
) {
  const first = liveInput(
    runId,
    "Look up 'alpha' and 'beta' using the lookup tool, both at once, then answer in one short sentence.",
  );
  first.tools = [LOOKUP_TOOL];
  const firstEvents = await runLive('gpt-5-mini', first, reasoning);
  const second: OpenAIHashbrownRunAgentInput = {
    ...first,
    runId: `${runId}-2`,
    messages: transformHistory(
      historyFromEvents(first.messages, first.runId, firstEvents, lookupResult),
    ),
  };
  let secondRequest: OpenAI.Responses.ResponseCreateParamsStreaming | undefined;
  const secondEvents = await runLive(
    'gpt-5-mini',
    second,
    reasoning,
    (options) => {
      secondRequest = options;
    },
  );

  return { firstEvents, second, secondEvents, secondRequest };
}

function replayedItems(
  request: OpenAI.Responses.ResponseCreateParamsStreaming | undefined,
): OpenAI.Responses.ResponseInputItem[] {
  return Array.isArray(request?.input) ? request.input : [];
}

liveTest(
  'gpt-5-mini streams reasoning and replays it across two parallel tool calls',
  async () => {
    const runId = 'run-openai-live-parallel';

    const { firstEvents, second, secondEvents, secondRequest } =
      await toolRoundTrip(undefined, runId);
    const items = replayedItems(secondRequest);
    const functionCalls = items.filter(
      (item) => 'type' in item && item.type === 'function_call',
    );
    const toolCallCount = types(firstEvents).filter(
      (type) => type === EventType.TOOL_CALL_START,
    ).length;

    expect(errorOf(firstEvents)).toBeUndefined();
    expect(types(firstEvents)).toContain(EventType.RUN_FINISHED);
    expect(types(firstEvents)).toContain(EventType.REASONING_MESSAGE_START);
    expect(types(firstEvents)).toContain(EventType.REASONING_ENCRYPTED_VALUE);
    expect(toolCallCount).toBeGreaterThanOrEqual(1);
    expect(
      second.messages.filter((message) => message.role === 'tool'),
    ).toHaveLength(toolCallCount);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'reasoning',
          id: expect.any(String),
          encrypted_content: expect.any(String),
        }),
      ]),
    );
    expect(functionCalls).toHaveLength(toolCallCount);
    expect(functionCalls).toEqual(
      functionCalls.map(() =>
        expect.objectContaining({ id: expect.stringMatching(/^fc_/) }),
      ),
    );
    expect(errorOf(secondEvents)).toBeUndefined();
    expect(types(secondEvents)).toContain(EventType.TEXT_MESSAGE_CONTENT);
    expect(types(secondEvents)).toContain(EventType.RUN_FINISHED);
  },
  LIVE_TIMEOUT,
);

liveTest(
  'gpt-5-mini replays a tool round trip with reasoning: false',
  async () => {
    const runId = 'run-openai-live-no-reasoning';

    const { firstEvents, secondEvents, secondRequest } = await toolRoundTrip(
      false,
      runId,
    );
    const items = replayedItems(secondRequest);

    expect(errorOf(firstEvents)).toBeUndefined();
    expect(types(firstEvents)).toContain(EventType.RUN_FINISHED);
    expect(types(firstEvents)).toContain(EventType.TOOL_CALL_START);
    expect(secondRequest?.reasoning).toBeUndefined();
    expect(secondRequest?.include).toBeUndefined();
    expect(
      items.filter((item) => 'type' in item && item.type === 'function_call'),
    ).not.toEqual([]);
    expect(errorOf(secondEvents)).toBeUndefined();
    expect(types(secondEvents)).toContain(EventType.TEXT_MESSAGE_CONTENT);
    expect(types(secondEvents)).toContain(EventType.RUN_FINISHED);
  },
  LIVE_TIMEOUT,
);

liveTest(
  'gpt-5-mini accepts a tool round trip replayed without its reasoning',
  async () => {
    const runId = 'run-openai-live-dropped-reasoning';

    const { firstEvents, second, secondEvents, secondRequest } =
      await toolRoundTrip(undefined, runId, (messages) =>
        messages.filter((message) => message.role !== 'reasoning'),
      );
    const items = replayedItems(secondRequest);
    const functionCalls = items.filter(
      (item) => 'type' in item && item.type === 'function_call',
    );

    expect(errorOf(firstEvents)).toBeUndefined();
    expect(types(firstEvents)).toContain(EventType.REASONING_ENCRYPTED_VALUE);
    expect(
      second.messages.some((message) => message.role === 'reasoning'),
    ).toBe(false);
    expect(
      items.some((item) => 'type' in item && item.type === 'reasoning'),
    ).toBe(false);
    expect(functionCalls).not.toEqual([]);
    expect(functionCalls.filter((item) => 'id' in item)).toEqual([]);
    expect(errorOf(secondEvents)).toBeUndefined();
    expect(types(secondEvents)).toContain(EventType.TEXT_MESSAGE_CONTENT);
    expect(types(secondEvents)).toContain(EventType.RUN_FINISHED);
  },
  LIVE_TIMEOUT,
);

liveTest(
  'gpt-5-mini replays reasoning before an assistant text message with its item id',
  async () => {
    const first = liveInput(
      'run-openai-live-text',
      'Pick a random fruit and name it in one word.',
    );
    const firstEvents = await runLive('gpt-5-mini', first);
    const second: OpenAIHashbrownRunAgentInput = {
      ...first,
      runId: 'run-openai-live-text-2',
      messages: [
        ...historyFromEvents(
          first.messages,
          first.runId,
          firstEvents,
          () => '',
        ),
        {
          id: 'run-openai-live-text-2:user',
          role: 'user',
          content: 'What colour is it? One word.',
        },
      ],
    };
    let secondRequest:
      OpenAI.Responses.ResponseCreateParamsStreaming | undefined;

    const secondEvents = await runLive(
      'gpt-5-mini',
      second,
      undefined,
      (options) => {
        secondRequest = options;
      },
    );
    const items = replayedItems(secondRequest);

    expect(errorOf(firstEvents)).toBeUndefined();
    expect(types(firstEvents)).toContain(EventType.REASONING_MESSAGE_START);
    expect(types(firstEvents)).toContain(EventType.REASONING_ENCRYPTED_VALUE);
    expect(types(firstEvents)).toContain(EventType.TEXT_MESSAGE_CONTENT);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'reasoning',
          encrypted_content: expect.any(String),
        }),
        expect.objectContaining({
          type: 'message',
          id: expect.stringMatching(/^msg_/),
          role: 'assistant',
        }),
      ]),
    );
    expect(errorOf(secondEvents)).toBeUndefined();
    expect(types(secondEvents)).toContain(EventType.TEXT_MESSAGE_CONTENT);
    expect(types(secondEvents)).toContain(EventType.RUN_FINISHED);
  },
  LIVE_TIMEOUT,
);

liveTest(
  'gpt-4.1-mini runs without a reasoning field',
  async () => {
    const input = liveInput('run-openai-live-plain', 'Say hi in two words.');
    let request: OpenAI.Responses.ResponseCreateParamsStreaming | undefined;

    const events = await runLive(
      'gpt-4.1-mini',
      input,
      undefined,
      (options) => {
        request = options;
      },
    );

    expect(request?.reasoning).toBeUndefined();
    expect(errorOf(events)).toBeUndefined();
    expect(types(events)).not.toContain(EventType.REASONING_MESSAGE_START);
    expect(types(events)).toContain(EventType.TEXT_MESSAGE_CONTENT);
    expect(types(events)).toContain(EventType.RUN_FINISHED);
  },
  LIVE_TIMEOUT,
);
