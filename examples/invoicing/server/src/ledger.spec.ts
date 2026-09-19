import { expect, test } from 'vitest';
import {
  applyProposal,
  createLedger,
  createProposal,
  getSnapshot,
  materialize,
  overlayOf,
} from './ledger';

const request = {
  paymentId: 'payment-001',
  invoiceId: 'invoice-001',
  amountCents: 240000,
};
const ids = {
  proposalId: 'proposal-001',
  operationId: 'operation-001',
  generation: 1,
};

test('creating a proposal leaves balances unchanged', () => {
  const ledger = createLedger();

  const proposal = createProposal(ledger, request, ids);

  expect(proposal.amountCents).toBe(240000);
  expect(proposal.expectedPaymentVersion).toBe(1);
  expect(proposal.expectedInvoiceVersion).toBe(1);
  expect(getSnapshot(ledger).payments[0].unappliedCents).toBe(240000);
  expect(getSnapshot(ledger).invoices[0].outstandingCents).toBe(240000);
});

test('approval creates exactly one allocation and activity with derived zero balances', () => {
  const ledger = createLedger();
  const proposal = createProposal(ledger, request, ids);

  const next = applyProposal(ledger, proposal);

  expect(next.allocations).toHaveLength(1);
  expect(next.activities).toHaveLength(1);
  expect(getSnapshot(next).payments[0].unappliedCents).toBe(0);
  expect(getSnapshot(next).invoices[0].outstandingCents).toBe(0);
  expect(getSnapshot(ledger).payments[0].unappliedCents).toBe(240000);
});

test('a stale proposal cannot change a ledger', () => {
  const ledger = createLedger();
  const proposal = createProposal(ledger, request, ids);
  const next = applyProposal(ledger, proposal);

  expect(() => applyProposal(next, proposal)).toThrow('stale_version');

  expect(next.allocations).toHaveLength(1);
});

test.each([-1, 0, 0.5, Number.MAX_SAFE_INTEGER + 1, 240001])(
  'rejects invalid amount %s',
  (amountCents) => {
    const ledger = createLedger();

    expect(() =>
      createProposal(ledger, { ...request, amountCents }, ids),
    ).toThrow();

    expect(ledger.allocations).toHaveLength(0);
  },
);

test.each([{ currency: 'EUR' }, { customerId: 'other-customer' }])(
  'rejects incompatible records %s',
  (patch) => {
    const ledger = createLedger();
    const incompatible = {
      ...ledger,
      invoices: ledger.invoices.map((invoice) => ({ ...invoice, ...patch })),
    };

    expect(() => createProposal(incompatible, request, ids)).toThrow(
      'incompatible_records',
    );

    expect(incompatible.allocations).toHaveLength(0);
  },
);

test.each(['payments', 'invoices'] as const)(
  'independently checks the %s version',
  (collection) => {
    const ledger = createLedger();
    const proposal = createProposal(ledger, request, ids);
    const changed = {
      ...ledger,
      [collection]: ledger[collection].map((record) => ({
        ...record,
        version: 2,
      })),
    };

    expect(() => applyProposal(changed, proposal)).toThrow('stale_version');

    expect(changed.allocations).toHaveLength(0);
  },
);

test.each([NaN, Infinity, -Infinity])(
  'rejects non-finite cents %s',
  (amountCents) => {
    const ledger = createLedger();

    expect(() =>
      createProposal(ledger, { ...request, amountCents }, ids),
    ).toThrow('invalid_amount');

    expect(ledger.allocations).toHaveLength(0);
  },
);

test.each([{ currency: 'EUR' }, { customerId: 'other-customer' }])(
  'approval revalidates record identity with unchanged versions %s',
  (patch) => {
    const ledger = createLedger();
    const proposal = createProposal(ledger, request, ids);
    const changed = {
      ...ledger,
      payments: ledger.payments.map((record) => ({ ...record, ...patch })),
      invoices: ledger.invoices.map((record) => ({ ...record, ...patch })),
    };

    expect(() => applyProposal(changed, proposal)).toThrow(
      'incompatible_records',
    );

    expect(changed.allocations).toHaveLength(0);
  },
);

const empty = { allocations: [], activities: [] };

test('an empty overlay materializes to the base ledger itself', () => {
  const base = createLedger();

  expect(materialize(base, empty)).toEqual(base);
});

test('applying a proposal to a materialized ledger yields an overlay that reproduces it', () => {
  const base = createLedger();
  const before = structuredClone(base);
  const proposal = createProposal(materialize(base, empty), request, ids);

  const next = applyProposal(materialize(base, empty), proposal);
  const overlay = overlayOf(base, next);

  expect(overlay.allocations).toHaveLength(1);
  expect(overlay.activities).toHaveLength(1);
  expect(materialize(base, overlay)).toEqual(next);
  expect(materialize(base, overlay).payments[0].version).toBe(2);
  expect(materialize(base, overlay).invoices[0].version).toBe(2);
  expect(base).toEqual(before);
});

test('a second allocation on the same records advances versions again', () => {
  const base = createLedger();
  const first = createProposal(
    materialize(base, empty),
    { ...request, amountCents: 100000 },
    ids,
  );
  const afterFirst = applyProposal(materialize(base, empty), first);
  const overlay = overlayOf(base, afterFirst);
  const second = createProposal(
    materialize(base, overlay),
    { ...request, amountCents: 140000 },
    { ...ids, proposalId: 'proposal-002', operationId: 'operation-002' },
  );

  const afterSecond = applyProposal(materialize(base, overlay), second);

  expect(overlayOf(base, afterSecond).allocations).toHaveLength(2);
  expect(
    materialize(base, overlayOf(base, afterSecond)).payments[0].version,
  ).toBe(3);
  expect(
    getSnapshot(materialize(base, overlayOf(base, afterSecond))).payments[0]
      .unappliedCents,
  ).toBe(0);
});
