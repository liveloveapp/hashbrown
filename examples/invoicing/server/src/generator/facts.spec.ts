import { expect, test } from 'vitest';
import { createLedger } from '../ledger';
import { createSampleLedger } from '../sample-ledger';
import { agingBucket, deriveFacts } from './facts';

const ledger = createSampleLedger();
const facts = deriveFacts(ledger);
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
    expect(c.invoicedCents - c.openCents).toBe(
      c.receivedCents - c.unappliedCents,
    );
  }
  for (const c of facts.customers) {
    expect(c.invoicedCents - c.openCents).toBe(
      c.receivedCents - c.unappliedCents,
    );
  }
  // Summit paid a 3,000.00 advance nothing has been invoiced for yet.
  expect(
    customer('summit').receivedCents - customer('summit').invoicedCents,
  ).toBe(300000);
  // Cedar's partial payment scenario leaves 2,000.00 unapplied.
  expect(customer('cedar').unappliedCents).toBe(200000);
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

  // Orbital pays in batches, so its count-weighted lag looks late.
  expect(customer('orbital').latePaymentRate).toBeGreaterThan(0);
  expect(customer('orbital').latePaymentRate).toBeLessThan(1);
  expect(customer('orbital').averageDaysToPay).toBeGreaterThan(12);

  // A short-payer leaves 2% of every invoice open.
  const graniteInvoices = ledger.invoices.filter(
    (i) => i.customerId === 'granite',
  );
  expect(customer('granite').openInvoiceIds.length).toBe(
    graniteInvoices.length,
  );
  expect(customer('granite').profile).toBe('short-payer');
});

test('a customer with no payment history has no habits and ages as current', () => {
  const base = deriveFacts(createLedger());
  expect(base.customers).toHaveLength(1);
  expect(base.customers[0]?.averageDaysToPay).toBeUndefined();
  expect(base.customers[0]?.latePaymentRate).toBeUndefined();
  const usd = base.currencies.find((c) => c.currency === 'USD');
  expect(usd?.aging).toEqual({
    current: usd?.openCents,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
  });
  expect(usd?.openCents).toBeGreaterThan(0);
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
  // The ledger is fingerprinted, so the winners are stable enough to pin.
  expect(currency('EUR').largestOpen?.customerId).toBe('orbital');
  expect(currency('GBP').largestOpen?.customerId).toBe('thistle');
  expect(currency('USD').largestOpen?.customerId).toBe('juniper');
});

test('only payments with several candidate invoices are ambiguous', () => {
  expect(facts.ambiguousPaymentIds).toContain('payment-atlas-ambiguous');
  expect(facts.ambiguousPaymentIds).toContain('payment-harbor-combined');
  expect(facts.ambiguousPaymentIds).not.toContain('payment-northstar-exact');
  expect(facts.ambiguousPaymentIds).not.toContain('payment-summit-advance');
});
