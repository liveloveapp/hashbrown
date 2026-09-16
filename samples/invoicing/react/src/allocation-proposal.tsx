import { createContext, useContext } from 'react';
import type { Proposal } from '@invoicing/contracts';

/** Application-owned proposal review data and decision callbacks. */
export interface AllocationProposalReview {
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

  const disabled = !review.pendingForProposal || review.isApplying;
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: proposal.currency,
  }).format(proposal.amountCents / 100);

  return (
    <section className="selection-summary" aria-label="Allocation proposal">
      <h3>Allocate payment</h3>
      <dl>
        <dt>Payment</dt>
        <dd>{proposal.paymentId}</dd>
        <dt>Invoice</dt>
        <dd>{proposal.invoiceId}</dd>
        <dt>Amount</dt>
        <dd>{amount}</dd>
        <dt>Currency</dt>
        <dd>{proposal.currency}</dd>
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
