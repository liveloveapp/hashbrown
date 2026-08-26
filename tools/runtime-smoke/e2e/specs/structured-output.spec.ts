import { createAppDriver } from '../harness/app-driver';
import {
  createTextRunEvents,
  type HashbrownRunInput,
  registerRunFixture,
} from '../harness/agui';
import { openScenario } from '../harness/browser';
import { expect, test } from '../harness/test-fixture';

const answerResponseSchema = {
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

test('streams structured output progressively', async ({ page, aimock }) => {
  const captured: HashbrownRunInput[] = [];
  const delay = 1_000;
  const hygiene = await openScenario(page, aimock, {
    scenario: 'structured',
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        captured,
        () => true,
        (input) =>
          createTextRunEvents(input, 'structured-answer', [
            '{"count":2,"answer":"det',
            'ermin',
            'istic"}',
          ]),
        delay,
      ),
  });
  const driver = createAppDriver(page);

  await driver.send('Count the results');

  await expect(driver.userMessage()).toHaveJSProperty(
    'textContent',
    'Count the results',
  );
  await driver.expectLoading();
  await expect(driver.structuredAnswer()).toHaveJSProperty('textContent', '');
  await expect(driver.structuredAnswer()).toHaveJSProperty(
    'textContent',
    'det',
  );
  await expect(driver.structuredAnswer()).toHaveJSProperty(
    'textContent',
    'deterministic',
  );
  await expect(driver.structuredCount()).toHaveJSProperty('textContent', '2');
  await driver.expectIdle();
  await expect(driver.error()).toHaveJSProperty('textContent', '');
  await expect(driver.sendingError()).toHaveJSProperty('textContent', '');
  await expect(driver.generatingError()).toHaveJSProperty('textContent', '');
  expect(captured).toHaveLength(1);
  const [input] = captured;
  if (!input) {
    throw new Error('Expected one captured structured run input.');
  }
  expect(input.hashbrown).toEqual({
    responseSchema: answerResponseSchema,
  });
  expect(
    input.messages.map(({ role, content }) => ({ role, content })),
  ).toEqual([
    { role: 'system', content: 'Runtime smoke system prompt.' },
    { role: 'user', content: 'Count the results' },
  ]);
  expect(input).not.toHaveProperty('responseSchema');
  hygiene.assertClean();
});
