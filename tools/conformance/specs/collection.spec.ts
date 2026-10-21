import { type AGUIEvent, EventType } from '@ag-ui/core';
import type { Page } from '@playwright/test';
import { createAppDriver } from '../harness/app-driver';
import {
  createTextRunEvents,
  type HashbrownRunInput,
  registerRunFixture,
} from '../harness/agui';
import { openScenario } from '../harness/browser';
import { expect, test } from '../harness/test-fixture';

const collectPath = '/growth/collect/';
const toolPrompt = 'Get the weather for Paris.';
const toolResponse = 'Paris is 21 C and sunny.';

/**
 * Records every request whose URL targets a growth collection endpoint, from
 * any page or worker of the browser context.
 */
function recordCollectRequests(page: Page): string[] {
  const urls: string[] = [];
  page.context().on('request', (request) => {
    if (request.url().includes(collectPath)) urls.push(request.url());
  });
  return urls;
}

/** Reads the growth keys a development build would keep in local storage. */
function growthStorageKeys(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Object.keys(localStorage).filter((key) =>
      key.startsWith('hashbrown.growth'),
    ),
  );
}

/** One weather tool call, then a terminal text answer on the continuation. */
function createWeatherEvents(
  input: HashbrownRunInput,
  requestIndex: number,
): AGUIEvent[] {
  if (requestIndex > 0) {
    return createTextRunEvents(input, 'message-weather-final', [toolResponse]);
  }
  const timestamp = 1_700_000_002_000;
  const messageId = `${input.threadId}:message:1`;

  return [
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
      timestamp,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      timestamp: timestamp + 1,
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      timestamp: timestamp + 2,
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-weather-paris',
      toolCallName: 'getWeather',
      parentMessageId: messageId,
      timestamp: timestamp + 3,
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-weather-paris',
      delta: JSON.stringify({ city: 'Paris' }),
      timestamp: timestamp + 4,
    },
    {
      type: EventType.TOOL_CALL_END,
      toolCallId: 'call-weather-paris',
      timestamp: timestamp + 5,
    },
    {
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
      timestamp: timestamp + 6,
    },
  ];
}

test('production hosts send no collection requests and keep no growth storage', async ({
  page,
  aimock,
}) => {
  // Turn the automated-browser gate off so only the production-build gate
  // can keep the collector inert.
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'webdriver', { get: () => false }),
  );
  const collectRequests = recordCollectRequests(page);
  const toolInputs: HashbrownRunInput[] = [];
  const uiInputs: HashbrownRunInput[] = [];
  const driver = createAppDriver(page);

  const toolHygiene = await openScenario(page, aimock, {
    scenario: 'tool',
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        toolInputs,
        (_input, requestIndex) => requestIndex <= 1,
        createWeatherEvents,
      ),
  });
  await driver.send(toolPrompt);
  await expect(driver.assistant()).toHaveJSProperty(
    'textContent',
    toolResponse,
  );
  await driver.expectIdle();
  await expect(driver.toolCount()).toHaveText('1');
  const toolKeys = await growthStorageKeys(page);
  const webdriver = await page.evaluate(() => navigator.webdriver);
  await toolHygiene.assertClean();

  const uiHygiene = await openScenario(page, aimock, {
    scenario: 'ui',
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        uiInputs,
        () => true,
        (input) =>
          createTextRunEvents(input, 'ui-answer', [
            '{"ui":[{"status":{"props":{"title":"Ready","count":2}}}]}',
          ]),
      ),
  });
  await driver.send('Show status');
  await expect(driver.statusCard()).toHaveJSProperty('textContent', 'Ready: 2');
  await driver.expectIdle();
  const uiKeys = await growthStorageKeys(page);
  await uiHygiene.assertClean();

  expect(webdriver).toBe(false);
  expect(toolInputs).toHaveLength(2);
  expect(uiInputs).toHaveLength(1);
  expect(collectRequests).toEqual([]);
  expect(toolKeys).toEqual([]);
  expect(uiKeys).toEqual([]);
});
