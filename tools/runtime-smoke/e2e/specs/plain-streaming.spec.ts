import { createAppDriver } from '../harness/app-driver';
import {
  createTextRunEvents,
  type HashbrownRunInput,
  registerRunFixture,
} from '../harness/agui';
import { openScenario } from '../harness/browser';
import { expect, test } from '../harness/test-fixture';

test('streams a plain text response progressively', async ({
  page,
  aimock,
}) => {
  const captured: HashbrownRunInput[] = [];
  const delay = 1_000;
  const hygiene = await openScenario(page, aimock, {
    scenario: 'plain',
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        captured,
        () => true,
        (input) =>
          createTextRunEvents(input, 'plain-answer', ['Hello ', 'world']),
        delay,
      ),
  });
  const driver = createAppDriver(page);

  await driver.send('Say hello');

  await expect(driver.userMessage()).toHaveJSProperty(
    'textContent',
    'Say hello',
  );
  await driver.expectLoading();
  await expect(driver.assistant()).toHaveJSProperty('textContent', '');
  await expect(driver.assistant()).toHaveJSProperty('textContent', 'Hello ');
  await expect(driver.assistant()).toHaveJSProperty(
    'textContent',
    'Hello world',
  );
  await driver.expectIdle();
  await expect(driver.error()).toHaveJSProperty('textContent', '');
  await expect(driver.sendingError()).toHaveJSProperty('textContent', '');
  await expect(driver.generatingError()).toHaveJSProperty('textContent', '');
  expect(captured).toHaveLength(1);
  hygiene.assertClean();
});
