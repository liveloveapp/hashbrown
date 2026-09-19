import { expect, test } from 'vitest';
import type { LedgerSnapshot } from '@invoicing/contracts';
import {
  agingTotals,
  customerSummary,
  money,
  monthLabel,
  monthlySeries,
  resolveRecords,
} from './ledger-views';

const snapshot: LedgerSnapshot = {
  customers: [
    { id: 'c', name: 'Cedar Health', currency: 'USD', profile: 'late-fixed' },
    { id: 'e', name: 'Lumen Fintech', currency: 'EUR', profile: 'on-time' },
  ],
  invoices: [
    {
      id: 'i1',
      customerId: 'c',
      customerName: 'Cedar Health',
      currency: 'USD',
      amountCents: 25000,
      outstandingCents: 25000,
      reference: 'INV-1',
      date: '2026-07-01',
      version: 1,
    },
    {
      id: 'i2',
      customerId: 'c',
      customerName: 'Cedar Health',
      currency: 'USD',
      amountCents: 5000,
      outstandingCents: 0,
      reference: 'INV-2',
      date: '2026-08-01',
      version: 2,
    },
    {
      id: 'i3',
      customerId: 'e',
      customerName: 'Lumen Fintech',
      currency: 'EUR',
      amountCents: 7000,
      outstandingCents: 7000,
      reference: 'INV-3',
      date: '2026-04-01',
      version: 1,
    },
  ],
  payments: [
    {
      id: 'p1',
      customerId: 'c',
      customerName: 'Cedar Health',
      currency: 'USD',
      amountCents: 5000,
      unappliedCents: 0,
      reference: 'ACH 2',
      date: '2026-09-10',
      version: 2,
    },
    {
      id: 'p2',
      customerId: 'c',
      customerName: 'Cedar Health',
      currency: 'USD',
      amountCents: 10000,
      unappliedCents: 10000,
      reference: 'ACH 3',
      date: '2026-09-12',
      version: 1,
    },
  ],
  allocations: [
    { paymentId: 'p1', invoiceId: 'i2', amountCents: 5000, proposalId: 'x' },
  ],
  activities: [],
};
const AS_OF = '2026-09-15';

test('money and monthLabel format for display', () => {
  expect(money(123456, 'USD')).toBe('$1,234.56');
  expect(money(0, 'GBP')).toBe('£0.00');
  expect(monthLabel('2026-07')).toBe('Jul 2026');
});

test('resolveRecords maps ids to display rows and counts misses', () => {
  const { rows, missing } = resolveRecords(snapshot, [
    'i1',
    'p2',
    'nope',
    'i1',
  ]);

  expect(rows.map((r) => r.id)).toEqual(['i1', 'p2']);
  expect(rows[0]).toMatchObject({
    kind: 'invoice',
    reference: 'INV-1',
    customer: 'Cedar Health',
    balanceCents: 25000,
    currency: 'USD',
  });
  expect(rows[1]).toMatchObject({
    kind: 'payment',
    reference: 'ACH 3',
    balanceCents: 10000,
  });
  expect(missing).toBe(1);
});

test('monthlySeries zero-fills calendar months back from the as-of month', () => {
  const rows = monthlySeries(snapshot, {
    currency: 'USD',
    customerId: null,
    months: 3,
    asOf: AS_OF,
  });

  expect(rows.map((r) => r.month)).toEqual(['2026-07', '2026-08', '2026-09']);
  expect(rows.map((r) => r.invoicedCents)).toEqual([25000, 5000, 0]);
  expect(rows.map((r) => r.receivedCents)).toEqual([0, 0, 15000]);
  expect(
    monthlySeries(snapshot, {
      currency: 'EUR',
      customerId: 'e',
      months: 2,
      asOf: AS_OF,
    }).map((r) => r.invoicedCents),
  ).toEqual([0, 0]);
  expect(
    monthlySeries(snapshot, {
      currency: 'USD',
      customerId: null,
      months: 500,
      asOf: AS_OF,
    }),
  ).toHaveLength(24);
});

test('agingTotals buckets open invoices with counts', () => {
  const usd = agingTotals(snapshot, {
    currency: 'USD',
    customerId: null,
    asOf: AS_OF,
  });
  const eur = agingTotals(snapshot, {
    currency: 'EUR',
    customerId: 'e',
    asOf: AS_OF,
  });

  expect(usd.map((b) => b.bucket)).toEqual([
    'current',
    'days1to30',
    'days31to60',
    'days61to90',
    'over90',
  ]);
  expect(usd.find((b) => b.bucket === 'days31to60')).toMatchObject({
    cents: 25000,
    count: 1,
    label: '31-60 days',
  });
  expect(usd.reduce((s, b) => s + b.cents, 0)).toBe(25000);
  expect(eur.find((b) => b.bucket === 'over90')).toMatchObject({
    cents: 7000,
    count: 1,
  });
});

test('customerSummary computes balances and habit from the snapshot', () => {
  const cedar = customerSummary(snapshot, 'c', AS_OF);

  expect(cedar).toMatchObject({
    id: 'c',
    name: 'Cedar Health',
    currency: 'USD',
    profile: 'late-fixed',
    invoicedCents: 30000,
    receivedCents: 15000,
    openCents: 25000,
    unappliedCents: 10000,
    openInvoiceCount: 1,
    averageDaysToPay: 40,
    latePaymentRate: 1,
    lastPaymentDate: '2026-09-12',
  });
  expect(customerSummary(snapshot, 'e', AS_OF)).toMatchObject({
    averageDaysToPay: null,
    latePaymentRate: null,
  });
  expect(customerSummary(snapshot, 'nobody', AS_OF)).toBeUndefined();
});
