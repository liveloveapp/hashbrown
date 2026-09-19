import type { Ledger, MoneyRecord } from '@invoicing/contracts';
import { expect, test } from 'vitest';
import { getSnapshot } from './ledger';
import { createSampleLedger, sampleScenarios } from './sample-ledger';
import {
  aging,
  customerStatement,
  findRecords,
  ledgerSummary,
  monthlyTotals,
  unappliedPayments,
} from './assistant-queries';

const snapshot = getSnapshot(createSampleLedger());
/** Roughly 3K tokens; the whole point of query-shaped tools. */
const BUDGET = 12000;
const size = (value: unknown) => JSON.stringify(value).length;

/** A one-customer USD ledger with the given invoices and no payments. */
function fixture(
  invoices: readonly Pick<MoneyRecord, 'id' | 'date' | 'amountCents'>[],
) {
  const ledger: Ledger = {
    customers: [
      { id: 'solo', name: 'Solo Co', currency: 'USD', profile: 'on-time' },
    ],
    invoices: invoices.map((i) => ({
      ...i,
      customerId: 'solo',
      currency: 'USD',
      version: 1,
    })),
    payments: [],
    allocations: [],
    activities: [],
  };
  return getSnapshot(ledger);
}

test('ledgerSummary is small and names every customer and currency', () => {
  const result = ledgerSummary(snapshot);

  expect(result.asOf).toBe('2026-09-15');
  expect(result.currencies.map((c) => c.currency)).toEqual([
    'EUR',
    'GBP',
    'USD',
  ]);
  expect(result.customers).toHaveLength(12);
  expect(result.customers[0]).toMatchObject({
    id: 'northstar',
    profile: 'on-time',
  });
  const usd = result.currencies.find((c) => c.currency === 'USD');
  expect(usd?.unappliedCents).toBe(1390000);
  expect(usd?.unapplied).toBe('$13,900.00');
  expect(usd?.unappliedPayments).toBe(5);
  expect(size(result)).toBeLessThan(BUDGET);
});

test('monthlyTotals returns the last N months for a currency, optionally one customer', () => {
  const all = monthlyTotals(snapshot, { currency: 'EUR' });
  const one = monthlyTotals(snapshot, {
    currency: 'EUR',
    customerId: 'lumen',
    months: 3,
  });

  expect(all.rows).toHaveLength(12);
  expect(all.rows.at(-1)?.month).toBe('2026-09');
  expect(all.rows[0].month).toBe('2025-10');
  expect(one.rows).toHaveLength(3);
  expect(one.rows.every((r) => r.invoicedCents > 0)).toBe(true);
  expect(one.rows[0]).toHaveProperty('invoiced');
  expect(
    monthlyTotals(snapshot, { currency: 'GBP', months: 99 }).rows,
  ).toHaveLength(24);
  expect(size(all)).toBeLessThan(BUDGET);
});

test('monthlyTotals zero-fills gap months inside the window', () => {
  const gappy = fixture([
    { id: 'inv-jul', date: '2026-07-10', amountCents: 100 },
    { id: 'inv-sep', date: '2026-09-01', amountCents: 300 },
  ]);

  const result = monthlyTotals(gappy, { currency: 'usd', months: 3 });

  expect(result.currency).toBe('USD');
  expect(result.rows.map((r) => [r.month, r.invoicedCents])).toEqual([
    ['2026-07', 100],
    ['2026-08', 0],
    ['2026-09', 300],
  ]);
  expect(result.rows[1].invoiced).toBe('$0.00');
});

test('monthlyTotals and aging reject a customer billed in another currency', () => {
  expect(() =>
    monthlyTotals(snapshot, { currency: 'EUR', customerId: 'cedar' }),
  ).toThrow('customer_currency_mismatch: cedar bills in USD');
  expect(() =>
    aging(snapshot, { currency: 'EUR', customerId: 'cedar' }),
  ).toThrow('customer_currency_mismatch: cedar bills in USD');
  expect(() => aging(snapshot, { currency: 'XXX' })).toThrow(
    'currency_not_found: XXX; ledger currencies are EUR, GBP, USD',
  );
});

test('aging buckets reconcile with open balances and list invoice ids', () => {
  const gbp = aging(snapshot, { currency: 'GBP' });
  const thistle = aging(snapshot, { currency: 'GBP', customerId: 'thistle' });

  const open = snapshot.invoices.filter(
    (i) => i.currency === 'GBP' && i.outstandingCents > 0,
  );
  expect(gbp.buckets.reduce((sum, b) => sum + b.outstandingCents, 0)).toBe(
    open.reduce((sum, i) => sum + i.outstandingCents, 0),
  );
  expect(gbp.openCents).toBe(
    open.reduce((sum, i) => sum + i.outstandingCents, 0),
  );
  expect(gbp.open).toMatch(/^£[\d,]+\.\d{2}$/);
  expect(gbp.buckets.flatMap((b) => b.invoiceIds).sort()).toEqual(
    open.map((i) => i.id).sort(),
  );
  expect(gbp.buckets.map((b) => b.bucket)).toEqual([
    'current',
    'days1to30',
    'days31to60',
    'days61to90',
    'over90',
  ]);
  expect(
    thistle.buckets.every((b) =>
      b.invoiceIds.every((id) => id.includes('thistle')),
    ),
  ).toBe(true);
  expect(size(gbp)).toBeLessThan(BUDGET);
});

