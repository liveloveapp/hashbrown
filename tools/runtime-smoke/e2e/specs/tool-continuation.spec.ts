import { type AGUIEvent, EventType } from '@ag-ui/core';
import { isDeepStrictEqual } from 'node:util';
import { createAppDriver } from '../harness/app-driver';
import {
  createTextRunEvents,
  type HashbrownRunInput,
  registerRunFixture,
} from '../harness/agui';
import { openScenario } from '../harness/browser';
import { expect, test } from '../harness/test-fixture';

test.use({ trace: 'off' });

const weatherResult = {
  city: 'Paris',
  temperatureC: 21,
  condition: 'sunny',
};
const serializedWeatherResult = JSON.stringify(weatherResult);
const expectedWeatherTool = {
  name: 'getWeather',
  description: 'Get the current weather for a city.',
  parameters: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'The city to get weather for',
      },
    },
    required: ['city'],
    additionalProperties: false,
    description: 'Weather lookup',
  },
};

function createInitialMessages(
  threadId: string,
): HashbrownRunInput['messages'] {
  return [
    {
      id: `${threadId}:system`,
      role: 'system',
      content: 'Runtime smoke system prompt.',
    },
    {
      id: `${threadId}:message:0`,
      role: 'user',
      content: 'What is the weather in Paris?',
    },
  ];
}

function createContinuationMessages(
  threadId: string,
): HashbrownRunInput['messages'] {
  return [
    ...createInitialMessages(threadId),
    {
      id: 'reasoning-weather',
      role: 'reasoning',
      content: 'I need the weather tool.',
      encryptedValue: 'fixture-opaque-value',
      metadata: { provider: { trace: ['weather'] } },
    },
    {
      id: `${threadId}:message:1`,
      role: 'assistant',
      content: '',
      encryptedValue: 'fixture-assistant-opaque-value',
      metadata: {
        provider: { assistantSteps: [{ index: 0 }] },
      },
      toolCalls: [
        {
          id: 'call-weather',
          type: 'function',
          encryptedValue: 'fixture-tool-opaque-value',
          metadata: {
            provider: { toolSteps: [{ index: 1 }] },
          },
          function: {
            name: 'getWeather',
            arguments: '{"city":"Paris"}',
          },
        },
      ],
    },
    {
      id: 'call-weather',
      role: 'tool',
      toolCallId: 'call-weather',
      content: serializedWeatherResult,
    },
  ];
}

function hasExactWeatherContinuation(input: HashbrownRunInput): boolean {
  return isDeepStrictEqual(
    input.messages,
    createContinuationMessages(input.threadId),
  );
}

/** Returns transcript records with opaque values reduced to presence booleans. */
function safeTranscript(messages: HashbrownRunInput['messages']) {
  return messages.map((message) => {
    if (message.role === 'assistant') {
      const { encryptedValue, toolCalls, ...safeMessage } = message;
      return {
        ...safeMessage,
        hasOpaqueValue:
          typeof encryptedValue === 'string' && encryptedValue.length > 0,
        ...(toolCalls
          ? {
              toolCalls: toolCalls.map((toolCall) => {
                const { encryptedValue: toolEncryptedValue, ...safeToolCall } =
                  toolCall;
                return {
                  ...safeToolCall,
                  hasOpaqueValue:
                    typeof toolEncryptedValue === 'string' &&
                    toolEncryptedValue.length > 0,
                };
              }),
            }
          : {}),
      };
    }

    if (message.role === 'reasoning') {
      const { encryptedValue, ...safeMessage } = message;
      return {
        ...safeMessage,
        hasOpaqueValue:
          typeof encryptedValue === 'string' && encryptedValue.length > 0,
      };
    }

    return message;
  });
}

function createToolContinuationEvents(
  input: HashbrownRunInput,
  requestIndex: number,
): AGUIEvent[] {
  if (requestIndex === 0) {
    return [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
        timestamp: 1_700_000_002_000,
      },
      {
        type: EventType.REASONING_MESSAGE_START,
        messageId: 'reasoning-weather',
        role: 'reasoning',
        metadata: { provider: { trace: ['weather'] } },
        timestamp: 1_700_000_002_001,
      },
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'reasoning-weather',
        delta: 'I need the weather tool.',
        timestamp: 1_700_000_002_002,
      },
      {
        type: EventType.REASONING_ENCRYPTED_VALUE,
        subtype: 'message',
        entityId: 'reasoning-weather',
        encryptedValue: 'fixture-opaque-value',
        timestamp: 1_700_000_002_003,
      },
      {
        type: EventType.REASONING_MESSAGE_END,
        messageId: 'reasoning-weather',
        timestamp: 1_700_000_002_004,
      },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: `${input.threadId}:message:1`,
        role: 'assistant',
        timestamp: 1_700_000_002_005,
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: `${input.threadId}:message:1`,
        metadata: {
          provider: { assistantSteps: [{ index: 0 }] },
        },
        timestamp: 1_700_000_002_006,
      },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call-weather',
        toolCallName: 'getWeather',
        parentMessageId: `${input.threadId}:message:1`,
        timestamp: 1_700_000_002_007,
      },
      {
        type: EventType.REASONING_ENCRYPTED_VALUE,
        subtype: 'message',
        entityId: `${input.threadId}:message:1`,
        encryptedValue: 'fixture-assistant-opaque-value',
        timestamp: 1_700_000_002_008,
      },
      {
        type: EventType.REASONING_ENCRYPTED_VALUE,
        subtype: 'tool-call',
        entityId: 'call-weather',
        encryptedValue: 'fixture-tool-opaque-value',
        timestamp: 1_700_000_002_009,
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'call-weather',
        delta: '{"city":"Paris"}',
        timestamp: 1_700_000_002_010,
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: 'call-weather',
        metadata: {
          provider: { toolSteps: [{ index: 1 }] },
        },
        timestamp: 1_700_000_002_011,
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
        timestamp: 1_700_000_002_012,
      },
    ];
  }

  if (requestIndex === 1) {
    return createTextRunEvents(
      input,
      'message-weather-final',
      ['It is 21 C and sunny in Paris.'],
      1_700_000_003_000,
    );
  }

  throw new Error(`Unexpected matched request index: ${requestIndex}`);
}

