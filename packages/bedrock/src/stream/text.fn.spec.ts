import { type AGUIEvent, EventType } from '@ag-ui/core';
import { encodeBedrockNative } from './bedrock-native';
import { EventSchemas } from '@ag-ui/core/schemas';
import {
  BedrockRuntimeClient,
  type ConverseStreamOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { text } from './text.fn';
import type { BedrockHashbrownRunAgentInput } from './types';

function createInput(): BedrockHashbrownRunAgentInput {
  return {
    threadId: 'thread-bedrock',
    runId: 'run-bedrock',
    messages: [{ id: 'user-bedrock', role: 'user', content: 'Hello.' }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

function providerStream(
  events: ConverseStreamOutput[],
): AsyncIterable<ConverseStreamOutput> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* events;
    },
  };
}

function createClient(events: ConverseStreamOutput[]) {
  const send = jest.fn(async () => ({
    stream: providerStream(events),
  })) as unknown as BedrockRuntimeClient['send'];
  const destroy = jest.fn();
  const client = { send, destroy } as unknown as BedrockRuntimeClient;

  return { client, send, destroy };
}

async function collectEvents(
  iterable: AsyncIterable<AGUIEvent>,
): Promise<AGUIEvent[]> {
  const events: AGUIEvent[] = [];

  for await (const event of iterable) {
    events.push(EventSchemas.parse(event));
  }

  return events;
}

test('streams canonical AG-UI run and text events from Bedrock', async () => {
  const provider = createClient([
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { text: 'Hello from Bedrock.' },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason: 'end_turn' } },
  ]);

  const events = await collectEvents(
    text({
      client: provider.client,
      model: 'bedrock-model',
      input: createInput(),
    }),
  );

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-bedrock',
      runId: 'run-bedrock',
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'run-bedrock:assistant',
      role: 'assistant',
      metadata: {
        bedrock: {
          responseId: 'run-bedrock:assistant',
          blockIndex: 0,
          nativeBlock: encodeBedrockNative({ text: 'Hello from Bedrock.' }),
        },
      },
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-bedrock:assistant',
      delta: 'Hello from Bedrock.',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-bedrock:assistant',
      metadata: {
        bedrock: {
          responseId: 'run-bedrock:assistant',
          nativeBlock: encodeBedrockNative({ text: 'Hello from Bedrock.' }),
        },
      },
    },
    {
      type: EventType.CUSTOM,
      name: 'hashbrown.provider-history',
      value: {
        v: 1,
        provider: 'bedrock',
        complete: true,
        ownerMessageId: 'run-bedrock:assistant',
        responseId: 'run-bedrock:assistant',
        payload: {
          content: encodeBedrockNative([{ text: 'Hello from Bedrock.' }]),
          representedMessageIds: ['run-bedrock:assistant'],
        },
      },
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-bedrock',
      runId: 'run-bedrock',
      metadata: {
        hashbrown: { finishReason: 'stop' },
        bedrock: { stopReason: 'end_turn' },
      },
    },
  ]);
  expect(provider.send).toHaveBeenCalledTimes(1);
  expect(provider.destroy).not.toHaveBeenCalled();
});

test('passes transformed request options and the abort signal to Bedrock', async () => {
  const provider = createClient([]);
  const controller = new AbortController();
  const transformRequestOptions = jest.fn((options) => ({
    ...options,
    inferenceConfig: { maxTokens: 64, temperature: 0 },
  }));

  await collectEvents(
    text({
      client: provider.client,
      model: 'bedrock-model',
      input: createInput(),
      signal: controller.signal,
      transformRequestOptions,
    }),
  );

  expect(transformRequestOptions).toHaveBeenCalledWith(
    expect.objectContaining({ modelId: 'bedrock-model' }),
  );
  expect(provider.send).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({
        inferenceConfig: { maxTokens: 64, temperature: 0 },
      }),
    }),
    { abortSignal: controller.signal },
  );
});

