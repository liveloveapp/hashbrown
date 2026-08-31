import { type AGUIEvent, EventSchemas, EventType } from '@ag-ui/core';
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
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'run-bedrock:assistant',
      delta: 'Hello from Bedrock.',
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'run-bedrock:assistant',
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-bedrock',
      runId: 'run-bedrock',
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
