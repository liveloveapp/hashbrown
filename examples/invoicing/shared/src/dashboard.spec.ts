import { expect, test } from 'vitest';
import {
  clientRows,
  currencyTotals,
  invoiceRows,
  invoiceStatus,
  invoiceType,
} from './dashboard';
import type { LedgerSnapshot } from './index';

const AS_OF = '2026-09-15';

const snapshot: LedgerSnapshot = {
  customers: [
    { id: 'acme', name: 'Acme', currency: 'USD', profile: 'on-time' },
    { id: 'birch', name: 'Birch', currency: 'USD', profile: 'late-fixed' },
    { id: 'crane', name: 'Crane', currency: 'GBP', profile: 'short-payer' },
  ],
  invoices: [
    // Acme: one current, one 15 days overdue, one paid.
    {
      id: 'a1',
      customerId: 'acme',
      date: '2026-09-01',
      reference: 'INV-A1',
      description: 'Build — 2026-09 monthly retainer',
      currency: 'USD',
      amountCents: 100000,
      version: 1,
      outstandingCents: 100000,
    },
    {
      id: 'a2',
      customerId: 'acme',
      date: '2026-08-01',
      reference: 'INV-A2',
      description: 'Build — project milestone 1',
      currency: 'USD',
      amountCents: 50000,
      version: 1,
      outstandingCents: 50000,
    },
    {
      id: 'a3',
      customerId: 'acme',
      date: '2026-07-01',
      reference: 'INV-A3',
      description: 'Build — 2026-07 monthly retainer',
      currency: 'USD',
      amountCents: 100000,
      version: 1,
      outstandingCents: 0,
    },
    // Birch: partly paid and 95 days overdue.
    {
      id: 'b1',
      customerId: 'birch',
      date: '2026-05-13',
      reference: 'INV-B1',
      description: 'Accessibility sprint',
      currency: 'USD',
      amountCents: 80000,
      version: 1,
      outstandingCents: 20000,
    },
    // Crane: current.
    {
      id: 'c1',
      customerId: 'crane',
      date: '2026-09-10',
      reference: 'INV-C1',
      description: 'Audit — 2026-09 monthly retainer',
      currency: 'GBP',
      amountCents: 70000,
      version: 1,
      outstandingCents: 70000,
    },
  ],
  payments: [
    {
      id: 'pa',
      customerId: 'acme',
      date: '2026-07-11',
      currency: 'USD',
      amountCents: 100000,
      version: 1,
      unappliedCents: 0,
    },
    {
      id: 'pb',
      customerId: 'birch',
      date: '2026-06-12',
      currency: 'USD',
      amountCents: 60000,
      version: 1,
      unappliedCents: 0,
    },
    {
      id: 'pu',
      customerId: 'acme',
      date: '2026-09-14',
      currency: 'USD',
      amountCents: 30000,
      version: 1,
      unappliedCents: 30000,
    },
  ],
  allocations: [
    // Acme paid a3 10 days after issue; Birch paid b1 30 days after issue.
    { paymentId: 'pa', invoiceId: 'a3', amountCents: 100000, proposalId: 'x' },
    { paymentId: 'pb', invoiceId: 'b1', amountCents: 60000, proposalId: 'y' },
  ],
  activities: [],
};

test('invoiceType reads retainers and milestones from the description, anything else is one-off', () => {
  const descriptions = [
    'Build — 2026-09 monthly retainer',
    'Build — project milestone 2',
    'Accessibility sprint',
    undefined,
  ];

  const types = descriptions.map(invoiceType);

  expect(types).toEqual(['Retainer', 'Milestone', 'One-off', 'One-off']);
});

test('invoiceStatus distinguishes paid, current, overdue and partly paid', () => {
  const statuses = snapshot.invoices.map((invoice) =>
    invoiceStatus(invoice, AS_OF),
  );

  expect(statuses).toEqual([
    { kind: 'current' },
    { kind: 'overdue', days: 15 },
    { kind: 'paid' },
    { kind: 'partly-paid', days: 95 },
    { kind: 'current' },
  ]);
});

test('currencyTotals sums open, overdue and unapplied per currency and averages days to pay', () => {
  const totals = currencyTotals(snapshot, AS_OF);

  expect(totals).toEqual([
    {
      currency: 'USD',
      clientCount: 2,
      openCents: 170000,
      overdueCents: 70000,
      unappliedCents: 30000,
      unappliedPaymentCount: 1,
      averageDaysToPay: 20,
    },
    {
      currency: 'GBP',
      clientCount: 1,
      openCents: 70000,
      overdueCents: 0,
      unappliedCents: 0,
      unappliedPaymentCount: 0,
      averageDaysToPay: null,
    },
  ]);
});

test('clientRows gives each client its balances, aging, open count and payment habit', () => {
  const rows = clientRows(snapshot, AS_OF);

  expect(rows.find((row) => row.id === 'acme')).toEqual({
    id: 'acme',
    name: 'Acme',
    currency: 'USD',
    profile: 'on-time',
    openCents: 150000,
    overdueCents: 50000,
    aging: {
      current: 100000,
      days1to30: 50000,
      days31to60: 0,
      days61to90: 0,
      over90: 0,
    },
    openInvoiceCount: 2,
    averageDaysToPay: 10,
    unappliedCents: 30000,
  });
  expect(rows.find((row) => row.id === 'crane')?.averageDaysToPay).toBeNull();
});

test('invoiceRows carries type, status, age bucket and client name for every invoice', () => {
  const rows = invoiceRows(snapshot, AS_OF);

  expect(rows).toHaveLength(5);
  expect(rows.find((row) => row.id === 'b1')).toEqual({
    id: 'b1',
    reference: 'INV-B1',
    clientId: 'birch',
    clientName: 'Birch',
    currency: 'USD',
    type: 'One-off',
    issued: '2026-05-13',
    amountCents: 80000,
    balanceCents: 20000,
    daysOverdue: 95,
    bucket: 'over90',
    status: { kind: 'partly-paid', days: 95 },
  });
  expect(rows.find((row) => row.id === 'a3')?.bucket).toBeNull();
});