test('destroys an internally created Bedrock client after streaming', async () => {
  const send = jest.spyOn(BedrockRuntimeClient.prototype, 'send');
  send.mockImplementation((async () => ({
    stream: providerStream([]),
  })) as unknown as BedrockRuntimeClient['send']);
  const destroy = jest
    .spyOn(BedrockRuntimeClient.prototype, 'destroy')
    .mockImplementation(() => undefined);

  const events = await collectEvents(
    text({
      clientOptions: { region: 'us-east-1' },
      model: 'bedrock-model',
      input: createInput(),
    }),
  );

  expect(events.at(-1)).toEqual({
    type: EventType.RUN_FINISHED,
    threadId: 'thread-bedrock',
    runId: 'run-bedrock',
    metadata: { hashbrown: { finishReason: 'other' } },
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(destroy).toHaveBeenCalledTimes(1);

  send.mockRestore();
  destroy.mockRestore();
});

test('maps provider failures to one AG-UI RUN_ERROR', async () => {
  const send = jest.fn().mockRejectedValue(new Error('Bedrock failed'));
  const client = {
    send,
    destroy: jest.fn(),
  } as unknown as BedrockRuntimeClient;

  const events = await collectEvents(
    text({ client, model: 'bedrock-model', input: createInput() }),
  );

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-bedrock',
      runId: 'run-bedrock',
    },
    { type: EventType.RUN_ERROR, message: 'Bedrock failed' },
  ]);
});

test('returns only RUN_STARTED when the signal is already aborted', async () => {
  const provider = createClient([]);
  const controller = new AbortController();
  controller.abort();

  const events = await collectEvents(
    text({
      client: provider.client,
      model: 'bedrock-model',
      input: createInput(),
      signal: controller.signal,
    }),
  );

  expect(events).toEqual([
    {
      type: EventType.RUN_STARTED,
      threadId: 'thread-bedrock',
      runId: 'run-bedrock',
    },
  ]);
  expect(provider.send).not.toHaveBeenCalled();
});

function finished(metadata: Record<string, unknown>, usage?: unknown[]) {
  return {
    type: EventType.RUN_FINISHED,
    threadId: 'thread-bedrock',
    runId: 'run-bedrock',
    ...(usage ? { usage } : {}),
    metadata,
  };
}

function textTurn(stopReason: string): ConverseStreamOutput[] {
  return [
    { messageStart: { role: 'assistant' } },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { text: 'Partial answer' },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason } } as ConverseStreamOutput,
  ];
}

function toolTurn(stopReason: string): ConverseStreamOutput[] {
  return [
    { messageStart: { role: 'assistant' } },
    {
      contentBlockStart: {
        contentBlockIndex: 0,
        start: { toolUse: { toolUseId: 'tool-1', name: 'lookup' } },
      },
    },
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { toolUse: { input: '{"q":"x"}' } },
      },
    },
    { contentBlockStop: { contentBlockIndex: 0 } },
    { messageStop: { stopReason } } as ConverseStreamOutput,
  ];
}

async function runTurn(events: ConverseStreamOutput[]): Promise<AGUIEvent[]> {
  const provider = createClient(events);

  return collectEvents(
    text({
      client: provider.client,
      model: 'bedrock-model',
      input: createInput(),
    }),
  );
}

test('ends a completed run with its usage and a stop reason after trailing metadata', async () => {
  const metadata: ConverseStreamOutput = {
    metadata: {
      usage: {
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 180,
        cacheReadInputTokens: 100,
        cacheWriteInputTokens: 50,
      },
      metrics: { latencyMs: 12 },
    },
  };

  const events = await runTurn([...textTurn('end_turn'), metadata]);

  expect(events).toContainEqual({
    type: EventType.RAW,
    source: 'bedrock',
    event: metadata,
  });
  expect(events.slice(-1)).toEqual([
    finished(
      {
        hashbrown: { finishReason: 'stop' },
        bedrock: { stopReason: 'end_turn' },
      },
      [
        {
          provider: 'bedrock',
          model: 'bedrock-model',
          inputTokens: 170,
          outputTokens: 10,
          totalTokens: 180,
          cachedInputTokens: 100,
          cacheWriteInputTokens: 50,
        },
      ],
    ),
  ]);
});

