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
      id: `${threadId}:message:1`,
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call-weather',
          type: 'function',
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
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call-weather',
        toolCallName: 'getWeather',
        parentMessageId: `${input.threadId}:message:1`,
        timestamp: 1_700_000_002_001,
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'call-weather',
        delta: '{"city":"Paris"}',
        timestamp: 1_700_000_002_002,
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: 'call-weather',
        timestamp: 1_700_000_002_003,
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
        timestamp: 1_700_000_002_004,
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
  await expect(driver.toolCount()).toHaveText('1');
  await expect.poll(() => attempted.length).toBe(2);
  await expect.poll(() => captured.length).toBe(2);
  await expect(driver.assistant()).toHaveJSProperty(
    'textContent',
    'It is 21 C and sunny in Paris.',
  );
  await driver.expectIdle();
  await expect(driver.toolCount()).toHaveText('1');
  await expect(driver.error()).toHaveJSProperty('textContent', '');
  await expect(driver.sendingError()).toHaveJSProperty('textContent', '');
  await expect(driver.generatingError()).toHaveJSProperty('textContent', '');
  expect(captured).toHaveLength(2);
  const [firstInput, secondInput] = captured;
  if (!firstInput || !secondInput) {
    throw new Error('Expected two captured tool continuation run inputs.');
  }
  expect(attempted).toHaveLength(2);
  expect(secondInput.threadId).toBe(firstInput.threadId);
  expect(secondInput.runId).not.toBe(firstInput.runId);
  expect(firstInput).toEqual({
    threadId: firstInput.threadId,
    runId: firstInput.runId,
    messages: createInitialMessages(firstInput.threadId),
    tools: [expectedWeatherTool],
    context: [],
    state: {},
    forwardedProps: {},
  });
  expect(secondInput).toEqual({
    threadId: firstInput.threadId,
    runId: secondInput.runId,
    messages: createContinuationMessages(firstInput.threadId),
    tools: [expectedWeatherTool],
    context: [],
    state: {},
    forwardedProps: {},
  });
  await hygiene.assertClean();
});
