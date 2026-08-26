import type { Page } from '@playwright/test';
import { createAppDriver } from '../harness/app-driver';
import {
  createTextRunEvents,
  type HashbrownRunInput,
  registerRunFixture,
} from '../harness/agui';
import { openScenario } from '../harness/browser';
import { expect, test } from '../harness/test-fixture';

interface ObservedPostRequest {
  readonly method: string;
  readonly url: string;
  readonly accept: string | undefined;
  readonly contentType: string | undefined;
}

const expectedStructuredJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    count: { type: 'number', description: 'Result count' },
    answer: { type: 'string', description: 'Answer text' },
  },
  required: ['count', 'answer'],
  additionalProperties: false,
  description: 'Runtime smoke answer',
};

const expectedUiSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    ui: {
      type: 'array',
      items: {
        anyOf: [
          {
            type: 'object',
            properties: {
              status: {
                type: 'object',
                properties: {
                  props: {
                    type: 'object',
                    properties: {
                      count: {
                        type: 'number',
                        description: 'Status count',
                      },
                      title: {
                        type: 'string',
                        description: 'Status title',
                      },
                    },
                    required: ['count', 'title'],
                    additionalProperties: false,
                    description: 'Component Props',
                  },
                },
                required: ['props'],
                additionalProperties: false,
                description: 'status node',
              },
            },
            required: ['status'],
            additionalProperties: false,
            description: 'Display a runtime status.',
          },
        ],
      },
      description: 'List of elements',
    },
  },
  required: ['ui'],
  additionalProperties: false,
  description:
    'Return a JSON object with a single key "ui" that matches the schema below. Use only these components.',
};

function observePostRequests(page: Page): ObservedPostRequest[] {
  const requests: ObservedPostRequest[] = [];

  page.on('request', (request) => {
    if (request.method() === 'POST') {
      const headers = request.headers();
      requests.push({
        method: request.method(),
        url: request.url(),
        accept: headers['accept'],
        contentType: headers['content-type'],
      });
    }
  });

  return requests;
}

test('sends the exact plain AG-UI request contract across explicit sends', async ({
  page,
  aimock,
}) => {
  const inputs: HashbrownRunInput[] = [];
  const attemptedInputs: HashbrownRunInput[] = [];
  const hygiene = await openScenario(page, aimock, {
    scenario: 'plain',
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        inputs,
        () => true,
        (input, requestIndex) =>
          createTextRunEvents(input, `plain-request-contract-${requestIndex}`, [
            requestIndex === 0
              ? 'First deterministic response.'
              : 'Second deterministic response.',
          ]),
        undefined,
        attemptedInputs,
      ),
  });
  const posts = observePostRequests(page);
  const driver = createAppDriver(page);

  await driver.send('First contract prompt');

  await expect(driver.assistant()).toHaveJSProperty(
    'textContent',
    'First deterministic response.',
  );
  await driver.expectIdle();

  await driver.send('Second contract prompt');

  await expect(driver.assistant()).toHaveJSProperty(
    'textContent',
    'Second deterministic response.',
  );
  await driver.expectIdle();
  await expect(driver.error()).toHaveJSProperty('textContent', '');
  await expect(driver.sendingError()).toHaveJSProperty('textContent', '');
  await expect(driver.generatingError()).toHaveJSProperty('textContent', '');
  expect(posts).toEqual([
    {
      method: 'POST',
      url: aimock.aguiRunUrl,
      accept: 'text/event-stream',
      contentType: 'application/json',
    },
    {
      method: 'POST',
      url: aimock.aguiRunUrl,
      accept: 'text/event-stream',
      contentType: 'application/json',
    },
  ]);
  expect(inputs).toHaveLength(2);
  expect(attemptedInputs).toHaveLength(2);
  const [firstInput, secondInput] = inputs;
  if (!firstInput || !secondInput) {
    throw new Error('Expected two captured plain run inputs.');
  }
  expect(secondInput.threadId).toBe(firstInput.threadId);
  expect(secondInput.runId).not.toBe(firstInput.runId);
  expect(firstInput).toEqual({
    threadId: firstInput.threadId,
    runId: firstInput.runId,
    messages: [
      {
        id: `${firstInput.threadId}:system`,
        role: 'system',
        content: 'Runtime smoke system prompt.',
      },
      {
        id: `${firstInput.threadId}:message:0`,
        role: 'user',
        content: 'First contract prompt',
      },
    ],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  });
  expect(secondInput).toEqual({
    threadId: firstInput.threadId,
    runId: secondInput.runId,
    messages: [
      {
        id: `${firstInput.threadId}:system`,
        role: 'system',
        content: 'Runtime smoke system prompt.',
      },
      {
        id: `${firstInput.threadId}:message:0`,
        role: 'user',
        content: 'First contract prompt',
      },
      {
        id: `${firstInput.threadId}:message:1`,
        role: 'assistant',
        content: 'First deterministic response.',
        toolCalls: [],
      },
      {
        id: `${firstInput.threadId}:message:2`,
        role: 'user',
        content: 'Second contract prompt',
      },
    ],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  });
  hygiene.assertClean();
});