test('executes a tool once and automatically continues the run', async ({
  page,
  aimock,
}) => {
  const captured: HashbrownRunInput[] = [];
  const attempted: HashbrownRunInput[] = [];
  const hygiene = await openScenario(page, aimock, {
    scenario: 'tool',
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        captured,
        (input, requestIndex) =>
          requestIndex === 0 ||
          (requestIndex === 1 &&
            input.threadId === captured[0]?.threadId &&
            hasExactWeatherContinuation(input)),
        createToolContinuationEvents,
        75,
        attempted,
      ),
  });
  const driver = createAppDriver(page);

  await driver.send('What is the weather in Paris?');

  await expect(driver.userMessage()).toHaveText(
    'What is the weather in Paris?',
  );
  await driver.expectLoading();
  await expect(driver.reasoning()).toHaveText('I need the weather tool.');
  await expect(driver.reasoningDetailCount()).toHaveText('1');
  await expect(driver.reasoningHasOpaqueValue()).toHaveText('true');
  await expect(driver.toolCount()).toHaveText('1');
  await expect.poll(() => attempted.length).toBe(2);
  await expect.poll(() => captured.length).toBe(2);
  await expect(driver.assistant()).toHaveJSProperty(
    'textContent',
    'It is 21 C and sunny in Paris.',
  );
  await driver.expectIdle();
  await expect(driver.reasoning()).toHaveText('I need the weather tool.');
  await expect(driver.reasoningDetailCount()).toHaveText('1');
  await expect(driver.reasoningHasOpaqueValue()).toHaveText('true');
  await expect(driver.toolCount()).toHaveText('1');
  await expect(driver.error()).toHaveJSProperty('textContent', '');
  await expect(driver.sendingError()).toHaveJSProperty('textContent', '');
  await expect(driver.generatingError()).toHaveJSProperty('textContent', '');
  expect(captured.length).toBe(2);
  const [firstInput, secondInput] = captured;
  if (!firstInput || !secondInput) {
    throw new Error('Expected two captured tool continuation run inputs.');
  }
  expect(attempted.length).toBe(2);
  expect(secondInput.threadId).toBe(firstInput.threadId);
  expect(secondInput.runId).not.toBe(firstInput.runId);
  expect(secondInput.messages.map(({ role }) => role)).toEqual([
    'system',
    'user',
    'reasoning',
    'assistant',
    'tool',
  ]);
  const continuationAssistant = secondInput.messages.find(
    (message) => message.role === 'assistant',
  );
  if (!continuationAssistant || continuationAssistant.role !== 'assistant') {
    throw new Error('Expected an assistant in the continuation request.');
  }
  const continuationToolCall = continuationAssistant.toolCalls?.[0];
  if (!continuationToolCall) {
    throw new Error('Expected a tool call in the continuation request.');
  }
  expect(continuationAssistant.encryptedValue).toBe(
    'fixture-assistant-opaque-value',
  );
  expect(continuationToolCall.encryptedValue).toBe('fixture-tool-opaque-value');
  expect(continuationAssistant.metadata).toEqual({
    provider: { assistantSteps: [{ index: 0 }] },
  });
  expect(continuationToolCall.metadata).toEqual({
    provider: { toolSteps: [{ index: 1 }] },
  });
  expect(firstInput).toEqual({
    threadId: firstInput.threadId,
    runId: firstInput.runId,
    messages: createInitialMessages(firstInput.threadId),
    tools: [expectedWeatherTool],
    context: [],
    state: {},
    forwardedProps: {},
  });
  expect({
    ...secondInput,
    messages: safeTranscript(secondInput.messages),
  }).toEqual({
    threadId: firstInput.threadId,
    runId: secondInput.runId,
    messages: safeTranscript(createContinuationMessages(firstInput.threadId)),
    tools: [expectedWeatherTool],
    context: [],
    state: {},
    forwardedProps: {},
  });
  await hygiene.assertClean();
});
