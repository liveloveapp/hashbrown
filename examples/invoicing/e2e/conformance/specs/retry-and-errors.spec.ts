import { type AGUIEvent, EventType } from '@ag-ui/core';
import type { Route } from '@playwright/test';
import { createAppDriver } from '../harness/app-driver';
import {
  createRunErrorEvents,
  createTextRunEvents,
  type HashbrownRunInput,
  registerRunFixture,
} from '../harness/agui';
import { openScenario } from '../harness/browser';
import { expect, test } from '../harness/test-fixture';

const transportFailureBody = 'Intentional transport failure';
const runFailureMessage = 'Deterministic run failure';

function lastMessageContent(input: HashbrownRunInput): unknown {
  return input.messages.at(-1)?.content;
}

function createMissingTerminalEvents(input: HashbrownRunInput): AGUIEvent[] {
  const messageId = 'rejected-structured-answer';

  return [
    {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
      timestamp: 1_700_000_004_000,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      timestamp: 1_700_000_004_001,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: '{"answer":"Rejected attempt","count":0}',
      timestamp: 1_700_000_004_002,
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      timestamp: 1_700_000_004_003,
    },
  ];
}

test('retries structured output when the first stream has no terminal', async ({
  page,
  aimock,
}) => {
  const captured: HashbrownRunInput[] = [];
  const attempted: HashbrownRunInput[] = [];
  const hygiene = await openScenario(page, aimock, {
    scenario: 'structured',
    retries: 1,
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        captured,
        (input, requestIndex) =>
          requestIndex < 2 &&
          lastMessageContent(input) === 'Retry missing terminal',
        (input, requestIndex) => {
          if (requestIndex === 0) {
            return createMissingTerminalEvents(input);
          }

          if (requestIndex === 1) {
            return createTextRunEvents(input, 'retry-structured-answer', [
              '{"answer":"Retry succeeded.","count":1}',
            ]);
          }

          throw new Error(`Unexpected matched request index: ${requestIndex}`);
        },
        50,
        attempted,
      ),
  });
  const driver = createAppDriver(page);

  await driver.send('Retry missing terminal');

  await expect.poll(() => attempted.length).toBe(2);
  await expect.poll(() => captured.length).toBe(2);
  await expect(driver.structuredAnswer()).toHaveJSProperty(
    'textContent',
    'Retry succeeded.',
  );
  await expect(driver.structuredCount()).toHaveJSProperty('textContent', '1');
  await expect(page.getByText('Rejected attempt', { exact: true })).toHaveCount(
    0,
  );
  await driver.expectIdle();
  await expect(driver.error()).toHaveJSProperty('textContent', '');
  await expect(driver.sendingError()).toHaveJSProperty('textContent', '');
  await expect(driver.generatingError()).toHaveJSProperty('textContent', '');
  expect(attempted).toHaveLength(2);
  expect(captured).toHaveLength(2);
  const [firstInput, secondInput] = captured;
  if (!firstInput || !secondInput) {
    throw new Error('Expected two captured structured retry run inputs.');
  }
  expect(secondInput.threadId).toBe(firstInput.threadId);
  expect(secondInput.runId).not.toBe(firstInput.runId);
  await hygiene.assertClean();
});

