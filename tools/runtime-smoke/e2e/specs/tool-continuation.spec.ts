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

type WeatherRound = {
  readonly assistantOpaqueValue: string;
  readonly callId: string;
  readonly city: string;
  readonly toolOpaqueValue: string;
};

const weatherRounds: readonly WeatherRound[] = [
  {
    assistantOpaqueValue: 'fixture-assistant-opaque-paris',
    callId: 'call-weather-paris',
    city: 'Paris',
    toolOpaqueValue: 'fixture-tool-opaque-paris',
  },
  {
    assistantOpaqueValue: 'fixture-assistant-opaque-london',
    callId: 'call-weather-london',
    city: 'London',
    toolOpaqueValue: 'fixture-tool-opaque-london',
  },
  {
    assistantOpaqueValue: 'fixture-assistant-opaque-tokyo',
    callId: 'call-weather-tokyo',
    city: 'Tokyo',
    toolOpaqueValue: 'fixture-tool-opaque-tokyo',
  },
];
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
      content: 'Get the weather for Paris, London, and Tokyo.',
    },
  ];
}

function createContinuationMessages(
  threadId: string,
  completedRoundCount: number,
): HashbrownRunInput['messages'] {
  const continuationMessages = weatherRounds
    .slice(0, completedRoundCount)
    .reduce<HashbrownRunInput['messages']>((messages, round, index) => {
      const assistantStep = index * 2;

      return [
        ...messages,
        {
          id: `${threadId}:message:${index * 2 + 1}`,
          role: 'assistant',
          content: '',
          encryptedValue: round.assistantOpaqueValue,
          metadata: {
            provider: { assistantSteps: [{ index: assistantStep }] },
          },
          toolCalls: [
            {
              id: round.callId,
              type: 'function',
              encryptedValue: round.toolOpaqueValue,
              metadata: {
                provider: { toolSteps: [{ index: assistantStep + 1 }] },
              },
              function: {
                name: 'getWeather',
                arguments: JSON.stringify({ city: round.city }),
              },
            },
          ],
        },
        {
          id: round.callId,
          role: 'tool',
          toolCallId: round.callId,
          content: JSON.stringify({
            city: round.city,
            temperatureC: 21,
            condition: 'sunny',
          }),
        },
      ];
    }, []);

  return [
    ...createInitialMessages(threadId),
    ...(completedRoundCount > 0
      ? [
          {
            id: 'reasoning-weather',
            role: 'reasoning' as const,
            content: 'I need the weather tools.',
            encryptedValue: 'fixture-reasoning-opaque-value',
            metadata: { provider: { trace: ['weather'] } },
          },
        ]
      : []),
    ...continuationMessages,
  ];
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
  if (requestIndex === weatherRounds.length) {
    return createTextRunEvents(
      input,
      'message-weather-final',
      ['All three cities are 21 C and sunny.'],
      1_700_000_006_000,
    );
  }

  const round = weatherRounds[requestIndex];
  if (!round) {
    throw new Error(`Unexpected matched request index: ${requestIndex}`);
  }
  const timestamp = 1_700_000_002_000 + requestIndex * 1_000;
  const assistantMessageId = `${input.threadId}:message:${requestIndex * 2 + 1}`;
  const assistantStep = requestIndex * 2;
  const reasoningEvents: AGUIEvent[] =
    requestIndex === 0
      ? [
          {
            type: EventType.REASONING_MESSAGE_START,
            messageId: 'reasoning-weather',
            role: 'reasoning',
            metadata: { provider: { trace: ['weather'] } },
            timestamp: timestamp + 1,
          },
          {
            type: EventType.REASONING_MESSAGE_CONTENT,
            messageId: 'reasoning-weather',
            delta: 'I need the weather tools.',
            timestamp: timestamp + 2,
          },
          {
            type: EventType.REASONING_ENCRYPTED_VALUE,
            subtype: 'message',
            entityId: 'reasoning-weather',
            encryptedValue: 'fixture-reasoning-opaque-value',
            timestamp: timestamp + 3,
          },
          {
            type: EventType.REASONING_MESSAGE_END,
            messageId: 'reasoning-weather',
            timestamp: timestamp + 4,
          },
        ]
      : [];

  return [
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
      timestamp,
    },
    ...reasoningEvents,
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: assistantMessageId,
      role: 'assistant',
      timestamp: timestamp + 5,
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: assistantMessageId,
      metadata: {
        provider: { assistantSteps: [{ index: assistantStep }] },
      },
      timestamp: timestamp + 6,
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: round.callId,
      toolCallName: 'getWeather',
      parentMessageId: assistantMessageId,
      timestamp: timestamp + 7,
    },
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message',
      entityId: assistantMessageId,
      encryptedValue: round.assistantOpaqueValue,
      timestamp: timestamp + 8,
    },
    {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'tool-call',
      entityId: round.callId,
      encryptedValue: round.toolOpaqueValue,
      timestamp: timestamp + 9,
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: round.callId,
      delta: JSON.stringify({ city: round.city }),
      timestamp: timestamp + 10,
    },
    {
      type: EventType.TOOL_CALL_END,
      toolCallId: round.callId,
      metadata: {
        provider: { toolSteps: [{ index: assistantStep + 1 }] },
      },
      timestamp: timestamp + 11,
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
      timestamp: timestamp + 12,
    },
  ];
}

