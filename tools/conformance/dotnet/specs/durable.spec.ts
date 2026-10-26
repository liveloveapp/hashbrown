import { expect, test } from '@playwright/test';
import { createAppDriver } from '../../harness/app-driver';
import { withRoutedEndpoint } from '../harness/routed-endpoint';
import {
  control,
  durableEffects,
  waitForStage,
  withDurableCluster,
} from '../harness/durable-fixture';

test('a live browser resumes its durable batch on another instance after restart', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDurableCluster(provider, async (cluster) => {
    const first = await cluster.start();
    await withRoutedEndpoint(`${first.url}/run`, async (endpoint) => {
      const driver = createAppDriver(page);
      await page.goto(
        `/?${new URLSearchParams({ scenario: 'plain', runUrl: endpoint.url, retries: '0' })}`,
      );
      await driver.send('Hello fixture');
      await expect(page.getByTestId('interrupt-count')).toHaveText('2');
      const batchId = await page
        .getByTestId('interrupt-batch-id')
        .textContent();
      await first.stop();
      const second = await cluster.start({ CheckpointCode: 'FORGED' });
      endpoint.routeTo(`${second.url}/run`);
      await expect(page.getByTestId('interrupt-batch-id')).toHaveText(
        batchId ?? '',
      );

      await page.getByTestId('resume').click();

      await expect(driver.assistant()).toHaveText('Hello from .NET');
      await driver.expectIdle();
      await expect(driver.error()).toBeEmpty();
      await expect(page.getByTestId('interrupt-count')).toHaveText('0');
      expect(batchId).toBeTruthy();
      expect(first.requests).toHaveLength(0);
      expect(second.requests).toHaveLength(1);
      expect(await durableEffects(second)).toBe(1);
      expect(
        await (await fetch(`${second.url}/__test/counters`)).json(),
      ).toMatchObject({
        durableProtectedCode: 'PDX',
      });
    });
  });
});

test('a competing instance cannot claim the live browser resume with its identical run ID', async ({
  page,
}, testInfo) => {
  const provider = testInfo.project.metadata['provider'] as 'openai' | 'azure';
  await withDurableCluster(provider, async (cluster) => {
    const first = await cluster.start({ Workflow: 'confirm-before' });
    const second = await cluster.start();
    await withRoutedEndpoint(`${first.url}/run`, async (endpoint) => {
      const driver = createAppDriver(page);
      await page.goto(
        `/?${new URLSearchParams({ scenario: 'plain', runUrl: endpoint.url, retries: '0' })}`,
      );
      await driver.send('Hello fixture');
      await expect(page.getByTestId('interrupt-count')).toHaveText('2');
      const batchId = await page
        .getByTestId('interrupt-batch-id')
        .textContent();

      await page.getByTestId('resume').click();
      await waitForStage(first, 'before');
      const competing = await fetch(`${second.url}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: endpoint.requests[1],
      });

      expect(competing.status).toBe(409);
      await expect(page.getByTestId('is-resuming')).toHaveText('true');
      await expect(page.getByTestId('interrupt-batch-id')).toHaveText(
        batchId ?? '',
      );
      await expect(page.getByTestId('interrupt-count')).toHaveText('2');
      expect(second.requests).toHaveLength(0);
      expect(await durableEffects(second)).toBe(0);
      await control(first, 'release-checkpoint');
      await expect(driver.assistant()).toHaveText('Hello from .NET');
      await driver.expectIdle();
      await expect(driver.error()).toBeEmpty();
      await expect(page.getByTestId('interrupt-count')).toHaveText('0');
      expect(first.requests).toHaveLength(1);
      expect(second.requests).toHaveLength(0);
      expect(await durableEffects(second)).toBe(1);
    });
  });
});