test('sends the exact structured AG-UI request contract', async ({
  page,
  aimock,
}) => {
  const inputs: HashbrownRunInput[] = [];
  const attemptedInputs: HashbrownRunInput[] = [];
  const hygiene = await openScenario(page, aimock, {
    scenario: 'structured',
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        inputs,
        () => true,
        (input) =>
          createTextRunEvents(input, 'structured-request-contract', [
            '{"answer":"Structured contract response.","count":3}',
          ]),
        undefined,
        attemptedInputs,
      ),
  });
  const posts = observePostRequests(page);
  const driver = createAppDriver(page);

  await driver.send('Return structured contract');

  await expect(driver.structuredAnswer()).toHaveJSProperty(
    'textContent',
    'Structured contract response.',
  );
  await expect(driver.structuredCount()).toHaveJSProperty('textContent', '3');
  await driver.expectIdle();
  await expect(driver.error()).toHaveJSProperty('textContent', '');
  await expect(driver.sendingError()).toHaveJSProperty('textContent', '');
  await expect(driver.generatingError()).toHaveJSProperty('textContent', '');
  expect(posts).toEqual([
    {
      method: 'POST',
      url: aimock.aguiRunUrl,
      accept: 'text/event-stream',
      contentType: 'application/json',
    },
  ]);
  expect(inputs).toHaveLength(1);
  expect(attemptedInputs).toHaveLength(1);
  const [input] = inputs;
  if (!input) {
    throw new Error('Expected one captured structured run input.');
  }
  expect(input).toEqual({
    threadId: input.threadId,
    runId: input.runId,
    messages: [
      {
        id: `${input.threadId}:system`,
        role: 'system',
        content: 'Runtime smoke system prompt.',
      },
      {
        id: `${input.threadId}:message:0`,
        role: 'user',
        content: 'Return structured contract',
      },
    ],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
    hashbrown: { responseSchema: expectedStructuredJsonSchema },
  });
  hygiene.assertClean();
});

test('sends the exact generative UI AG-UI request contract', async ({
  page,
  aimock,
}) => {
  const inputs: HashbrownRunInput[] = [];
  const attemptedInputs: HashbrownRunInput[] = [];
  const hygiene = await openScenario(page, aimock, {
    scenario: 'ui',
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        inputs,
        () => true,
        (input) =>
          createTextRunEvents(input, 'ui-request-contract', [
            '{"ui":[{"status":{"props":{"title":"Contract ready","count":4}}}]}',
          ]),
        undefined,
        attemptedInputs,
      ),
  });
  const posts = observePostRequests(page);
  const driver = createAppDriver(page);

  await driver.send('Render contract status');

  await expect(driver.statusCard()).toHaveJSProperty(
    'textContent',
    'Contract ready: 4',
  );
  await driver.expectIdle();
  await expect(driver.error()).toHaveJSProperty('textContent', '');
  await expect(driver.sendingError()).toHaveJSProperty('textContent', '');
  await expect(driver.generatingError()).toHaveJSProperty('textContent', '');
  expect(posts).toEqual([
    {
      method: 'POST',
      url: aimock.aguiRunUrl,
      accept: 'text/event-stream',
      contentType: 'application/json',
    },
  ]);
  expect(inputs).toHaveLength(1);
  expect(attemptedInputs).toHaveLength(1);
  const [input] = inputs;
  if (!input) {
    throw new Error('Expected one captured generative UI run input.');
  }
  expect(input).toEqual({
    threadId: input.threadId,
    runId: input.runId,
    messages: [
      {
        id: `${input.threadId}:system`,
        role: 'system',
        content: 'Runtime smoke system prompt.',
      },
      {
        id: `${input.threadId}:message:0`,
        role: 'user',
        content: 'Render contract status',
      },
    ],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
    hashbrown: { ui: true, responseSchema: expectedUiSchema },
  });
  hygiene.assertClean();
});
