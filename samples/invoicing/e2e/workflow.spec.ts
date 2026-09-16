import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { LedgerSnapshot } from '@invoicing/contracts';

async function snapshot(page: Page): Promise<LedgerSnapshot> {
  return page.evaluate(async () => (await fetch('/api/snapshot')).json());
}

test('ambiguous and combined payments require an explicit invoice choice', async ({
  page,
}) => {
  const agentRequests: unknown[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/agui/'))
      agentRequests.push(request.postDataJSON());
  });
  await page.goto('/');
  const baseline = await snapshot(page);

  await page
    .getByRole('button', {
      name: 'Review payment-atlas-ambiguous',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', { name: 'Match payment', exact: true }),
  ).toBeDisabled();
  await page.getByRole('combobox').selectOption('invoice-atlas-discovery');
  await expect(
    page.getByRole('button', { name: 'Match payment', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', {
      name: 'Review payment-harbor-combined',
      exact: true,
    })
    .click();

  await expect(page.getByRole('combobox')).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Match payment', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('combobox').locator('option')).toHaveCount(3);
  expect(agentRequests).toEqual([]);
  expect(await snapshot(page)).toEqual(baseline);
});

test('advance payment cannot start a review without an outstanding invoice', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/agui/')) requests.push(request.url());
  });
  await page.goto('/');
  const baseline = await snapshot(page);

  await page
    .getByRole('button', { name: 'Review payment-summit-advance', exact: true })
    .click();
  await page.getByRole('button', { name: 'Payments', exact: true }).click();

  await expect(
    page.getByRole('button', { name: 'Match payment', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('textbox', { name: 'Message assistant', exact: true }),
  ).toBeEnabled();
  expect(requests).toEqual([]);
  expect(await snapshot(page)).toEqual(baseline);
});

test('failed review releases chat and retries with a fresh thread without changing the ledger', async ({
  page,
}) => {
  const requests: { threadId: string; state: Record<string, unknown> }[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/agui/')) requests.push(request.postDataJSON());
  });
  await page.goto('/');
  const baseline = await snapshot(page);
  await page
    .getByRole('button', {
      name: 'Review payment-northstar-exact',
      exact: true,
    })
    .click();

  await page
    .getByRole('button', { name: 'Match payment', exact: true })
    .click();
  await expect(
    page.getByText(
      'No allocation proposal was completed. You can start another review.',
      { exact: true },
    ),
  ).toHaveCount(1);
  await expect(
    page.getByRole('textbox', { name: 'Message assistant', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Match payment', exact: true })
    .click();
  await expect(
    page.getByText(
      'No allocation proposal was completed. You can start another review.',
      { exact: true },
    ),
  ).toHaveCount(2);

  await expect(
    page.getByRole('textbox', { name: 'Message assistant', exact: true }),
  ).toBeEnabled();
  expect(new Set(requests.map((request) => request.threadId)).size).toBe(2);
  expect(
    requests.every(
      (request) =>
        request.state.selectedPaymentId === 'payment-northstar-exact' &&
        request.state.selectedInvoiceId === 'invoice-northstar-exact',
    ),
  ).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Approve and apply', exact: true }),
  ).toHaveCount(0);
  expect(await snapshot(page)).toEqual(baseline);
});
