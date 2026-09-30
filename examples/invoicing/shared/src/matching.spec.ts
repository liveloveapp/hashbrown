import { expect, test } from 'vitest';
import type { LedgerSnapshot } from './index';
import { fillInOrder, matchHint, paymentRows } from './matching';

const AS_OF = '2026-09-15';

const invoice = (
  id: string,
  customerId: string,
  outstandingCents: number,
  date: string,
  currency = 'USD',
) => ({
  id,
  customerId,
  currency,
  date,
  amountCents: outstandingCents,
  outstandingCents,
  version: 1,
});

const payment = (
  id: string,
  customerId: string,
  unappliedCents: number,
  amountCents = unappliedCents,
) => ({
  id,
  customerId,
  currency: 'USD',
  date: '2026-09-10',
  amountCents,
  unappliedCents,
  version: 1,
});

const ledger = (
  invoices: LedgerSnapshot['invoices'],
  payments: LedgerSnapshot['payments'],
): LedgerSnapshot => ({
  customers: [{ id: 'c', name: 'Cobalt', currency: 'USD', profile: 'on-time' }],
  invoices,
  payments,
  allocations: [],
  activities: [],
});

test('paymentRows carries payer, applied cash, age and status', () => {
  const snapshot = ledger(
    [],
    [
      { ...payment('p1', 'c', 0, 5000), reference: 'ACH 1' },
      payment('p2', 'c', 2000, 5000),
      payment('p3', 'c', 5000),
    ],
  );

  const rows = paymentRows(snapshot, AS_OF);

  expect(rows[0]).toEqual({
    id: 'p1',
    reference: 'ACH 1',
    payerId: 'c',
    payerName: 'Cobalt',
    currency: 'USD',
    received: '2026-09-10',
    amountCents: 5000,
    appliedCents: 5000,
    unappliedCents: 0,
    ageDays: 5,
    status: 'matched',
  });
  expect(rows.map((row) => row.status)).toEqual([
    'matched',
    'partly-applied',
    'unmatched',
  ]);
  expect(rows[2].reference).toBe('p3');
});

test('matchHint names an advance, an exact match and an ambiguous pair', () => {
  const snapshot = ledger(
    [
      invoice('a', 'c', 1500, '2026-09-01'),
      invoice('b', 'c', 1500, '2026-09-02'),
      invoice('x', 'c', 2400, '2026-09-03'),
    ],
    [
      payment('advance', 'other', 1000),
      payment('exact', 'c', 2400),
      payment('pair', 'c', 1500),
    ],
  );

  const hints = ['advance', 'exact', 'pair'].map((id) =>
    matchHint(snapshot, id),
  );

  expect(hints).toEqual([
    { kind: 'advance' },
    { kind: 'exact', invoiceIds: ['x'] },
    { kind: 'ambiguous', invoiceIds: ['a', 'b'] },
  ]);
});

test('matchHint ties out the smallest set of invoices, oldest first', () => {
  const snapshot = ledger(
    [
      invoice('late', 'c', 1800, '2026-09-10'),
      invoice('early', 'c', 3200, '2026-09-09'),
      invoice('small', 'c', 1000, '2026-09-01'),
    ],
    [payment('p', 'c', 5000)],
  );

  const hint = matchHint(snapshot, 'p');

  expect(hint).toEqual({ kind: 'ties-out', invoiceIds: ['early', 'late'] });
});

test('matchHint calls two equally small tie-outs ambiguous', () => {
  const snapshot = ledger(
    [
      invoice('a', 'c', 1000, '2026-09-01'),
      invoice('b', 'c', 2000, '2026-09-02'),
      invoice('d', 'c', 1500, '2026-09-03'),
      invoice('e', 'c', 1500, '2026-09-04'),
    ],
    [payment('p', 'c', 3000)],
  );

  const hint = matchHint(snapshot, 'p');

  expect(hint).toEqual({
    kind: 'ambiguous',
    invoiceIds: ['a', 'b', 'd', 'e'],
  });
});

test('matchHint lists ambiguous tie-out candidates oldest first', () => {
  const snapshot = ledger(
    [
      invoice('a', 'c', 2000, '2026-09-01'),
      invoice('b', 'c', 1500, '2026-09-02'),
      invoice('d', 'c', 1000, '2026-09-03'),
      invoice('e', 'c', 1500, '2026-09-04'),
    ],
    [payment('p', 'c', 3000)],
  );

  const hint = matchHint(snapshot, 'p');

  expect(hint).toEqual({
    kind: 'ambiguous',
    invoiceIds: ['a', 'b', 'd', 'e'],
  });
});

test('matchHint stays quick for a payer with many small open invoices', () => {
  const snapshot = ledger(
    Array.from({ length: 60 }, (_, i) =>
      invoice(`i${String(i).padStart(2, '0')}`, 'c', 50, '2026-09-01'),
    ),
    [payment('p', 'c', 250)],
  );

  const start = performance.now();
  const hint = matchHint(snapshot, 'p');
  const elapsed = performance.now() - start;

  expect(hint.kind).toBe('ambiguous');
  expect(elapsed).toBeLessThan(200);
});

test('matchHint falls back to a single larger invoice as a partial, else none', () => {
  const partial = ledger(
    [invoice('big', 'c', 5000, '2026-09-01')],
    [payment('p', 'c', 2000)],
  );
  const none = ledger(
    [invoice('tiny', 'c', 100, '2026-09-01')],
    [payment('p', 'c', 2000)],
  );

  const hints = [matchHint(partial, 'p'), matchHint(none, 'p')];

  expect(hints).toEqual([
    { kind: 'partial', invoiceIds: ['big'] },
    { kind: 'none' },
  ]);
});

test('matchHint ignores other currencies and fully applied payments', () => {
  const snapshot = ledger(
    [invoice('eur', 'c', 2400, '2026-09-01', 'EUR')],
    [payment('p', 'c', 2400), payment('done', 'c', 0, 2400)],
  );

  const hints = [matchHint(snapshot, 'p'), matchHint(snapshot, 'done')];

  expect(hints).toEqual([{ kind: 'advance' }, { kind: 'none' }]);
});

test('fillInOrder spends the payment on each invoice in turn', () => {
  const invoices = [
    { id: 'a', outstandingCents: 3200 },
    { id: 'b', outstandingCents: 1800 },
    { id: 'c', outstandingCents: 900 },
  ];

  const plan = fillInOrder(4000, invoices);

  expect(plan).toEqual({
    lines: [
      { invoiceId: 'a', amountCents: 3200 },
      { invoiceId: 'b', amountCents: 800 },
      { invoiceId: 'c', amountCents: 0 },
    ],
    appliedCents: 4000,
    remainingCents: 0,
  });
});
