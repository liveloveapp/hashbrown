import { expect, test } from 'vitest';
import { createSampleLedger } from '../sample-ledger';
import { agingBucket, deriveFacts } from './facts';

const facts = deriveFacts(createSampleLedger());
const customer = (id: string) => {
  const found = facts.customers.find((c) => c.customerId === id);
  if (!found) throw new Error(`missing customer ${id}`);
  return found;
};
const currency = (code: string) => {
  const found = facts.currencies.find((c) => c.currency === code);
  if (!found) throw new Error(`missing currency ${code}`);
  return found;
};

test.each([
  ['2026-09-01', 'current'],
  ['2026-08-16', 'current'],
  ['2026-08-15', 'days1to30'],
  ['2026-07-17', 'days1to30'],
  ['2026-07-16', 'days31to60'],
  ['2026-06-16', 'days61to90'],
  ['2026-05-17', 'over90'],
])('an invoice dated %s as of 2026-09-15 ages as %s', (date, bucket) => {
  expect(agingBucket(date, '2026-09-15')).toBe(bucket);
});

test('lists currencies sorted and totals reconcile with customers', () => {
  expect(facts.asOf).toBe('2026-09-15');
  expect(facts.currencies.map((c) => c.currency)).toEqual([
    'EUR',
    'GBP',
    'USD',
  ]);
  for (const c of facts.currencies) {
    const own = facts.customers.filter((x) => x.currency === c.currency);
    const sum = (key: 'invoicedCents' | 'receivedCents' | 'openCents') =>
      own.reduce((total, x) => total + x[key], 0);
    expect(c.invoicedCents).toBe(sum('invoicedCents'));
    expect(c.receivedCents).toBe(sum('receivedCents'));
    expect(c.openCents).toBe(sum('openCents'));
    const buckets = Object.values(c.aging).reduce((a, b) => a + b, 0);
    expect(buckets).toBe(c.openCents);
  }
});

test('profiles surface as measurable habits', () => {
  expect(customer('summit').openCents).toBe(0);
  expect(customer('summit').latePaymentRate).toBe(0);
  expect(customer('summit').averageDaysToPay).toBeGreaterThanOrEqual(5);
  expect(customer('summit').averageDaysToPay).toBeLessThanOrEqual(12);

  expect(customer('pioneer').averageDaysToPay).toBeGreaterThanOrEqual(35);
  expect(customer('pioneer').averageDaysToPay).toBeLessThanOrEqual(45);
  expect(customer('pioneer').latePaymentRate).toBe(1);

  expect(customer('juniper').latePaymentRate).toBeGreaterThan(0);
  expect(customer('juniper').latePaymentRate).toBeLessThan(1);
  expect(customer('juniper').openInvoiceIds.length).toBeGreaterThanOrEqual(1);

  expect(customer('granite').openInvoiceIds.length).toBeGreaterThanOrEqual(24);
  expect(customer('granite').profile).toBe('short-payer');
});

test('the largest open balance per currency is the customer with the most outstanding', () => {
  for (const c of facts.currencies) {
    const own = facts.customers
      .filter((x) => x.currency === c.currency && x.openCents > 0)
      .sort((a, b) => b.openCents - a.openCents);
    expect(c.largestOpen).toEqual(
      own[0]
        ? { customerId: own[0].customerId, openCents: own[0].openCents }
        : undefined,
    );
  }
  expect(currency('GBP').largestOpen).toBeDefined();
});

test('only payments with several candidate invoices are ambiguous', () => {
  expect(facts.ambiguousPaymentIds).toContain('payment-atlas-ambiguous');
  expect(facts.ambiguousPaymentIds).toContain('payment-harbor-combined');
  expect(facts.ambiguousPaymentIds).not.toContain('payment-northstar-exact');
  expect(facts.ambiguousPaymentIds).not.toContain('payment-summit-advance');
});
