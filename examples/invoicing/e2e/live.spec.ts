import { expect, test } from '@playwright/test';
import type { LedgerSnapshot } from '@invoicing/contracts';

test('seeded ledger supports questions, repeated approvals, cancellation and session isolation', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  const snapshot = async (): Promise<LedgerSnapshot> =>
    page.evaluate(async () => (await fetch('/api/snapshot')).json());
  const baseline = await snapshot();
  expect(baseline.payments.length).toBeGreaterThan(100);
  expect(baseline.invoices.length).toBeGreaterThan(100);
  expect(baseline.allocations.length).toBeGreaterThan(100);
  const message = page.getByRole('textbox', {
    name: 'Message assistant',
    exact: true,
  });
  await expect(message).toBeEnabled();

  await message.fill(
    'How many incoming payments still need matching, and what is the unapplied total?',
  );
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Ledger conversation' }),
  ).toContainText('13,900');
  await expect(message).toBeEnabled();
  await page
    .getByRole('button', {
      name: 'Review payment-northstar-exact',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Match payment', exact: true })
    .click();
  await expect(message).toBeDisabled();
  await page
    .getByRole('button', { name: 'Approve and apply', exact: true })
    .last()
    .click();
  await expect(
    page.getByText('Allocation applied.', { exact: true }),
  ).toHaveCount(1);
  await expect(message).toBeEnabled();

  const applied = await snapshot();
  expect(applied.allocations).toHaveLength(baseline.allocations.length + 1);
  expect(
    applied.payments.find((p) => p.id === 'payment-northstar-exact')
      ?.unappliedCents,
  ).toBe(0);
  await page
    .getByRole('button', { name: 'Review payment-cedar-partial', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Match payment', exact: true })
    .click();
  await expect(
    page.getByRole('region', {
      name: 'Payment review chat',
      exact: true,
      includeHidden: true,
    }),
  ).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Decline', exact: true }).last(),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Decline', exact: true })
    .last()
    .click();
  await page.locator('summary').filter({ hasText: 'Review cancelled' }).click();
  await expect(
    page.getByText('Review cancelled. No allocation was requested.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(message).toBeEnabled();
  expect((await snapshot()).allocations).toHaveLength(
    baseline.allocations.length + 1,
  );

  await page
    .getByRole('button', { name: 'Match payment', exact: true })
    .click();
  await expect(
    page.getByRole('region', {
      name: 'Payment review chat',
      exact: true,
      includeHidden: true,
    }),
  ).toHaveCount(3);
  await expect(
    page.getByRole('button', { name: 'Approve and apply', exact: true }).last(),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Approve and apply', exact: true })
    .last()
    .click();
  await expect(
    page.getByText('Allocation applied.', { exact: true }),
  ).toHaveCount(2);
  await expect(message).toBeEnabled();
  const final = await snapshot();
  expect(final.allocations).toHaveLength(baseline.allocations.length + 2);
  expect(
    final.payments.find((p) => p.id === 'payment-cedar-partial')
      ?.unappliedCents,
  ).toBe(0);
  expect(
    final.invoices.find((i) => i.id === 'invoice-cedar-partial')
      ?.outstandingCents,
  ).toBe(300000);
  const previousAnswers = await page.locator('.assistant-answer').count();
  await message.fill('How many payments still have unapplied cash?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect
    .poll(() => page.locator('.assistant-answer').count())
    .toBeGreaterThan(previousAnswers);
  await expect(message).toBeEnabled();
  await expect(page.locator('.assistant-answer').last()).toContainText(
    /\b(?:3|three)\b/i,
  );
  await page.screenshot({
    path: 'test-results/examples/invoicing-live/seeded-application.png',
    fullPage: true,
  });

  const other = await browser.newContext();
  try {
    const isolated = await other.request.get(
      'http://127.0.0.1:4326/api/snapshot',
    );
    expect(
      ((await isolated.json()) as LedgerSnapshot).allocations,
    ).toHaveLength(baseline.allocations.length);
    const operation = final.activities.at(-1)?.operationId;
    expect(operation).toBeTruthy();
    expect(
      (
        await other.request.get(
          `http://127.0.0.1:4326/api/operations/${operation}`,
        )
      ).status(),
    ).toBe(404);
  } finally {
    await other.close();
  }
});