test('reports the model from the transformed request', async () => {
  const provider = createClient([
    ...textTurn('end_turn'),
    {
      metadata: {
        usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
        metrics: { latencyMs: 1 },
      },
    },
  ]);

  const events = await collectEvents(
    text({
      client: provider.client,
      model: 'bedrock-model',
      input: createInput(),
      transformRequestOptions: (options) => ({
        ...options,
        modelId: 'bedrock-other-model',
      }),
    }),
  );

  expect(events.at(-1)).toEqual(
    finished(
      {
        hashbrown: { finishReason: 'stop' },
        bedrock: { stopReason: 'end_turn' },
      },
      [
        {
          provider: 'bedrock',
          model: 'bedrock-other-model',
          inputTokens: 3,
          outputTokens: 2,
          totalTokens: 5,
        },
      ],
    ),
  );
});

test('reports stop for a stop sequence', async () => {
  const events = await runTurn(textTurn('stop_sequence'));

  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'stop' },
      bedrock: { stopReason: 'stop_sequence' },
    }),
  );
});

test('reports tool_calls when the model stopped for tool use', async () => {
  const events = await runTurn(toolTurn('tool_use'));

  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'tool_calls' },
      bedrock: { stopReason: 'tool_use' },
    }),
  );
});

test('reports tool_calls when the model called a tool and ended its turn', async () => {
  const events = await runTurn(toolTurn('end_turn'));

  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'tool_calls' },
      bedrock: { stopReason: 'end_turn' },
    }),
  );
});

test('finishes a max_tokens truncation with length and closes the text', async () => {
  const events = await runTurn(textTurn('max_tokens'));

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.CUSTOM,
    EventType.RUN_FINISHED,
  ]);
  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'length' },
      bedrock: { stopReason: 'max_tokens' },
    }),
  );
});

test('reports length when the context window is exceeded', async () => {
  const events = await runTurn(textTurn('model_context_window_exceeded'));

  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'length' },
      bedrock: { stopReason: 'model_context_window_exceeded' },
    }),
  );
});

test('finishes a guardrail intervention with content_filter, not an error', async () => {
  const events = await runTurn(textTurn('guardrail_intervened'));

  expect(events.map((event) => event.type)).not.toContain(EventType.RUN_ERROR);
  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'content_filter' },
      bedrock: { stopReason: 'guardrail_intervened' },
    }),
  );
});

test('reports content_filter for filtered content', async () => {
  const events = await runTurn(textTurn('content_filtered'));

  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'content_filter' },
      bedrock: { stopReason: 'content_filtered' },
    }),
  );
});

test('reports other for an unknown stop reason', async () => {
  const events = await runTurn(textTurn('malformed_tool_use'));

  expect(events.at(-1)).toEqual(
    finished({
      hashbrown: { finishReason: 'other' },
      bedrock: { stopReason: 'malformed_tool_use' },
    }),
  );
});

test('omits usage when Bedrock reports none', async () => {
  const events = await runTurn(textTurn('end_turn'));

  expect(events.at(-1)).not.toHaveProperty('usage');
});

test('reports other when the stream ends without a stop reason', async () => {
  const events = await runTurn([
    {
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { text: 'Hi' },
      },
    },
  ]);

  expect(events.at(-1)).toEqual(
    finished({ hashbrown: { finishReason: 'other' } }),
  );
});

test('passes configured built-ins through the transformed native request', async () => {
  const provider = createClient([]);
  const transformRequestOptions = jest.fn((options) => ({
    ...options,
    modelId: 'transformed-model',
  }));

  await collectEvents(
    text({
      client: provider.client,
      model: 'base-model',
      input: createInput(),
      builtInTools: { webSearch: true },
      transformRequestOptions,
    }),
  );

  expect(transformRequestOptions).toHaveBeenCalledWith(
    expect.objectContaining({
      toolConfig: {
        toolChoice: { auto: {} },
        tools: [{ systemTool: { name: 'nova_grounding' } }],
      },
    }),
  );
  expect(provider.send).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({
        modelId: 'transformed-model',
        toolConfig: {
          toolChoice: { auto: {} },
          tools: [{ systemTool: { name: 'nova_grounding' } }],
        },
      }),
    }),
  );
});
