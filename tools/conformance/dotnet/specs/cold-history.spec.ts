import { expect, test } from '@playwright/test';
import { createAppDriver } from '../../harness/app-driver';
import { durableEffects, withDurableCluster } from '../harness/durable-fixture';
import { withRoutedEndpoint } from '../harness/routed-endpoint';

/** Reads captured native wire evidence without inventing missing requests. */
function lastRequest(requests: readonly string[]) {
  const body = requests.at(-1);
  if (!body) throw new Error('Expected a captured native request');
  return JSON.parse(body);
}

const cancellation =
  '[Hashbrown runtime: The user cancelled this request before completion. Do not continue it unless the user asks again.]';

for (const scenario of ['structured', 'ui'] as const) {
  test(`cold ${scenario} history preserves cancellation as inert diagnostics through pending and completed recovery`, async ({
    page,
  }, info) => {
    await withDurableCluster(
      info.project.metadata['provider'] as 'openai' | 'azure',
      async (cluster) => {
        const cancelling = await cluster.start({ Workflow: '' });
        cancelling.mock.onMessage(
          'Cancel fixture',
          { content: 'Never completed' },
          { latency: 1000, chunkSize: 1 },
        );
        const fixture = await cluster.start();
        const answer =
          scenario === 'structured'
            ? { answer: 'Trusted continuation', count: 7 }
            : {
                ui: [
                  {
                    status: {
                      props: { title: 'Trusted continuation', count: 7 },
                    },
                  },
                ],
              };
        fixture.mock.onMessage('Continue fixture', {
          content: JSON.stringify(answer),
        });
        await withRoutedEndpoint(`${cancelling.url}/run`, async (endpoint) => {
          await page.goto(
            `/?${new URLSearchParams({ scenario, runUrl: endpoint.url, recoveryUrl: new URL(endpoint.url).origin, fixturePrincipal: 'alice', retries: '0' })}`,
          );
          const driver = createAppDriver(page);
          await driver.send('Cancel fixture');
          await expect.poll(() => cancelling.requests.length).toBe(1);
          await driver.stop();
          await driver.expectIdle();
          await expect.poll(cancelling.upstreamAborted).toBe(true);
          endpoint.routeTo(`${fixture.url}/run`);
          await driver.send('Continue fixture');
          await expect(page.getByTestId('interrupt-count')).toHaveText('2');
          const original = lastRequest(endpoint.requests);
          const marker = original.messages.find(
            (message: { content?: string }) => message.content === cancellation,
          );
          expect(marker).toBeDefined();
          expect(marker.metadata).toBeUndefined();
          const before = endpoint.requests.length;

          await page.reload();
          await page.getByTestId('refresh-recovery').click();

          await expect(page.getByTestId('recovery-status')).toHaveText(
            'Pending',
          );
          await expect(page.getByTestId('recovery-diagnostic')).toHaveText(
            cancellation,
          );
          await expect(page.getByTestId('recovery-diagnostic')).toHaveAttribute(
            'data-message-id',
            marker.id,
          );
          await expect(page.getByTestId('structured-answer')).toBeEmpty();
          await expect(page.getByTestId('status-card')).toHaveCount(0);
          await expect(page.getByTestId('tool-count')).toHaveText('0');
          expect(endpoint.requests).toHaveLength(before);
          expect(fixture.requests).toHaveLength(0);
          expect(await durableEffects(fixture)).toBe(0);
          await page.getByTestId('resume').click();
          if (scenario === 'structured') {
            await expect(page.getByTestId('structured-answer')).toHaveText(
              'Trusted continuation',
            );
            await expect(page.getByTestId('structured-count')).toHaveText('7');
          } else {
            await expect(page.getByTestId('status-card')).toHaveText(
              'Trusted continuation: 7',
            );
            await expect(page.getByTestId('status-action-count')).toHaveText(
              '0',
            );
          }
          await driver.expectIdle();
          const resumed = lastRequest(endpoint.requests);
          expect(resumed.messages).toEqual(original.messages);
          expect(resumed.tools).toEqual(original.tools);
          expect(resumed.forwardedProps).toEqual(original.forwardedProps);
          expect(fixture.requests).toHaveLength(1);
          expect(await durableEffects(fixture)).toBe(1);

          await page.reload();
          await page.getByTestId('refresh-recovery').click();

          await expect(page.getByTestId('recovery-status')).toHaveText(
            'Completed',
          );
          await expect(page.getByTestId('recovery-diagnostic')).toHaveText(
            cancellation,
          );
          await expect(page.getByTestId('interrupt-count')).toHaveText('0');
          await expect(page.getByTestId('tool-count')).toHaveText('0');
          if (scenario === 'structured') {
            await expect(page.getByTestId('structured-answer')).toHaveText(
              'Trusted continuation',
            );
          } else {
            await expect(page.getByTestId('status-card')).toHaveText(
              'Trusted continuation: 7',
            );
            await expect(page.getByTestId('status-action-count')).toHaveText(
              '0',
            );
          }
          expect(endpoint.requests).toHaveLength(before + 1);
          expect(fixture.requests).toHaveLength(1);
          expect(await durableEffects(fixture)).toBe(1);
        });
      },
    );
  });
}

test('native historical assistant HTML remains escaped text after completed structured recovery', async ({
  page,
}, info) => {
  const historical =
    '<img data-testid="historical-payload" src="x" onerror="globalThis.historicalExecuted=true"><script>globalThis.historicalExecuted=true</script>';
  await withDurableCluster(
    info.project.metadata['provider'] as 'openai' | 'azure',
    async (cluster) => {
      const fixture = await cluster.start();
      fixture.mock.onMessage('Historical fixture', { content: historical });
      await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
        await page.goto(
          `/?${new URLSearchParams({ scenario: 'structured', runUrl: endpoint.url, recoveryUrl: new URL(endpoint.url).origin, fixturePrincipal: 'alice', retries: '0' })}`,
        );
        const driver = createAppDriver(page);
        await driver.send('Historical fixture');
        await expect(page.getByTestId('interrupt-count')).toHaveText('2');
        await page.getByTestId('resume').click();
        await expect(driver.error()).not.toBeEmpty();
        await driver.expectIdle();

        await page.reload();
        await page.getByTestId('refresh-recovery').click();

        await expect(page.getByTestId('recovery-status')).toHaveText(
          'Completed',
        );
        await expect(page.getByTestId('recovery-diagnostic')).toHaveText(
          historical,
        );
        await expect(page.getByTestId('recovery-diagnostic')).toHaveAttribute(
          'data-kind',
          'unstructured-assistant-history',
        );
        await expect(page.getByTestId('historical-payload')).toHaveCount(0);
        expect(
          await page.evaluate(() =>
            Reflect.get(globalThis, 'historicalExecuted'),
          ),
        ).toBeUndefined();
        await expect(page.getByTestId('structured-answer')).toBeEmpty();
        await expect(page.getByTestId('interrupt-count')).toHaveText('0');
        await expect(page.getByTestId('tool-count')).toHaveText('0');
        expect(endpoint.requests).toHaveLength(2);
        expect(fixture.requests).toHaveLength(1);
        expect(await durableEffects(fixture)).toBe(1);
      });
    },
  );
});
