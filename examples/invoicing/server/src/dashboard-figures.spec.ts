import { expect, test } from 'vitest';
import { clientRows, currencyTotals, invoiceRows } from '@invoicing/contracts';
import { getSnapshot } from './ledger';
import { createSampleLedger } from './sample-ledger';

const AS_OF = '2026-09-15';
const snapshot = getSnapshot(createSampleLedger());

test('the seeded ledger totals each currency the way the dashboard shows it', () => {
  const totals = currencyTotals(snapshot, AS_OF);

  expect(totals).toEqual(
    expect.arrayContaining([
      {
        currency: 'USD',
        clientCount: 8,
        openCents: 4230500,
        overdueCents: 1716700,
        unappliedCents: 1390000,
        unappliedPaymentCount: 5,
        averageDaysToPay: 17,
      },
      {
        currency: 'GBP',
        clientCount: 2,
        openCents: 1753200,
        overdueCents: 1143600,
        unappliedCents: 0,
        unappliedPaymentCount: 0,
        averageDaysToPay: 26,
      },
      {
        currency: 'EUR',
        clientCount: 2,
        openCents: 450000,
        overdueCents: 0,
        unappliedCents: 0,
        unappliedPaymentCount: 0,
        averageDaysToPay: 24,
      },
    ]),
  );
});

test('Thistle Retail carries £14,000 open, £8,000 overdue, aged across three buckets', () => {
  const thistle = clientRows(snapshot, AS_OF).find(
    (row) => row.id === 'thistle',
  );

  expect(thistle).toMatchObject({
    currency: 'GBP',
    openCents: 1400000,
    overdueCents: 800000,
    openInvoiceCount: 3,
    averageDaysToPay: 47,
    aging: {
      current: 600000,
      days1to30: 600000,
      days31to60: 200000,
      days61to90: 0,
      over90: 0,
    },
  });
});

test('each client row sums back to its currency total', () => {
  const rows = clientRows(snapshot, AS_OF);
  const totals = currencyTotals(snapshot, AS_OF);

  for (const total of totals) {
    const own = rows.filter((row) => row.currency === total.currency);
    expect(own.reduce((sum, row) => sum + row.openCents, 0)).toBe(
      total.openCents,
    );
    expect(own.reduce((sum, row) => sum + row.overdueCents, 0)).toBe(
      total.overdueCents,
    );
  }
});

test('invoice rows cover all 489 invoices with 98 open, and classify one-offs and residuals', () => {
  const rows = invoiceRows(snapshot, AS_OF);

  expect(rows).toHaveLength(489);
  expect(rows.filter((row) => row.balanceCents > 0)).toHaveLength(98);
  expect(rows.find((row) => row.reference === 'INV-202609-CH-102')?.type).toBe(
    'One-off',
  );
  expect(
    rows.find((row) => row.reference === 'INV-202510-KESTREL-P1'),
  ).toMatchObject({
    type: 'Milestone',
    amountCents: 550000,
    balanceCents: 11000,
    status: { kind: 'partly-paid', days: 305 },
  });
});
