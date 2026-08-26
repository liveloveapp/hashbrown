import { s, ɵcreateUiKit } from '@hashbrownai/core';
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
}

function observePostRequests(page: Page): ObservedPostRequest[] {
  const requests: ObservedPostRequest[] = [];

  page.on('request', (request) => {
    if (request.method() === 'POST') {
      requests.push({ method: request.method(), url: request.url() });
    }
  });

  return requests;
}

function messageHistory(input: HashbrownRunInput) {
  return input.messages.map(({ role, content }) => ({ role, content }));
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
    { method: 'POST', url: aimock.aguiRunUrl },
    { method: 'POST', url: aimock.aguiRunUrl },
  ]);
  expect(inputs).toHaveLength(2);
  expect(attemptedInputs).toHaveLength(2);
  const [firstInput, secondInput] = inputs;
  if (!firstInput || !secondInput) {
    throw new Error('Expected two captured plain run inputs.');
  }
  expect(secondInput.threadId).toBe(firstInput.threadId);
  expect(secondInput.runId).not.toBe(firstInput.runId);
  expect(messageHistory(firstInput)).toEqual([
    { role: 'system', content: 'Runtime smoke system prompt.' },
    { role: 'user', content: 'First contract prompt' },
  ]);
  expect(messageHistory(secondInput)).toEqual([
    { role: 'system', content: 'Runtime smoke system prompt.' },
    { role: 'user', content: 'First contract prompt' },
    { role: 'assistant', content: 'First deterministic response.' },
    { role: 'user', content: 'Second contract prompt' },
  ]);
  for (const input of inputs) {
    expect(input.forwardedProps).toEqual({});
    expect(input).not.toHaveProperty('model');
    expect(input).not.toHaveProperty('hashbrown');
  }
  hygiene.assertClean();
});

test('sends the exact structured AG-UI request contract', async ({
  page,
  aimock,
}) => {
  const expectedStructuredJsonSchema = s.toJsonSchema(
    s.object('Runtime smoke answer', {
      answer: s.streaming.string('Answer text'),
      count: s.number('Result count'),
    }),
  );
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
  expect(posts).toEqual([{ method: 'POST', url: aimock.aguiRunUrl }]);
  expect(inputs).toHaveLength(1);
  expect(attemptedInputs).toHaveLength(1);
  const [input] = inputs;
  if (!input) {
    throw new Error('Expected one captured structured run input.');
  }
  expect(messageHistory(input)).toEqual([
    { role: 'system', content: 'Runtime smoke system prompt.' },
    { role: 'user', content: 'Return structured contract' },
  ]);
  expect(input.forwardedProps).toEqual({});
  expect(input).not.toHaveProperty('model');
  expect(input.hashbrown).toEqual({
    responseSchema: expectedStructuredJsonSchema,
  });
  expect(input).not.toHaveProperty('responseSchema');
  hygiene.assertClean();
});

test('sends the exact generative UI AG-UI request contract', async ({
  page,
  aimock,
}) => {
  const expectedUiSchema = s.toJsonSchema(
    ɵcreateUiKit({
      components: [
        {
          component: {},
          name: 'status',
          description: 'Display a runtime status.',
          props: {
            title: s.streaming.string('Status title'),
            count: s.number('Status count'),
          },
          children: false,
        },
      ],
    }).schema,
  );
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
  expect(posts).toEqual([{ method: 'POST', url: aimock.aguiRunUrl }]);
  expect(inputs).toHaveLength(1);
  expect(attemptedInputs).toHaveLength(1);
  const [input] = inputs;
  if (!input) {
    throw new Error('Expected one captured generative UI run input.');
  }
  expect(messageHistory(input)).toEqual([
    { role: 'system', content: 'Runtime smoke system prompt.' },
    { role: 'user', content: 'Render contract status' },
  ]);
  expect(input.forwardedProps).toEqual({});
  expect(input).not.toHaveProperty('model');
  expect(input.hashbrown).toEqual({
    ui: true,
    responseSchema: expectedUiSchema,
  });
  expect(input).not.toHaveProperty('responseSchema');
  expect(input).not.toHaveProperty('ui');
  hygiene.assertClean();
});
