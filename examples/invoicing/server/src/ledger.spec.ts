import { expect, test } from 'vitest';
import {
  applyProposal,
  createLedger,
  createProposal,
  fillLines,
  getSnapshot,
  materialize,
  overlayOf,
} from './ledger';
import { createSampleLedger, sampleScenarios } from './sample-ledger';
import type { Ledger } from '@invoicing/contracts';

const request = {
  paymentId: 'payment-001',
  lines: [{ invoiceId: 'invoice-001', amountCents: 240000 }],
};
const withAmount = (amountCents: number) => ({
  ...request,
  lines: [{ ...request.lines[0], amountCents }],
});
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
  expect(proposal.lines[0].expectedInvoiceVersion).toBe(1);
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
      createProposal(ledger, withAmount(amountCents), ids),
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

    expect(() => createProposal(ledger, withAmount(amountCents), ids)).toThrow(
      'invalid_amount',
    );

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

test('an empty overlay materializes to a ledger equal to the base', () => {
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
  const rebuilt = materialize(base, overlay);
  expect(rebuilt).toEqual(next);
  expect(rebuilt.payments[0].version).toBe(2);
  expect(rebuilt.invoices[0].version).toBe(2);
  expect(base).toEqual(before);
});

test('a second allocation on the same records advances versions again', () => {
  const base = createLedger();
  const first = createProposal(
    materialize(base, empty),
    withAmount(100000),
    ids,
  );
  const afterFirst = applyProposal(materialize(base, empty), first);
  const overlay = overlayOf(base, afterFirst);
  const second = createProposal(
    materialize(base, overlay),
    withAmount(140000),
    { ...ids, proposalId: 'proposal-002', operationId: 'operation-002' },
  );

  const afterSecond = applyProposal(materialize(base, overlay), second);

  expect(overlayOf(base, afterSecond).allocations).toHaveLength(2);
  const rebuilt = materialize(base, overlayOf(base, afterSecond));
  expect(rebuilt.payments[0].version).toBe(3);
  expect(getSnapshot(rebuilt).payments[0].unappliedCents).toBe(0);
});

test('an overlay over a base that already carries allocations slices past the base history', () => {
  const base = createSampleLedger();
  const before = structuredClone(base);
  const exact = sampleScenarios.exact;
  const proposal = createProposal(
    materialize(base, empty),
    {
      paymentId: exact.paymentId,
      lines: [{ invoiceId: exact.invoiceId, amountCents: 240000 }],
    },
    ids,
  );

  const next = applyProposal(materialize(base, empty), proposal);
  const overlay = overlayOf(base, next);
  const rebuilt = materialize(base, overlay);

  expect(base.allocations.length).toBeGreaterThan(0);
  expect(overlay.allocations).toHaveLength(1);
  expect(overlay.activities).toHaveLength(1);
  expect(rebuilt).toEqual(next);
  const payment = rebuilt.payments.find((p) => p.id === exact.paymentId);
  const invoice = rebuilt.invoices.find((i) => i.id === exact.invoiceId);
  expect(payment?.version).toBe(2);
  expect(invoice?.version).toBe(2);
  expect(rebuilt.payments[0].version).toBe(base.payments[0].version);
  expect(base).toEqual(before);
});

test('overlayOf rejects a ledger shorter than its base', () => {
  const base = createLedger();
  const proposal = createProposal(materialize(base, empty), request, ids);
  const next = applyProposal(materialize(base, empty), proposal);

  expect(() => overlayOf(next, base)).toThrow('overlay_base_mismatch');
});

/** One USD payment of $5,000 against two open invoices of $3,200 and $1,800. */
function twoInvoiceLedger(): Ledger {
  const record = { customerId: 'c', currency: 'USD', version: 1 };
  return {
    customers: [],
    payments: [{ ...record, id: 'payment', amountCents: 500000 }],
    invoices: [
      { ...record, id: 'invoice-a', amountCents: 320000 },
      { ...record, id: 'invoice-b', amountCents: 180000 },
    ],
    allocations: [],
    activities: [],
  };
}
const twoLines = {
  paymentId: 'payment',
  lines: [
    { invoiceId: 'invoice-a', amountCents: 320000 },
    { invoiceId: 'invoice-b', amountCents: 180000 },
  ],
};