test('customerStatement reports habit and open items for one client', () => {
  const cedar = customerStatement(snapshot, { customerId: 'cedar' });
  const granite = customerStatement(snapshot, { customerId: 'granite' });

  expect(cedar.customer).toMatchObject({
    id: 'cedar',
    currency: 'USD',
    profile: 'on-time',
  });
  expect(cedar.openInvoices.map((i) => i.id)).toEqual([
    sampleScenarios.partial.invoiceId,
  ]);
  expect(cedar.unappliedPayments.map((p) => p.id)).toEqual([
    sampleScenarios.partial.paymentId,
  ]);
  expect(cedar.averageDaysToPay).toBeGreaterThanOrEqual(5);
  expect(cedar.averageDaysToPay).toBeLessThanOrEqual(12);
  expect(cedar.asOf).toBe('2026-09-15');
  expect(granite.openInvoices.length).toBeGreaterThanOrEqual(24);
  expect(granite.openInvoices.length).toBeLessThanOrEqual(50);
  expect(granite.openInvoicesTruncated).toBe(false);
  expect(granite.unappliedPaymentCount).toBe(0);
  expect(granite.unappliedPaymentsTruncated).toBe(false);
  expect(() => customerStatement(snapshot, { customerId: 'nobody' })).toThrow(
    'customer_not_found: nobody',
  );
  expect(size(granite)).toBeLessThan(BUDGET);
});

test('customerStatement caps open invoices at 50 and says so', () => {
  const busy = fixture(
    Array.from({ length: 51 }, (_, n) => ({
      id: `inv-${n}`,
      date: `2026-08-${String((n % 28) + 1).padStart(2, '0')}`,
      amountCents: 1000 + n,
    })),
  );

  const result = customerStatement(busy, { customerId: 'solo' });

  expect(result.openInvoices).toHaveLength(50);
  expect(result.openInvoiceCount).toBe(51);
  expect(result.openInvoicesTruncated).toBe(true);
  expect(size(result)).toBeLessThan(BUDGET);
});

test('findRecords filters, caps, and reports the total', () => {
  const open = findRecords(snapshot, {
    kind: 'invoice',
    status: 'open',
    currency: 'USD',
  });
  const text = findRecords(snapshot, { text: 'workshop' });
  const capped = findRecords(snapshot, { kind: 'payment', limit: 500 });
  const dated = findRecords(snapshot, {
    from: '2026-09-01',
    to: '2026-09-15',
    kind: 'payment',
  });

  expect(
    open.records.every((r) => r.kind === 'invoice' && r.balanceCents > 0),
  ).toBe(true);
  expect(open.total).toBeGreaterThan(open.records.length);
  expect(open.records).toHaveLength(20);
  expect(text.records.map((r) => r.id).sort()).toEqual(
    [
      ...sampleScenarios.ambiguous.invoiceIds,
      sampleScenarios.ambiguous.paymentId,
    ].sort(),
  );
  expect(capped.records).toHaveLength(50);
  expect(capped.total).toBe(snapshot.payments.length);
  expect(
    dated.records.every(
      (r) => r.date >= '2026-09-01' && r.date <= '2026-09-15',
    ),
  ).toBe(true);
  expect(dated.records[0].date >= (dated.records.at(-1)?.date ?? '')).toBe(
    true,
  );
  expect(size(capped)).toBeLessThan(BUDGET);
});

test('unappliedPayments lists candidates per payment', () => {
  const all = unappliedPayments(snapshot, {});
  const eur = unappliedPayments(snapshot, { currency: 'EUR' });

  expect(all.payments.map((p) => p.id).sort()).toEqual(
    [
      sampleScenarios.exact.paymentId,
      sampleScenarios.partial.paymentId,
      sampleScenarios.combined.paymentId,
      sampleScenarios.ambiguous.paymentId,
      sampleScenarios.advance.paymentId,
    ].sort(),
  );
  const atlas = all.payments.find(
    (p) => p.id === sampleScenarios.ambiguous.paymentId,
  );
  expect(atlas?.candidates.map((c) => c.invoiceId).sort()).toEqual(
    [...sampleScenarios.ambiguous.invoiceIds].sort(),
  );
  expect(atlas?.candidateCount).toBe(2);
  expect(
    all.payments.find((p) => p.id === sampleScenarios.advance.paymentId)
      ?.candidates,
  ).toEqual([]);
  expect(all.totals).toEqual([
    { currency: 'USD', unappliedCents: 1390000, unapplied: '$13,900.00' },
  ]);
  expect(eur.payments).toEqual([]);
  expect(size(all)).toBeLessThan(BUDGET);
});
