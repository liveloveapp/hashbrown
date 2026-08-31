import { type AGUIEvent, EventSchemas, EventType } from '@ag-ui/core';
import { HashbrownBedrock } from './index';
import type { BedrockHashbrownRunAgentInput } from './stream/types';

const region = requiredEnvironmentVariable('AWS_REGION');
const model = requiredEnvironmentVariable('BEDROCK_MODEL_ID');

jest.setTimeout(120_000);

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Bedrock runtime verification`);
  }

  return value;
}

function input(runId: string, content: string): BedrockHashbrownRunAgentInput {
  return {
    threadId: 'bedrock-runtime-verification',
    runId,
    messages: [
      {
        id: `${runId}:system`,
        role: 'system',
        content: 'Follow the user instructions exactly and answer briefly.',
      },
      { id: `${runId}:user`, role: 'user', content },
    ],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

async function run(
  value: BedrockHashbrownRunAgentInput,
  transformRequestOptions?: Parameters<
    typeof HashbrownBedrock.stream.text
  >[0]['transformRequestOptions'],
): Promise<AGUIEvent[]> {
  const events: AGUIEvent[] = [];

  for await (const event of HashbrownBedrock.stream.text({
    clientOptions: { region },
    model,
    input: value,
    transformRequestOptions: (options) => {
      const bounded = {
        ...options,
        inferenceConfig: { maxTokens: 96, temperature: 0 },
      };
      return transformRequestOptions
        ? transformRequestOptions(bounded)
        : bounded;
    },
  })) {
    events.push(EventSchemas.parse(event));
  }

  const error = events.find((event) => event.type === EventType.RUN_ERROR);
  if (error?.type === EventType.RUN_ERROR) {
    throw new Error(error.message);
  }
  expect(events[0]?.type).toBe(EventType.RUN_STARTED);
  expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);

  return events;
}

function textContent(events: AGUIEvent[]): string {
  return events
    .filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)
    .map((event) => event.delta)
    .join('');
}

test('streams a real Bedrock text response as canonical AG-UI', async () => {
  const events = await run(
    input(
      'bedrock-runtime-text',
      'Reply with exactly this marker: hashbrown-bedrock-smoke',
    ),
  );

  expect(textContent(events).toLowerCase()).toContain(
    'hashbrown-bedrock-smoke',
  );
  expect(events).toContainEqual(
    expect.objectContaining({ type: EventType.TEXT_MESSAGE_END }),
  );
});

test('streams a real Bedrock tool call as canonical AG-UI', async () => {
  const value = input(
    'bedrock-runtime-tool',
    'Call lookup with query set to hashbrown. Do not answer with text.',
  );
  value.tools = [
    {
      name: 'lookup',
      description: 'Look up one exact query.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', enum: ['hashbrown'] },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  ];

  const events = await run(value, (options) => ({
    ...options,
    toolConfig: options.toolConfig
      ? { ...options.toolConfig, toolChoice: { any: {} } }
      : undefined,
  }));
  const start = events.find(
    (event) => event.type === EventType.TOOL_CALL_START,
  );
  const argumentsText = events
    .filter((event) => event.type === EventType.TOOL_CALL_ARGS)
    .map((event) => event.delta)
    .join('');

  expect(start).toMatchObject({
    type: EventType.TOOL_CALL_START,
    toolCallName: 'lookup',
  });
  expect(JSON.parse(argumentsText)).toEqual({ query: 'hashbrown' });
  expect(events).toContainEqual(
    expect.objectContaining({
      type: EventType.TOOL_CALL_END,
      toolCallId:
        start?.type === EventType.TOOL_CALL_START
          ? start.toolCallId
          : 'missing-tool-call',
    }),
  );
});

test('streams real Bedrock native structured output as canonical AG-UI text', async () => {
  const value = input(
    'bedrock-runtime-structured-output',
    'Return the object required by the response schema.',
  );
  value.hashbrown = {
    responseSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['runtime-ok'] },
      },
      required: ['status'],
      additionalProperties: false,
    },
  };

  const events = await run(value);

  expect(JSON.parse(textContent(events))).toEqual({ status: 'runtime-ok' });
});