test('a two-line proposal records each invoice version and the total', () => {
  const ledger = twoInvoiceLedger();

  const proposal = createProposal(ledger, twoLines, ids);

  expect(proposal.amountCents).toBe(500000);
  expect(proposal.lines).toEqual([
    { invoiceId: 'invoice-a', amountCents: 320000, expectedInvoiceVersion: 1 },
    { invoiceId: 'invoice-b', amountCents: 180000, expectedInvoiceVersion: 1 },
  ]);
});

test('approving a two-line proposal applies every line under one proposal and activity', () => {
  const ledger = twoInvoiceLedger();
  const proposal = createProposal(ledger, twoLines, ids);

  const next = applyProposal(ledger, proposal);

  expect(
    next.allocations.map((a) => [a.invoiceId, a.amountCents, a.proposalId]),
  ).toEqual([
    ['invoice-a', 320000, 'proposal-001'],
    ['invoice-b', 180000, 'proposal-001'],
  ]);
  expect(next.activities).toEqual([
    {
      operationId: 'operation-001',
      proposalId: 'proposal-001',
      description: 'Payment applied to 2 invoices',
    },
  ]);
  expect(getSnapshot(next).payments[0].unappliedCents).toBe(0);
  expect(next.payments[0].version).toBe(3);
  expect(materialize(ledger, overlayOf(ledger, next))).toEqual(next);
});

test.each([
  { name: 'no lines', lines: [], error: 'invalid_lines' },
  {
    name: 'more than ten lines',
    lines: Array.from({ length: 11 }, () => ({
      invoiceId: 'invoice-a',
      amountCents: 1,
    })),
    error: 'invalid_lines',
  },
  {
    name: 'a repeated invoice',
    lines: [
      { invoiceId: 'invoice-a', amountCents: 100 },
      { invoiceId: 'invoice-a', amountCents: 100 },
    ],
    error: 'duplicate_invoice',
  },
  {
    name: 'lines above the payment',
    lines: [
      { invoiceId: 'invoice-a', amountCents: 320000 },
      { invoiceId: 'invoice-b', amountCents: 180001 },
    ],
    error: 'insufficient_balance',
  },
])('rejects a proposal with $name', ({ lines, error }) => {
  const ledger = twoInvoiceLedger();

  expect(() =>
    createProposal(ledger, { paymentId: 'payment', lines }, ids),
  ).toThrow(error);
});

test('a stale version on any line blocks the whole approval', () => {
  const ledger = twoInvoiceLedger();
  const proposal = createProposal(ledger, twoLines, ids);
  const changed = {
    ...ledger,
    invoices: ledger.invoices.map((invoice) =>
      invoice.id === 'invoice-b' ? { ...invoice, version: 2 } : invoice,
    ),
  };

  expect(() => applyProposal(changed, proposal)).toThrow('stale_version');
});

test('fillLines gives each invoice what remains of the payment, in order', () => {
  const invoices = [
    { id: 'a', outstandingCents: 320000 },
    { id: 'b', outstandingCents: 180000 },
  ];

  const lines = fillLines(400000, invoices);

  expect(lines).toEqual([
    { invoiceId: 'a', amountCents: 320000 },
    { invoiceId: 'b', amountCents: 80000 },
  ]);
});

test('fillLines rejects an invoice the payment cannot reach', () => {
  const invoices = [
    { id: 'a', outstandingCents: 320000 },
    { id: 'b', outstandingCents: 180000 },
  ];

  expect(() => fillLines(320000, invoices)).toThrow('insufficient_balance');
});
