import { type AGUIEvent, EventType } from '@ag-ui/core';
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

function hasWeatherContinuation(input: HashbrownRunInput): boolean {
  const hasToolCall = input.messages.some(
    (message) =>
      message.role === 'assistant' &&
      message.toolCalls?.some(
        (toolCall) =>
          toolCall.id === 'call-weather' &&
          toolCall.function.name === 'getWeather' &&
          toolCall.function.arguments === '{"city":"Paris"}',
      ),
  );
  const hasToolResult = input.messages.some(
    (message) =>
      message.role === 'tool' &&
      message.toolCallId === 'call-weather' &&
      message.content === serializedWeatherResult,
  );

  return hasToolCall && hasToolResult;
}

function createToolContinuationEvents(
  input: HashbrownRunInput,
  requestIndex: number,
): AGUIEvent[] {
  if (requestIndex === 1) {
    return createTextRunEvents(
      input,
      'message-weather-final',
      ['It is 21 C and sunny in Paris.'],
      1_700_000_003_000,
    );
  }

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

test('executes a tool once and automatically continues the run', async ({
  page,
  aimock,
}) => {
  const captured: HashbrownRunInput[] = [];
  const hygiene = await openScenario(page, aimock, {
    scenario: 'tool',
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        captured,
        (input, requestIndex) =>
          requestIndex === 0 ||
          (requestIndex === 1 && hasWeatherContinuation(input)),
        createToolContinuationEvents,
        75,
      ),
  });
  const driver = createAppDriver(page);

  await driver.send('What is the weather in Paris?');

  await expect(driver.userMessage()).toHaveText(
    'What is the weather in Paris?',
  );
  await driver.expectLoading();
  await expect(driver.toolCount()).toHaveText('1');
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
  expect(secondInput.threadId).toBe(firstInput.threadId);
  expect(secondInput.runId).not.toBe(firstInput.runId);
  const toolResults = secondInput.messages.filter(
    (message) => message.role === 'tool',
  );
  expect(toolResults).toEqual([
    {
      id: 'call-weather',
      role: 'tool',
      toolCallId: 'call-weather',
      content: serializedWeatherResult,
    },
  ]);
  expect(JSON.parse(toolResults[0]?.content ?? '')).toEqual(weatherResult);
  hygiene.assertClean();
});
