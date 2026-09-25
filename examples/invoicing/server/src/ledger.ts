import type {
  Ledger,
  LedgerOverlay,
  LedgerSnapshot,
  MoneyRecord,
  Proposal,
  ProposalLineRequest,
  ProposalRequest,
} from '@invoicing/contracts';

/** Create the deterministic sample ledger with no allocations. */
export function createLedger(): Ledger {
  const record = {
    customerId: 'customer-001',
    currency: 'USD',
    amountCents: 240000,
    version: 1,
  };
  return {
    customers: [
      {
        id: 'customer-001',
        name: 'Customer 001',
        currency: 'USD',
        profile: 'on-time',
      },
    ],
    payments: [{ ...record, id: 'payment-001' }],
    invoices: [{ ...record, id: 'invoice-001' }],
    allocations: [],
    activities: [],
  };
}

/** Derive remaining balances without modifying the canonical ledger. */
export function getSnapshot(ledger: Ledger): LedgerSnapshot {
  return {
    ...ledger,
    payments: ledger.payments.map((payment) => ({
      ...payment,
      unappliedCents:
        payment.amountCents -
        ledger.allocations
          .filter((a) => a.paymentId === payment.id)
          .reduce((sum, a) => sum + a.amountCents, 0),
    })),
    invoices: ledger.invoices.map((invoice) => ({
      ...invoice,
      outstandingCents:
        invoice.amountCents -
        ledger.allocations
          .filter((a) => a.invoiceId === invoice.id)
          .reduce((sum, a) => sum + a.amountCents, 0),
    })),
  };
}

/**
 * The ledger one session sees: the shared base plus that session's own
 * allocations. Record versions advance once per overlay allocation touching
 * them, which is exactly how `applyProposal` advances them, so a ledger
 * produced by applying proposals and the same ledger rebuilt from its overlay
 * are equal.
 */
export function materialize(base: Ledger, overlay: LedgerOverlay): Ledger {
  const advance = <T extends MoneyRecord>(
    record: T,
    key: 'paymentId' | 'invoiceId',
  ): T => {
    const bumps = overlay.allocations.filter(
      (a) => a[key] === record.id,
    ).length;
    return bumps === 0
      ? record
      : { ...record, version: record.version + bumps };
  };
  return {
    customers: base.customers,
    payments: base.payments.map((p) => advance(p, 'paymentId')),
    invoices: base.invoices.map((i) => advance(i, 'invoiceId')),
    allocations: [...base.allocations, ...overlay.allocations],
    activities: [...base.activities, ...overlay.activities],
  };
}

/**
 * The overlay that materializes over `base` into `ledger`. Only meaningful
 * for a ledger produced by applying proposals to `materialize(base, …)`,
 * which appends and never reorders.
 */
export function overlayOf(base: Ledger, ledger: Ledger): LedgerOverlay {
  if (
    ledger.allocations.length < base.allocations.length ||
    ledger.activities.length < base.activities.length
  )
    throw new Error('overlay_base_mismatch');
  return {
    allocations: ledger.allocations.slice(base.allocations.length),
    activities: ledger.activities.slice(base.activities.length),
  };
}

/** The most invoices one proposal may allocate across. */
export const MAX_PROPOSAL_LINES = 10;

/**
 * Fill invoices in order from a payment's unapplied cents: each receives the
 * smaller of what is left and its outstanding balance. An invoice the payment
 * cannot reach is an error, never a silently dropped line.
 */
export function fillLines(
  unappliedCents: number,
  invoices: readonly {
    readonly id: string;
    readonly outstandingCents: number;
  }[],
): ProposalLineRequest[] {
  let remaining = unappliedCents;
  return invoices.map((invoice) => {
    const amountCents = Math.min(remaining, invoice.outstandingCents);
    if (amountCents <= 0) throw new Error('insufficient_balance');
    remaining -= amountCents;
    return { invoiceId: invoice.id, amountCents };
  });
}

/** Validate an allocation and capture versions using server-owned identities. */
export function createProposal(
  ledger: Ledger,
  request: ProposalRequest,
  ids: Pick<Proposal, 'proposalId' | 'operationId' | 'generation'>,
): Proposal {
  const snapshot = getSnapshot(ledger);
  if (
    !Array.isArray(request.lines) ||
    request.lines.length === 0 ||
    request.lines.length > MAX_PROPOSAL_LINES
  )
    throw new Error('invalid_lines');
  const invoiceIds = request.lines.map((line) => line.invoiceId);
  if (new Set(invoiceIds).size !== invoiceIds.length)
    throw new Error('duplicate_invoice');
  const payment = snapshot.payments.find(
    (record) => record.id === request.paymentId,
  );
  const invoices = request.lines.map((line) =>
    snapshot.invoices.find((record) => record.id === line.invoiceId),
  );
  if (!payment || invoices.some((invoice) => !invoice))
    throw new Error('record_not_found');
  const lines = request.lines.map((line, index) => {
    const invoice = invoices[index] as (typeof snapshot.invoices)[number];
    if (
      payment.currency !== invoice.currency ||
      payment.customerId !== invoice.customerId
    )
      throw new Error('incompatible_records');
    if (!Number.isSafeInteger(line.amountCents) || line.amountCents <= 0)
      throw new Error('invalid_amount');
    if (line.amountCents > invoice.outstandingCents)
      throw new Error('insufficient_balance');
    return {
      invoiceId: invoice.id,
      amountCents: line.amountCents,
      expectedInvoiceVersion: invoice.version,
    };
  });
  const amountCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  if (amountCents > payment.unappliedCents)
    throw new Error('insufficient_balance');
  return {
    paymentId: payment.id,
    lines,
    amountCents,
    proposalId: ids.proposalId,
    operationId: ids.operationId,
    generation: ids.generation,
    proposalVersion: 1,
    expectedPaymentVersion: payment.version,
    customerId: payment.customerId,
    currency: payment.currency,
  };
}

/** Atomically compute the ledger after an already stored proposal is approved. */
export function applyProposal(ledger: Ledger, proposal: Proposal): Ledger {
  const payment = ledger.payments.find(
    (record) => record.id === proposal.paymentId,
  );
  const expected = new Map(
    proposal.lines.map((line) => [line.invoiceId, line.expectedInvoiceVersion]),
  );
  if (
    payment?.version !== proposal.expectedPaymentVersion ||
    proposal.lines.some(
      (line) =>
        ledger.invoices.find((record) => record.id === line.invoiceId)
          ?.version !== line.expectedInvoiceVersion,
    )
  )
    throw new Error('stale_version');
  const validated = createProposal(ledger, proposal, proposal);
  if (
    validated.currency !== proposal.currency ||
    validated.customerId !== proposal.customerId
  )
    throw new Error('incompatible_records');
  const count = proposal.lines.length;
  return {
    customers: ledger.customers,
    payments: ledger.payments.map((record) =>
      record.id === proposal.paymentId
        ? { ...record, version: record.version + count }
        : record,
    ),
    invoices: ledger.invoices.map((record) =>
      expected.has(record.id)
        ? { ...record, version: record.version + 1 }
        : record,
    ),
    allocations: [
      ...ledger.allocations,
      ...proposal.lines.map((line) => ({
        paymentId: proposal.paymentId,
        invoiceId: line.invoiceId,
        amountCents: line.amountCents,
        proposalId: proposal.proposalId,
      })),
    ],
    activities: [
      ...ledger.activities,
      {
        operationId: proposal.operationId,
        proposalId: proposal.proposalId,
        description:
          count === 1
            ? 'Payment applied to invoice'
            : `Payment applied to ${count} invoices`,
      },
    ],
  };
}
