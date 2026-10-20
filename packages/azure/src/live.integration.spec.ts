import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import type OpenAI from 'openai';
import { HashbrownAzure } from './index';
import {
  type AzureReasoningOption,
  isReasoningModel,
} from './stream/reasoning';
import type { AzureHashbrownRunAgentInput } from './stream/types';
import { historyFromEvents } from './testing/history-from-events';

// Live Azure OpenAI checks for the replay rules aimock cannot reproduce
// (reasoning and function_call pairing, item ids) and for the Responses route
// (`{endpoint}/openai/responses?api-version=…`). They need AZURE_API_KEY and
// AZURE_ENDPOINT. Reasoning cases also need AZURE_REASONING_MODEL (a reasoning
// deployment name); the plain case needs AZURE_MODEL (a non-reasoning
// deployment name). AZURE_API_VERSION defaults to `preview`.
const apiKey = process.env['AZURE_API_KEY'];
const endpoint = process.env['AZURE_ENDPOINT'];
const apiVersion = process.env['AZURE_API_VERSION'] ?? 'preview';
const reasoningModel = process.env['AZURE_REASONING_MODEL'] ?? '';
const plainModel = process.env['AZURE_MODEL'] ?? '';
const reasoningTest = apiKey && endpoint && reasoningModel ? test : test.skip;
const plainTest = apiKey && endpoint && plainModel ? test : test.skip;
// A deployment name need not look like a model name; when it does not, the
// default `reasoning` resolves to nothing, so request summaries explicitly.
const DEFAULT_REASONING: AzureReasoningOption | undefined = isReasoningModel(
  reasoningModel,
)
  ? undefined
  : {};
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
): AzureHashbrownRunAgentInput {
  return {
    threadId: 'thread-azure-live',
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
  input: AzureHashbrownRunAgentInput,
  reasoning?: AzureReasoningOption,
  onRequest?: (options: OpenAI.Responses.ResponseCreateParamsStreaming) => void,
): Promise<AGUIEvent[]> {
  return Array.fromAsync(
    HashbrownAzure.stream.text({
      clientOptions: {
        apiKey: apiKey as string,
        endpoint: endpoint as string,
        apiVersion,
      },
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
  reasoning: AzureReasoningOption | undefined,
  runId: string,
  transformHistory: (messages: Message[]) => Message[] = (messages) => messages,
) {
  const first = liveInput(
    runId,
    "Look up 'alpha' and 'beta' using the lookup tool, both at once, then answer in one short sentence.",
  );
  first.tools = [LOOKUP_TOOL];
  const firstEvents = await runLive(reasoningModel, first, reasoning);
  const second: AzureHashbrownRunAgentInput = {
    ...first,
    runId: `${runId}-2`,
    messages: transformHistory(
      historyFromEvents(first.messages, first.runId, firstEvents, lookupResult),
    ),
  };
  let secondRequest: OpenAI.Responses.ResponseCreateParamsStreaming | undefined;
  const secondEvents = await runLive(
    reasoningModel,
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

reasoningTest(
  'reasoning deployment streams reasoning and replays it across two parallel tool calls',
  async () => {
    const runId = 'run-azure-live-parallel';

    const { firstEvents, second, secondEvents, secondRequest } =
      await toolRoundTrip(DEFAULT_REASONING, runId);
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

reasoningTest(
  'reasoning deployment replays a tool round trip with reasoning: false',
  async () => {
    const runId = 'run-azure-live-no-reasoning';

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

reasoningTest(
  'reasoning deployment accepts a tool round trip replayed without its reasoning',
  async () => {
    const runId = 'run-azure-live-dropped-reasoning';

    const { firstEvents, second, secondEvents, secondRequest } =
      await toolRoundTrip(DEFAULT_REASONING, runId, (messages) =>
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

reasoningTest(
  'reasoning deployment replays reasoning before an assistant text message with its item id',
  async () => {
    const first = liveInput(
      'run-azure-live-text',
      'Pick a random fruit and name it in one word.',
    );
    const firstEvents = await runLive(reasoningModel, first, DEFAULT_REASONING);
    const second: AzureHashbrownRunAgentInput = {
      ...first,
      runId: 'run-azure-live-text-2',
      messages: [
        ...historyFromEvents(
          first.messages,
          first.runId,
          firstEvents,
          () => '',
        ),
        {
          id: 'run-azure-live-text-2:user',
          role: 'user',
          content: 'What colour is it? One word.',
        },
      ],
    };
    let secondRequest:
      OpenAI.Responses.ResponseCreateParamsStreaming | undefined;

    const secondEvents = await runLive(
      reasoningModel,
      second,
      DEFAULT_REASONING,
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

plainTest(
  'non-reasoning deployment runs without a reasoning field',
  async () => {
    const input = liveInput('run-azure-live-plain', 'Say hi in two words.');
    let request: OpenAI.Responses.ResponseCreateParamsStreaming | undefined;

    const events = await runLive(plainModel, input, undefined, (options) => {
      request = options;
    });

    expect(request?.reasoning).toBeUndefined();
    expect(errorOf(events)).toBeUndefined();
    expect(types(events)).not.toContain(EventType.REASONING_MESSAGE_START);
    expect(types(events)).toContain(EventType.TEXT_MESSAGE_CONTENT);
    expect(types(events)).toContain(EventType.RUN_FINISHED);
  },
  LIVE_TIMEOUT,
);
