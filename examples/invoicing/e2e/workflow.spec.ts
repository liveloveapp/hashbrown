import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { LedgerSnapshot } from '@invoicing/contracts';

async function snapshot(page: Page): Promise<LedgerSnapshot> {
  return page.evaluate(async () => (await fetch('/api/snapshot')).json());
}

async function openPayments(page: Page) {
  await page.getByRole('button', { name: 'Payments', exact: true }).click();
  await page.getByRole('heading', { name: 'Payments', level: 1 }).waitFor();
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
  await openPayments(page);

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
  await openPayments(page);

  await page
    .getByRole('button', { name: 'Review payment-summit-advance', exact: true })
    .click();

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
  await openPayments(page);
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
        JSON.stringify(request.state.selectedInvoiceIds) ===
          JSON.stringify(['invoice-northstar-exact']),
    ),
  ).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Approve and apply', exact: true }),
  ).toHaveCount(0);
  expect(await snapshot(page)).toEqual(baseline);
});

test('lost approval response holds further work until the committed operation is reconciled', async ({
  page,
}) => {
  let resumeRequests = 0;
  let blockResult = true;
  let operationReads = 0;
  await page.route('**/agui/**', async (route) => {
    const input = route.request().postDataJSON();
    const response = await route.fetch({
      headers: {
        ...route.request().headers(),
        'x-invoicing-fixture': 'approval',
      },
    });
    expect(response.status()).toBe(200);
    if (input.resume?.length) {
      resumeRequests++;
      await route.abort('connectionreset');
    } else await route.fulfill({ response });
  });
  await page.route('**/api/operations/*', async (route) => {
    operationReads++;
    if (blockResult)
      await route.fulfill({
        status: 503,
        json: { error: 'test_result_unavailable' },
      });
    else await route.continue();
  });
  await page.goto('/');
  const baseline = await snapshot(page);
  await openPayments(page);
  await page
    .getByRole('button', {
      name: 'Review payment-northstar-exact',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Match payment', exact: true })
    .click();

  await page
    .getByRole('button', { name: 'Approve and apply', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Check allocation result', exact: true }),
  ).toBeVisible();
  const committed = await snapshot(page);
  expect(committed.allocations).toHaveLength(baseline.allocations.length + 1);
  expect(committed.activities).toHaveLength(baseline.activities.length + 1);
  await expect(
    page.getByText('Allocation applied.', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: 'Message assistant', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Review payment-cedar-partial', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Match payment', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Payment review chat', exact: true }),
  ).toHaveCount(1);
  blockResult = false;
  await page
    .getByRole('button', { name: 'Check allocation result', exact: true })
    .click();

  await page.locator('summary').filter({ hasText: 'Review applied' }).click();
  await expect(
    page.getByText('Allocation applied.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Message assistant', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Ledger totals', exact: true }),
  ).toContainText('$11,500');
  expect(resumeRequests).toBe(1);
  expect(operationReads).toBeGreaterThanOrEqual(2);
  expect(await snapshot(page)).toEqual(committed);
  expect(
    committed.payments.find(
      (payment) => payment.id === 'payment-northstar-exact',
    )?.unappliedCents,
  ).toBe(0);
  expect(
    committed.invoices.find(
      (invoice) => invoice.id === 'invoice-northstar-exact',
    )?.outstandingCents,
  ).toBe(0);
  await expect(
    page.getByRole('button', { name: 'Approve and apply', exact: true }),
  ).toBeDisabled();
});

test('selecting a client focuses the band, and arrow keys move the focus', async ({
  page,
}) => {
  await page.goto('/');
  const band = page.getByRole('region', { name: 'Focus', exact: true });
  const portfolioHeight = (await band.boundingBox())?.height;

  await page
    .getByRole('treegrid', { name: 'Clients' })
    .getByText('Thistle Retail')
    .click();

  await expect(
    band.getByRole('heading', { name: 'Thistle Retail' }),
  ).toBeVisible();
  const strip = page.getByRole('region', {
    name: 'Ledger totals',
    exact: true,
  });
  await expect(strip).toContainText('£14,000');
  await expect(strip).toContainText('£8,000');
  await expect(
    page.getByRole('button', { name: 'USD', exact: true }),
  ).toBeDisabled();
  await expect(page).toHaveURL(/[?&]client=thistle\b/);
  expect((await band.boundingBox())?.height).toBe(portfolioHeight);

  await page.keyboard.press('ArrowDown');

  await expect(
    band.getByRole('heading', { name: 'Thistle Retail' }),
  ).toHaveCount(0);
  expect((await band.boundingBox())?.height).toBe(portfolioHeight);

  await page.keyboard.press('Escape');

  await expect(
    band.getByRole('heading', { name: 'All USD clients' }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/client=/);
});

test('a recorded assistant answer replays as validated generative UI', async ({
  page,
}) => {
  await page.goto('/');

  await page
    .getByRole('textbox', { name: 'Message assistant', exact: true })
    .fill('Which USD customers are more than 60 days overdue?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  const answer = page.locator('.assistant-answer').last();
  await expect(answer).toBeVisible();
  // Pretable grids keep their own always-present `role="status"` live region,
  // so check the busy text itself rather than the role count.
  await expect(page.getByText('Reading your ledger…')).toHaveCount(0);
  // LedgerTable rows: Pretable renders a real grid, not an HTML table, so a
  // body row is `[data-pretable-row]` with `role="row"` (the header row also
  // has `role="row"` but no `data-pretable-row`).
  await expect(answer.locator('[data-pretable-row]').first()).toBeVisible();
  // AgingSummary buckets: each bar is `[data-bucket]`; the recorded answer is
  // about customers over 60 days late, so the 61-90 or over-90 bucket bar
  // must be present.
  await expect(
    answer
      .locator('[data-bucket="days61to90"], [data-bucket="over90"]')
      .first(),
  ).toBeVisible();
  // CustomerCard: the recorded answer is about Granite Mutual.
  await expect(
    answer.getByRole('heading', { name: 'Granite Mutual' }),
  ).toBeVisible();
});