test('recovers from an HTTP send failure after an explicit send', async ({
  page,
  aimock,
}) => {
  const captured: HashbrownRunInput[] = [];
  const attempted: HashbrownRunInput[] = [];
  let interceptedRequests = 0;
  let observedRunPosts = 0;
  const hygiene = await openScenario(page, aimock, {
    scenario: 'plain',
    hygiene: {
      httpErrorAllowances: [
        {
          reason: transportFailureBody,
          matches: (response) =>
            response.status() === 503 &&
            response.request().method() === 'POST' &&
            response.url() === aimock.aguiRunUrl,
        },
      ],
      consoleErrorAllowances: [
        {
          reason: 'Chromium reports the intentional 503 response',
          matches: (message) =>
            message.type() === 'error' &&
            message.text() ===
              'Failed to load resource: the server responded with a status of 503 (Service Unavailable)' &&
            message.location().url === aimock.aguiRunUrl,
        },
      ],
    },
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        captured,
        (input, requestIndex) =>
          requestIndex === 0 &&
          lastMessageContent(input) === 'Recover transport',
        (input) =>
          createTextRunEvents(input, 'transport-recovery-answer', [
            'Transport recovered.',
          ]),
        50,
        attempted,
      ),
  });
  const driver = createAppDriver(page);
  const routeHandler = async (route: Route) => {
    const request = route.request();
    if (request.method() === 'POST' && interceptedRequests === 0) {
      interceptedRequests += 1;
      await route.fulfill({
        status: 503,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: transportFailureBody,
      });
      return;
    }

    await route.fallback();
  };
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url() === aimock.aguiRunUrl) {
      observedRunPosts += 1;
    }
  });
  await page.route(aimock.aguiRunUrl, routeHandler);
  let routeInstalled = true;

  try {
    await driver.send('Fail transport');

    await expect(driver.sendingError()).toContainText(transportFailureBody);
    await expect(driver.error()).toContainText(transportFailureBody);
    await expect(driver.generatingError()).toHaveJSProperty('textContent', '');
    await driver.expectIdle();
    await expect.poll(() => observedRunPosts).toBe(1);
    expect(interceptedRequests).toBe(1);
    expect(attempted).toHaveLength(0);
    expect(captured).toHaveLength(0);
    await hygiene.assertClean();

    await page.unroute(aimock.aguiRunUrl, routeHandler);
    routeInstalled = false;
    await driver.send('Recover transport');

    await expect.poll(() => observedRunPosts).toBe(2);
    await expect.poll(() => attempted.length).toBe(1);
    await expect.poll(() => captured.length).toBe(1);
    await expect(driver.assistant()).toHaveJSProperty(
      'textContent',
      'Transport recovered.',
    );
    await driver.expectIdle();
    await expect(driver.error()).toHaveJSProperty('textContent', '');
    await expect(driver.sendingError()).toHaveJSProperty('textContent', '');
    await expect(driver.generatingError()).toHaveJSProperty('textContent', '');
    expect(interceptedRequests).toBe(1);
    expect(observedRunPosts).toBe(2);
    expect(attempted).toHaveLength(1);
    expect(captured).toHaveLength(1);
    await hygiene.assertClean();
  } finally {
    if (routeInstalled) {
      await page.unroute(aimock.aguiRunUrl, routeHandler);
    }
  }
});

test('recovers from a server run error after an explicit send', async ({
  page,
  aimock,
}) => {
  const captured: HashbrownRunInput[] = [];
  const attempted: HashbrownRunInput[] = [];
  const hygiene = await openScenario(page, aimock, {
    scenario: 'plain',
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        captured,
        (input, requestIndex) =>
          (requestIndex === 0 &&
            lastMessageContent(input) === 'Fail the run') ||
          (requestIndex === 1 &&
            lastMessageContent(input) === 'Recover the run'),
        (input, requestIndex) => {
          if (requestIndex === 0) {
            return createRunErrorEvents(input, runFailureMessage);
          }

          if (requestIndex === 1) {
            return createTextRunEvents(input, 'run-recovery-answer', [
              'Run recovered.',
            ]);
          }

          throw new Error(`Unexpected matched request index: ${requestIndex}`);
        },
        50,
        attempted,
      ),
  });
  const driver = createAppDriver(page);

  await driver.send('Fail the run');

  await expect(driver.generatingError()).toHaveJSProperty(
    'textContent',
    runFailureMessage,
  );
  await expect(driver.error()).toHaveJSProperty(
    'textContent',
    runFailureMessage,
  );
  await expect(driver.sendingError()).toHaveJSProperty('textContent', '');
  await driver.expectIdle();
  await expect.poll(() => attempted.length).toBe(1);
  expect(captured).toHaveLength(1);

  await driver.send('Recover the run');

  await expect.poll(() => attempted.length).toBe(2);
  await expect.poll(() => captured.length).toBe(2);
  await expect(driver.assistant()).toHaveJSProperty(
    'textContent',
    'Run recovered.',
  );
  await driver.expectIdle();
  await expect(driver.error()).toHaveJSProperty('textContent', '');
  await expect(driver.sendingError()).toHaveJSProperty('textContent', '');
  await expect(driver.generatingError()).toHaveJSProperty('textContent', '');
  expect(attempted).toHaveLength(2);
  expect(captured).toHaveLength(2);
  const [firstInput, secondInput] = captured;
  if (!firstInput || !secondInput) {
    throw new Error('Expected two captured run-error recovery inputs.');
  }
  expect(secondInput.threadId).toBe(firstInput.threadId);
  expect(secondInput.runId).not.toBe(firstInput.runId);
  await hygiene.assertClean();
});
