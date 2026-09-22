import { type AGUIEvent, EventType } from '@ag-ui/core';
import { expect, test } from '@playwright/test';
import { createAppDriver } from '../harness/app-driver';
import { installBrowserHygiene } from '../harness/browser';
import { createEventGate } from '../harness/event-gate';
import { startIndependentEndpoint } from '../harness/independent-endpoint';

for (const scenario of ['plain', 'structured', 'ui'] as const) {
  test(`gated ${scenario} renders before completion`, async ({ page }) => {
    const gate = createEventGate();
    const chunks =
      scenario === 'plain'
        ? ['Re', 'ad', 'y']
        : scenario === 'structured'
          ? ['{"count":2,"answer":"Re', 'ad', 'y"}']
          : [
              '{"ui":[{"status":{"props":{"title":"Re',
              'ad',
              'y","count":2}}}]}',
            ];
    const endpoint = await startIndependentEndpoint({
      extended: scenario !== 'plain',
      beforeEvent: gate.wait,
      events: (input): AGUIEvent[] => [
        {
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'progressive',
          role: 'assistant',
        },
        ...chunks.map((delta) => ({
          type: EventType.TEXT_MESSAGE_CONTENT as const,
          messageId: 'progressive',
          delta,
        })),
        { type: EventType.TEXT_MESSAGE_END, messageId: 'progressive' },
        {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
        },
      ],
    });
    const hygiene = installBrowserHygiene(page, {}, (request) => {
      if (
        request.method() !== 'POST' ||
        request.url() !== endpoint.url ||
        request.failure()?.errorText !== 'net::ERR_ABORTED'
      )
        return false;
      const input = request.postDataJSON() as { runId?: unknown };
      return (
        typeof input.runId === 'string' &&
        endpoint.consumeTerminalRun(input.runId)
      );
    });
    const driver = createAppDriver(page);
    const output =
      scenario === 'plain'
        ? driver.assistant()
        : scenario === 'structured'
          ? driver.structuredAnswer()
          : driver.statusCard();

    try {
      await page.goto(
        `/?${new URLSearchParams({ scenario, runUrl: endpoint.url, retries: '0' })}`,
      );
      await expect(page.getByTestId('fixture-ready')).toBeVisible();
      gate.releaseThrough(2);

      await driver.send('Show status');

      await expect(output).toHaveText('Re');
      await driver.expectLoading();
      const partialNode =
        scenario === 'ui' ? await output.elementHandle() : null;
      gate.releaseThrough(3);
      await expect(output).toHaveText('Read');
      await driver.expectLoading();
      if (partialNode) {
        expect(
          await output.evaluate(
            (node, original) => node === original,
            partialNode,
          ),
        ).toBe(true);
        await partialNode.dispose();
      }
      gate.releaseThrough(4);
      await expect(output).toHaveText(scenario === 'ui' ? 'Ready: 2' : 'Ready');
      await driver.expectLoading();
      if (scenario === 'structured')
        await expect(driver.structuredCount()).toHaveText('2');
      gate.releaseThrough(6);
      await driver.expectIdle();
      await expect(output).toHaveText(scenario === 'ui' ? 'Ready: 2' : 'Ready');
      await expect(driver.error()).toBeEmpty();
      await expect(driver.sendingError()).toBeEmpty();
      await expect(driver.generatingError()).toBeEmpty();
      expect(endpoint.inputs).toHaveLength(1);
      await hygiene.assertClean();
    } finally {
      await endpoint.stop();
    }
  });
}
