import { expect, type Page, test } from '@playwright/test';
import { createAppDriver } from '../../harness/app-driver';
import { withRoutedEndpoint } from '../harness/routed-endpoint';
import { durableEffects, withDurableCluster } from '../harness/browser-fixture';

async function openRecovery(page: Page, runUrl: string, scenario = 'plain') {
  await page.goto(
    `/?${new URLSearchParams({ scenario, runUrl, recoveryUrl: new URL(runUrl).origin, fixturePrincipal: 'alice', retries: '0' })}`,
  );
}

test('reload restores fresh pending ownership and resumes the exact original native request explicitly', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDurableCluster(provider, async (cluster) => {
    const fixture = await cluster.start();
    await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
      const driver = createAppDriver(page);
      await openRecovery(page, endpoint.url);
      await driver.send('Hello fixture');
      await expect(page.getByTestId('interrupt-count')).toHaveText('2');
      const originalBatch = await page
        .getByTestId('interrupt-batch-id')
        .textContent();
      const original = JSON.parse(endpoint.requests[0]);

      await page.reload();
      await page.getByTestId('refresh-recovery').click();

      await expect(page.getByTestId('recovery-status')).toHaveText('Pending');
      await expect(page.getByTestId('interrupt-count')).toHaveText('2');
      await expect(page.getByTestId('interrupt-batch-id')).not.toHaveText(
        originalBatch ?? '',
      );
      expect(fixture.requests).toHaveLength(0);
      expect(await durableEffects(fixture)).toBe(0);
      await page.getByTestId('resume').click();
      await expect(driver.assistant()).toHaveText('Hello from .NET');
      await driver.expectIdle();
      const resumed = JSON.parse(endpoint.requests[1]);
      expect(resumed.messages).toEqual(original.messages);
      expect(resumed.tools).toEqual(original.tools);
      expect(resumed.forwardedProps).toEqual(original.forwardedProps);
      expect(
        resumed.messages.filter(
          (message: { role: string }) => message.role === 'system',
        ),
      ).toHaveLength(1);
      expect(fixture.requests).toHaveLength(1);
      expect(await durableEffects(fixture)).toBe(1);
    });
  });
});

test('unknown recovery dispositions fail closed before enabling decisions', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDurableCluster(provider, async (cluster) => {
    const fixture = await cluster.start();
    await withRoutedEndpoint(`${fixture.url}/run`, async (endpoint) => {
      await openRecovery(page, endpoint.url);
      await createAppDriver(page).send('Hello fixture');
      await expect(page.getByTestId('interrupt-count')).toHaveText('2');
      let patch: Record<string, unknown> = {};
      await page.route('**/threads/*/recovery', async (route) => {
        const response = await route.fetch();
        const envelope = await response.json();
        await route.fulfill({ response, json: { ...envelope, ...patch } });
      });

      for (const mutation of [
        { disposition: 'FutureState' },
        { schemaVersion: 2 },
        { disposition: 'Reconciled', reconciliationOutcome: 'FutureOutcome' },
      ]) {
        patch = mutation;
        await page.reload();
        await page.getByTestId('refresh-recovery').click();

        await expect(page.getByTestId('recovery-status')).toHaveText(
          'Unsupported recovery envelope',
        );
        await expect(page.getByTestId('send')).toBeDisabled();
        await expect(page.getByTestId('resume')).toBeDisabled();
        await expect(page.getByTestId('decline')).toBeDisabled();
        await expect(page.getByTestId('cancel')).toBeDisabled();
        await expect(page.getByTestId('interrupt-count')).toHaveText('0');
        expect(fixture.requests).toHaveLength(0);
        expect(await durableEffects(fixture)).toBe(0);
      }
    });
  });
});
