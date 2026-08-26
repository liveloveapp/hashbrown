import { createAppDriver } from '../harness/app-driver';
import {
  createTextRunEvents,
  type HashbrownRunInput,
  registerRunFixture,
} from '../harness/agui';
import { openScenario } from '../harness/browser';
import { expect, test } from '../harness/test-fixture';

const cancellationFailureReason = 'net::ERR_ABORTED';

function lastMessageContent(input: HashbrownRunInput): unknown {
  return input.messages.at(-1)?.content;
}

test('cancels a partial response and recovers on an explicit send', async ({
  page,
  aimock,
}) => {
  const captured: HashbrownRunInput[] = [];
  const attempted: HashbrownRunInput[] = [];
  const hygiene = await openScenario(page, aimock, {
    scenario: 'plain',
    hygiene: {
      requestFailureAllowances: [
        {
          reason: 'the user stopped the active aimock run',
          matches: (request) =>
            request.method() === 'POST' &&
            request.url() === aimock.aguiRunUrl &&
            request.failure()?.errorText === cancellationFailureReason,
        },
      ],
    },
    register: () =>
      registerRunFixture(
        aimock.aguiMock,
        captured,
        (input, requestIndex) =>
          (requestIndex === 0 && lastMessageContent(input) === 'Cancel') ||
          (requestIndex === 1 && lastMessageContent(input) === 'Recover'),
        (input, requestIndex) => {
          if (requestIndex === 0) {
            return createTextRunEvents(input, 'cancelled-answer', [
              'Accepted',
              ' late',
            ]);
          }

          if (requestIndex === 1) {
            return createTextRunEvents(input, 'recovered-answer', [
              'Recovered.',
            ]);
          }

          throw new Error(`Unexpected matched request index: ${requestIndex}`);
        },
        1_000,
        attempted,
      ),
  });
  const driver = createAppDriver(page);

  await driver.send('Cancel');
  await expect(driver.assistant()).toHaveJSProperty('textContent', 'Accepted');

  await driver.stop();

  await driver.expectIdle();
  await expect.poll(() => attempted.length).toBe(1);
  expect(captured).toHaveLength(1);
  await expect(driver.assistant()).not.toContainText('late');
  hygiene.assertClean();

  await driver.send('Recover');

  await expect.poll(() => attempted.length).toBe(2);
  await expect.poll(() => captured.length).toBe(2);
  await expect(driver.assistant()).toHaveJSProperty(
    'textContent',
    'Recovered.',
  );
  await driver.expectIdle();
  await expect(driver.error()).toHaveJSProperty('textContent', '');
  await expect(driver.sendingError()).toHaveJSProperty('textContent', '');
  await expect(driver.generatingError()).toHaveJSProperty('textContent', '');
  expect(attempted).toHaveLength(2);
  expect(captured).toHaveLength(2);
  const [firstInput, secondInput] = captured;
  if (!firstInput || !secondInput) {
    throw new Error('Expected two captured cancellation run inputs.');
  }
  expect(secondInput.threadId).toBe(firstInput.threadId);
  expect(secondInput.runId).not.toBe(firstInput.runId);
  hygiene.assertClean();
});
