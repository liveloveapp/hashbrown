import { createAppDriver } from '../harness/app-driver';
import {
  createTextRunEvents,
  type HashbrownRunInput,
  registerRunFixture,
} from '../harness/agui';
import { openScenario } from '../harness/browser';
import { expect, test } from '../harness/test-fixture';

const statusResponseSchema = {
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

test('streams trusted generative UI progressively', async ({
  page,
  aimock,
}) => {
  const captured: HashbrownRunInput[] = [];
  const delay = 1_000;
  const hygiene = await openScenario(page, aimock, {
    scenario: 'ui',
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        captured,
        () => true,
        (input) =>
          createTextRunEvents(input, 'ui-answer', [
            '{"ui":[{"status":{"props":{"title":"Re',
            'ady","count":2}}}]}',
          ]),
        delay,
      ),
  });
  const driver = createAppDriver(page);

  await driver.send('Show status');

  await expect(driver.userMessage()).toHaveJSProperty(
    'textContent',
    'Show status',
  );
  await driver.expectLoading();
  await expect(driver.statusCard()).toHaveCount(0);
  await expect(driver.statusCard()).toHaveJSProperty('textContent', 'Re');
  await expect(driver.statusCard()).toHaveJSProperty('textContent', 'Ready: 2');
  await driver.expectIdle();
  await expect(driver.error()).toHaveJSProperty('textContent', '');
  await expect(driver.sendingError()).toHaveJSProperty('textContent', '');
  await expect(driver.generatingError()).toHaveJSProperty('textContent', '');
  expect(captured).toHaveLength(1);
  const [input] = captured;
  if (!input) {
    throw new Error('Expected one captured generative UI run input.');
  }
  expect(input.hashbrown?.ui).toBe(true);
  expect(input.hashbrown?.responseSchema).toEqual(statusResponseSchema);
  expect(input).not.toHaveProperty('responseSchema');
  expect(
    input.messages.map(({ role, content }) => ({ role, content })),
  ).toEqual([
    { role: 'system', content: 'Runtime smoke system prompt.' },
    { role: 'user', content: 'Show status' },
  ]);
  hygiene.assertClean();
});
