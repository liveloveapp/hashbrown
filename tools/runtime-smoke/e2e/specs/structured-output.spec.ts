import { createAppDriver } from '../harness/app-driver';
import {
  createTextRunEvents,
  type HashbrownRunInput,
  registerRunFixture,
} from '../harness/agui';
import { openScenario } from '../harness/browser';
import { expect, test } from '../harness/test-fixture';

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
  expect(input.hashbrown?.responseSchema).toEqual(expect.any(Object));
  expect(input.hashbrown).not.toHaveProperty('ui');
  expect(input).not.toHaveProperty('responseSchema');
  hygiene.assertClean();
});
