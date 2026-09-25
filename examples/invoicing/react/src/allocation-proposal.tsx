import { createContext, Fragment, useContext } from 'react';
import type { LedgerSnapshot, Proposal } from '@invoicing/contracts';

/** Application-owned proposal review data and decision callbacks. */
export interface AllocationProposalReview {
  /** Trusted ledger records used only for display labels. */
  readonly snapshot?: LedgerSnapshot;
  readonly verifiedProposal: Proposal | undefined;
  readonly selectedPaymentId: string | undefined;
  /**
   * UI readiness derived from the application's owned batch and verified server
   * thread review. This flag is not authorization; the server checks decisions.
   */
  readonly pendingForProposal: boolean;
  readonly isApplying: boolean;
  /** Approves the original reviewed batch captured by the application. */
  readonly onApprove: () => void;
  /** Declines the original reviewed batch captured by the application. */
  readonly onDecline: () => void;
}

/** Trusted review state supplied by the application, never by model props. */
export const AllocationProposalContext = createContext<
  AllocationProposalReview | undefined
>(undefined);

/** The identity-only props exposed to the model. */
export interface AllocationProposalProps {
  readonly proposalId: string;
}

/** Renders a server-owned allocation proposal for review. */
export function AllocationProposal({ proposalId }: AllocationProposalProps) {
  const review = useContext(AllocationProposalContext);
  const proposal = review?.verifiedProposal;

  if (!review || !proposal) {
    return <p role="status">Waiting for proposal…</p>;
  }
  if (
    !proposalId ||
    proposalId !== proposal.proposalId ||
    review.selectedPaymentId !== proposal.paymentId
  ) {
    return <p role="status">Proposal unavailable for the selected payment.</p>;
  }

  const payment = review.snapshot?.payments.find(
    (record) =>
      record.id === proposal.paymentId &&
      record.customerId === proposal.customerId,
  );
  const invoiceReference = (invoiceId: string) =>
    review.snapshot?.invoices.find(
      (record) =>
        record.id === invoiceId && record.customerId === proposal.customerId,
    )?.reference;
  const firstInvoice = review.snapshot?.invoices.find(
    (record) =>
      record.id === proposal.lines[0]?.invoiceId &&
      record.customerId === proposal.customerId,
  );
  const disabled = !review.pendingForProposal || review.isApplying;
  const format = (cents: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: proposal.currency,
    }).format(cents / 100);
  // What the payment keeps after this allocation; unknown without its record.
  const leftCents = payment
    ? Math.max(0, payment.unappliedCents - proposal.amountCents)
    : undefined;

  return (
    <section
      className="selection-summary proposal-card"
      aria-label="Allocation proposal"
    >
      <h3>Allocate payment</h3>
      <dl>
        <dt>Client</dt>
        <dd>
          {payment?.customerName ??
            firstInvoice?.customerName ??
            'Unknown client'}
        </dd>
        <dt>Payment</dt>
        <dd>{payment?.reference ?? 'No reference'}</dd>
        {proposal.lines.length === 1 ? (
          <>
            <dt>Invoice</dt>
            <dd>
              {invoiceReference(proposal.lines[0].invoiceId) ?? 'No reference'}
            </dd>
            <dt>Amount</dt>
            <dd>{format(proposal.amountCents)}</dd>
          </>
        ) : (
          <>
            {proposal.lines.map((line) => (
              <Fragment key={line.invoiceId}>
                <dt>{invoiceReference(line.invoiceId) ?? 'No reference'}</dt>
                <dd>{format(line.amountCents)}</dd>
              </Fragment>
            ))}
            <dt>Total</dt>
            <dd>{format(proposal.amountCents)}</dd>
          </>
        )}
        {leftCents !== undefined && (
          <>
            <dt>Left unapplied</dt>
            <dd>{format(leftCents)}</dd>
          </>
        )}
      </dl>
      <p role="status">
        {review.isApplying
          ? 'Applying decision…'
          : review.pendingForProposal
            ? 'Review this allocation before applying it.'
            : 'This proposal is not awaiting a decision.'}
      </p>
      <button
        type="button"
        className="primary"
        disabled={disabled}
        onClick={() => review.onApprove()}
      >
        Approve and apply
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => review.onDecline()}
      >
        Decline
      </button>
    </section>
  );
}
