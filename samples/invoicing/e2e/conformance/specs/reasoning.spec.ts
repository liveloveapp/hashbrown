import { createAppDriver } from '../harness/app-driver';
import {
  createReasoningTextRunEvents,
  type HashbrownRunInput,
  registerRunFixture,
} from '../harness/agui';
import { openScenario } from '../harness/browser';
import { expect, test } from '../harness/test-fixture';

test.use({ trace: 'off' });

test('shows streamed reasoning and persists safe reasoning probes', async ({
  page,
  aimock,
}) => {
  const captured: HashbrownRunInput[] = [];
  const hygiene = await openScenario(page, aimock, {
    scenario: 'plain',
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        captured,
        () => true,
        (input) =>
          createReasoningTextRunEvents(
            input,
            {
              messageId: 'reasoning-plain',
              content: 'I considered the greeting.',
              encryptedValue: 'fixture-opaque-value',
              metadata: { provider: { trace: ['plain'] } },
            },
            'assistant-plain',
            ['Hello from reasoning.'],
            1_700_000_004_000,
          ),
        150,
      ),
  });
  const driver = createAppDriver(page);

  await driver.send('Say hello with reasoning');

  await driver.expectLoading();
  await expect(driver.reasoning()).toHaveText('I considered the greeting.');
  await expect(driver.reasoningDetailCount()).toHaveText('1');
  await expect(driver.reasoningHasOpaqueValue()).toHaveText('true');
  await driver.expectIdle();
  await expect(driver.assistant()).toHaveText('Hello from reasoning.');
  await expect(driver.reasoning()).toHaveText('I considered the greeting.');
  await expect(driver.reasoningDetailCount()).toHaveText('1');
  await expect(driver.reasoningHasOpaqueValue()).toHaveText('true');
  expect(captured.length).toBe(1);
  await hygiene.assertClean();
});