test('executes three sequential tools once each before the terminal response', async ({
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
        (input, requestIndex) => {
          const firstThreadId = captured[0]?.threadId;

          return (
            requestIndex <= weatherRounds.length &&
            (requestIndex === 0 || input.threadId === firstThreadId) &&
            isDeepStrictEqual(
              input.messages,
              requestIndex === 0
                ? createInitialMessages(input.threadId)
                : createContinuationMessages(input.threadId, requestIndex),
            )
          );
        },
        createToolContinuationEvents,
        75,
        attempted,
      ),
  });
  const driver = createAppDriver(page);

  await driver.send('Get the weather for Paris, London, and Tokyo.');

  await expect(driver.userMessage()).toHaveText(
    'Get the weather for Paris, London, and Tokyo.',
  );
  await driver.expectLoading();
  await expect(driver.reasoning()).toHaveText('I need the weather tools.');
  await expect(driver.reasoningDetailCount()).toHaveText('1');
  await expect(driver.reasoningHasOpaqueValue()).toHaveText('true');
  await expect.poll(() => attempted.length).toBe(4);
  await expect.poll(() => captured.length).toBe(4);
  await expect(driver.assistant()).toHaveJSProperty(
    'textContent',
    'All three cities are 21 C and sunny.',
  );
  await driver.expectIdle();
  await expect(driver.reasoning()).toHaveText('I need the weather tools.');
  await expect(driver.reasoningDetailCount()).toHaveText('1');
  await expect(driver.reasoningHasOpaqueValue()).toHaveText('true');
  await expect(driver.toolCount()).toHaveText('3');
  await expect(driver.error()).toHaveJSProperty('textContent', '');
  await expect(driver.sendingError()).toHaveJSProperty('textContent', '');
  await expect(driver.generatingError()).toHaveJSProperty('textContent', '');
  expect(captured).toHaveLength(4);
  const [firstInput, , , fourthInput] = captured;
  if (!firstInput || !fourthInput) {
    throw new Error('Expected four captured tool continuation run inputs.');
  }
  expect(attempted).toHaveLength(4);
  expect(new Set(captured.map(({ threadId }) => threadId)).size).toBe(1);
  expect(new Set(captured.map(({ runId }) => runId)).size).toBe(4);
  expect(fourthInput.messages.map(({ role }) => role)).toEqual([
    'system',
    'user',
    'reasoning',
    'assistant',
    'tool',
    'assistant',
    'tool',
    'assistant',
    'tool',
  ]);
  const continuationAssistants = fourthInput.messages.filter(
    (message) => message.role === 'assistant',
  );
  if (continuationAssistants.length !== weatherRounds.length) {
    throw new Error('Expected every assistant tool call in the final request.');
  }
  const opaqueContinuations = continuationAssistants.map((assistant, index) => {
    const toolCall = assistant.toolCalls?.[0];
    if (!toolCall) {
      throw new Error(`Expected a tool call for assistant ${index + 1}.`);
    }

    return {
      assistantOpaqueValue: assistant.encryptedValue,
      assistantMetadata: assistant.metadata,
      toolOpaqueValue: toolCall.encryptedValue,
      toolMetadata: toolCall.metadata,
    };
  });
  expect(opaqueContinuations).toEqual(
    weatherRounds.map((round, index) => ({
      assistantOpaqueValue: round.assistantOpaqueValue,
      assistantMetadata: {
        provider: { assistantSteps: [{ index: index * 2 }] },
      },
      toolOpaqueValue: round.toolOpaqueValue,
      toolMetadata: {
        provider: { toolSteps: [{ index: index * 2 + 1 }] },
      },
    })),
  );
  const continuationReasoning = fourthInput.messages.find(
    (message) => message.role === 'reasoning',
  );
  if (!continuationReasoning || continuationReasoning.role !== 'reasoning') {
    throw new Error('Expected preserved reasoning in the final request.');
  }
  expect(continuationReasoning.encryptedValue).toBe(
    'fixture-reasoning-opaque-value',
  );
  expect(continuationReasoning.metadata).toEqual({
    provider: { trace: ['weather'] },
  });
  for (const [requestIndex, input] of captured.entries()) {
    expect({ ...input, messages: safeTranscript(input.messages) }).toEqual({
      threadId: firstInput.threadId,
      runId: input.runId,
      messages: safeTranscript(
        requestIndex === 0
          ? createInitialMessages(firstInput.threadId)
          : createContinuationMessages(firstInput.threadId, requestIndex),
      ),
      tools: [expectedWeatherTool],
      context: [],
      state: {},
      forwardedProps: {},
    });
  }

  await hygiene.assertClean();
  expect(attempted).toHaveLength(4);
});
