import type {
  Ledger,
  LedgerSnapshot,
  Proposal,
  ProposalRequest,
} from './contracts';

/** Create the deterministic sample ledger with no allocations. */
export function createLedger(): Ledger {
  const record = {
    customerId: 'customer-001',
    currency: 'USD',
    amountCents: 240000,
    version: 1,
  };
  return {
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

/** Validate an allocation and capture versions using server-owned identities. */
export function createProposal(
  ledger: Ledger,
  request: ProposalRequest,
  ids: Pick<Proposal, 'proposalId' | 'operationId' | 'generation'>,
): Proposal {
  const snapshot = getSnapshot(ledger);
  const payment = snapshot.payments.find(
    (record) => record.id === request.paymentId,
  );
  const invoice = snapshot.invoices.find(
    (record) => record.id === request.invoiceId,
  );
  if (!payment || !invoice) throw new Error('record_not_found');
  if (
    payment.currency !== invoice.currency ||
    payment.customerId !== invoice.customerId
  )
    throw new Error('incompatible_records');
  if (!Number.isSafeInteger(request.amountCents) || request.amountCents <= 0)
    throw new Error('invalid_amount');
  if (
    request.amountCents > payment.unappliedCents ||
    request.amountCents > invoice.outstandingCents
  )
    throw new Error('insufficient_balance');
  return {
    paymentId: payment.id,
    invoiceId: invoice.id,
    amountCents: request.amountCents,
    proposalId: ids.proposalId,
    operationId: ids.operationId,
    generation: ids.generation,
    proposalVersion: 1,
    expectedPaymentVersion: payment.version,
    expectedInvoiceVersion: invoice.version,
    customerId: payment.customerId,
    currency: payment.currency,
  };
}

/** Atomically compute the ledger after an already stored proposal is approved. */
export function applyProposal(ledger: Ledger, proposal: Proposal): Ledger {
  const payment = ledger.payments.find(
    (record) => record.id === proposal.paymentId,
  );
  const invoice = ledger.invoices.find(
    (record) => record.id === proposal.invoiceId,
  );
  if (
    payment?.version !== proposal.expectedPaymentVersion ||
    invoice?.version !== proposal.expectedInvoiceVersion
  )
    throw new Error('stale_version');
  const validated = createProposal(ledger, proposal, proposal);
  if (
    validated.currency !== proposal.currency ||
    validated.customerId !== proposal.customerId
  )
    throw new Error('incompatible_records');
  return {
    payments: ledger.payments.map((record) =>
      record.id === proposal.paymentId
        ? { ...record, version: record.version + 1 }
        : record,
    ),
    invoices: ledger.invoices.map((record) =>
      record.id === proposal.invoiceId
        ? { ...record, version: record.version + 1 }
        : record,
    ),
    allocations: [
      ...ledger.allocations,
      {
        paymentId: proposal.paymentId,
        invoiceId: proposal.invoiceId,
        amountCents: proposal.amountCents,
        proposalId: proposal.proposalId,
      },
    ],
    activities: [
      ...ledger.activities,
      {
        operationId: proposal.operationId,
        proposalId: proposal.proposalId,
        description: 'Payment applied to invoice',
      },
    ],
  };
}
