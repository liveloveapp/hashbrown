import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { getSnapshot } from '../ledger';
import { AS_OF, clients } from './clients';
import { daysBetween } from './dates';
import { generateHistory } from './history';

const ledger = generateHistory();
const snapshot = getSnapshot(ledger);

const invoice = (id: string) => {
  const found = snapshot.invoices.find((item) => item.id === id);
  if (!found) throw new Error(`missing invoice ${id}`);
  return found;
};
const payment = (id: string) => {
  const found = snapshot.payments.find((item) => item.id === id);
  if (!found) throw new Error(`missing payment ${id}`);
  return found;
};
/** Days from invoice issue to payment receipt, one per allocation. */
const lags = (customerId: string) =>
  ledger.allocations
    .filter((a) => invoice(a.invoiceId).customerId === customerId)
    .map((a) =>
      daysBetween(invoice(a.invoiceId).date!, payment(a.paymentId).date!),
    );
const open = (customerId: string) =>
  snapshot.invoices.filter(
    (item) => item.customerId === customerId && item.outstandingCents > 0,
  );

// If this test fails, the ledger every visitor and eval sees has changed.
// Update the literals deliberately, never to make a red test go green.
test('default seed produces the fingerprinted ledger', () => {
  expect(ledger.invoices).toHaveLength(483);
  expect(ledger.payments).toHaveLength(441);
  expect(ledger.allocations).toHaveLength(473);
  expect(
    createHash('sha256').update(JSON.stringify(ledger)).digest('hex'),
  ).toBe('385a7628ff5dd6baac91075fad5899a316ded3c328735f139e6db9cfc7ec0d1f');
});

test('is deterministic per seed and differs across seeds', () => {
  expect(generateHistory(1)).toEqual(generateHistory(1));
  expect(generateHistory(1)).not.toBe(generateHistory(1));
  expect(generateHistory(1)).not.toEqual(generateHistory(2));
});

test('covers twelve clients, three currencies, and twenty-four retainer months', () => {
  expect(ledger.customers).toHaveLength(12);
  expect(new Set(ledger.customers.map((c) => c.currency))).toEqual(
    new Set(['USD', 'EUR', 'GBP']),
  );
  for (const client of clients) {
    const retainers = ledger.invoices.filter(
      (item) =>
        item.customerId === client.id && item.description?.includes('retainer'),
    );
    expect(retainers).toHaveLength(24);
    expect(retainers[0].date).toBe('2024-10-01');
    expect(retainers[23].date).toBe('2026-09-01');
    expect(retainers.every((r) => r.currency === client.currency)).toBe(true);
  }
  for (const record of [...ledger.invoices, ...ledger.payments]) {
    expect(record.date! <= AS_OF).toBe(true);
    expect(record.reference).toBeTruthy();
    expect(record.description).toBeTruthy();
    expect(record.customerName).toBeTruthy();
  }
});

test('conserves cents, keeps ids unique, and versions records once per allocation', () => {
  const ids = [...ledger.invoices, ...ledger.payments].map((r) => r.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(ledger.allocations.map((a) => a.proposalId)).size).toBe(
    ledger.allocations.length,
  );
  expect(ledger.activities).toHaveLength(ledger.allocations.length);
  for (const allocation of ledger.allocations) {
    const p = payment(allocation.paymentId);
    const i = invoice(allocation.invoiceId);
    expect(p.customerId).toBe(i.customerId);
    expect(p.currency).toBe(i.currency);
    expect(allocation.amountCents).toBeGreaterThan(0);
  }
  for (const record of snapshot.payments) {
    expect(record.unappliedCents).toBe(0);
    expect(record.version).toBe(
      1 + ledger.allocations.filter((a) => a.paymentId === record.id).length,
    );
  }
  for (const record of snapshot.invoices) {
    expect(record.outstandingCents).toBeGreaterThanOrEqual(0);
    expect(record.version).toBe(
      1 + ledger.allocations.filter((a) => a.invoiceId === record.id).length,
    );
  }
});

test.each(['northstar', 'cedar', 'harbor', 'summit', 'lumen'])(
  'on-time client %s has settled everything within 12 days',
  (id) => {
    expect(open(id)).toHaveLength(0);
    for (const lag of lags(id)) {
      expect(lag).toBeGreaterThanOrEqual(5);
      expect(lag).toBeLessThanOrEqual(12);
    }
  },
);

test('late-fixed client pays in full 35 to 45 days out and has the latest invoices open', () => {
  for (const lag of lags('pioneer')) {
    expect(lag).toBeGreaterThanOrEqual(35);
    expect(lag).toBeLessThanOrEqual(45);
  }
  expect(open('pioneer').map((i) => i.id)).toContain('invoice-pioneer-2026-09');
});

test.each(['juniper', 'thistle'])(
  'late-drifting client %s pays later over time and has recent invoices open',
  (id) => {
    const all = lags(id);
    const early = all.slice(0, 6).reduce((a, b) => a + b, 0) / 6;
    const late = all.slice(-6).reduce((a, b) => a + b, 0) / 6;
    expect(late).toBeGreaterThan(early + 20);
    expect(open(id).length).toBeGreaterThanOrEqual(1);
  },
);

test.each(['granite', 'kestrel'])(
  'short-payer %s leaves a two percent residual on every settled invoice',
  (id) => {
    const settled = ledger.allocations.filter(
      (a) => invoice(a.invoiceId).customerId === id,
    );
    expect(settled.length).toBeGreaterThanOrEqual(24);
    for (const allocation of settled) {
      const i = invoice(allocation.invoiceId);
      expect(allocation.amountCents + i.outstandingCents).toBe(i.amountCents);
      expect(i.outstandingCents).toBe(i.amountCents / 50);
      expect(payment(allocation.paymentId).reference).toContain('LESS 2PCT');
    }
  },
);

test('batch-payer settles several invoices per transfer and leaves the current batch open', () => {
  const byPayment = new Map<string, number>();
  for (const a of ledger.allocations)
    if (payment(a.paymentId).customerId === 'orbital')
      byPayment.set(a.paymentId, (byPayment.get(a.paymentId) ?? 0) + 1);
  // Spans of two or three months over 24 months give 7 to 11 batches before
  // the as-of date; the September batch has not happened yet.
  expect(byPayment.size).toBeGreaterThanOrEqual(6);
  for (const count of byPayment.values())
    expect(count).toBeGreaterThanOrEqual(2);
  expect(open('orbital').length).toBeGreaterThanOrEqual(1);
});

test('wrong-reference client cites the previous invoice on every remittance after the first', () => {
  const atlas = ledger.allocations.filter(
    (a) => invoice(a.invoiceId).customerId === 'atlas',
  );
  const mismatched = atlas.filter(
    (a) =>
      !payment(a.paymentId).reference?.includes(
        invoice(a.invoiceId).reference!,
      ),
  );
  expect(mismatched.length).toBe(atlas.length - 1);
  expect(open('atlas')).toHaveLength(0);
});
