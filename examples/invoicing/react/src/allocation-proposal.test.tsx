import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Proposal } from '@invoicing/contracts';
import { expect, test, vi } from 'vitest';
import {
  AllocationProposal,
  AllocationProposalContext,
  type AllocationProposalReview,
} from './allocation-proposal';

const proposal: Proposal = Object.freeze({
  proposalId: 'proposal-001',
  operationId: 'operation-001',
  generation: 1,
  proposalVersion: 1,
  expectedPaymentVersion: 1,
  customerId: 'customer-001',
  paymentId: 'payment-001',
  lines: [
    {
      invoiceId: 'invoice-001',
      amountCents: 240000,
      expectedInvoiceVersion: 1,
    },
  ],
  amountCents: 240000,
  currency: 'USD',
});

function review(overrides: Partial<AllocationProposalReview> = {}) {
  return {
    verifiedProposal: proposal,
    selectedPaymentId: proposal.paymentId,
    pendingForProposal: true,
    isApplying: false,
    onApprove: vi.fn(),
    onDecline: vi.fn(),
    ...overrides,
  };
}

function renderProposal(
  value: AllocationProposalReview,
  proposalId = proposal.proposalId,
) {
  return render(
    <AllocationProposalContext.Provider value={value}>
      <AllocationProposal proposalId={proposalId} />
    </AllocationProposalContext.Provider>,
  );
}

test('shows waiting state without a trusted review provider', () => {
  cleanup();

  render(<AllocationProposal proposalId={proposal.proposalId} />);

  expect(screen.getByRole('status')).toHaveTextContent('Waiting for proposal');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('waits for a verified server proposal before showing actions', () => {
  cleanup();
  const value = review({ verifiedProposal: undefined });

  renderProposal(value);

  expect(screen.getByRole('status')).toHaveTextContent('Waiting for proposal');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('does not expose server values or approval for an unknown model proposal ID', () => {
  cleanup();
  const value = review();

  renderProposal(value, 'model-invented-proposal');

  expect(screen.getByRole('status')).toHaveTextContent('Proposal unavailable');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByText('$2,400.00')).not.toBeInTheDocument();
});

test('keeps incomplete streaming proposal IDs unavailable', () => {
  cleanup();
  const value = review();

  const { rerender } = renderProposal(value, '');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  rerender(
    <AllocationProposalContext.Provider value={value}>
      <AllocationProposal proposalId="proposal-" />
    </AllocationProposalContext.Provider>,
  );

  expect(screen.getByRole('status')).toHaveTextContent('Proposal unavailable');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('does not show approval when the selected payment changes', () => {
  cleanup();
  const value = review({ selectedPaymentId: 'payment-002' });

  renderProposal(value);

  expect(screen.getByRole('status')).toHaveTextContent('Proposal unavailable');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('disables both actions without a pending review for this proposal', () => {
  cleanup();
  const value = review({ pendingForProposal: false });
  renderProposal(value);

  fireEvent.click(screen.getByRole('button', { name: 'Approve and apply' }));
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

  expect(
    screen.getByRole('button', { name: 'Approve and apply' }),
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
  expect(value.onApprove).not.toHaveBeenCalled();
  expect(value.onDecline).not.toHaveBeenCalled();
});

test('disables both actions while the decision is applying', () => {
  cleanup();
  const value = review({ isApplying: true });
  renderProposal(value);

  fireEvent.click(screen.getByRole('button', { name: 'Approve and apply' }));
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

  expect(
    screen.getByRole('button', { name: 'Approve and apply' }),
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
  expect(value.onApprove).not.toHaveBeenCalled();
  expect(value.onDecline).not.toHaveBeenCalled();
});

test('renders immutable server amounts and invokes each owned decision callback once without arguments', () => {
  cleanup();
  const value = review();
  renderProposal(value);

  fireEvent.click(screen.getByRole('button', { name: 'Approve and apply' }));
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

  expect(screen.getByText('$2,400.00')).toBeVisible();
  expect(value.onApprove).toHaveBeenCalledTimes(1);
  expect(value.onApprove).toHaveBeenCalledWith();
  expect(value.onDecline).toHaveBeenCalledTimes(1);
  expect(value.onDecline).toHaveBeenCalledWith();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('uses only matching application records for readable client and references', () => {
  cleanup();
  const value = review({
    snapshot: {
      payments: [
        {
          id: proposal.paymentId,
          customerId: proposal.customerId,
          customerName: 'Northstar Labs',
          reference: 'PAY-2026-01',
          currency: 'USD',
          amountCents: 240000,
          unappliedCents: 240000,
          version: 1,
        },
      ],
      invoices: [
        {
          id: proposal.lines[0].invoiceId,
          customerId: proposal.customerId,
          reference: 'INV-2026-01',
          currency: 'USD',
          amountCents: 240000,
          outstandingCents: 240000,
          version: 1,
        },
      ],
      customers: [],
      allocations: [],
      activities: [],
    },
  });

  renderProposal(value);

  expect(screen.getByText('Northstar Labs')).toBeVisible();
  expect(screen.getByText('PAY-2026-01')).toBeVisible();
  expect(screen.getByText('INV-2026-01')).toBeVisible();
  expect(screen.queryByText('payment-001')).not.toBeInTheDocument();
  expect(screen.queryByText('invoice-001')).not.toBeInTheDocument();
});

test('never falls back to internal IDs when records lack a reference', () => {
  cleanup();
  const value = review();

  renderProposal(value);

  expect(screen.queryByText('customer-001')).not.toBeInTheDocument();
  expect(screen.queryByText('payment-001')).not.toBeInTheDocument();
  expect(screen.queryByText('invoice-001')).not.toBeInTheDocument();
  expect(screen.getAllByText('No reference')).toHaveLength(2);
});

test('shows what stays unapplied on the payment after this allocation', () => {
  cleanup();
  const value = review({
    snapshot: {
      payments: [
        {
          id: proposal.paymentId,
          customerId: proposal.customerId,
          reference: 'PAY-2026-01',
          currency: 'USD',
          amountCents: 500000,
          unappliedCents: 500000,
          version: 1,
        },
      ],
      invoices: [],
      customers: [],
      allocations: [],
      activities: [],
    },
  });

  renderProposal(value);

  const left = screen.getByText('Left unapplied');
  expect(left.nextElementSibling).toHaveTextContent('$2,600.00');
});

test('lists each invoice of a combined allocation with its amount and the total', () => {
  cleanup();
  const record = {
    customerId: proposal.customerId,
    currency: 'USD',
    version: 1,
  };
  const value = review({
    verifiedProposal: {
      ...proposal,
      amountCents: 500000,
      lines: [
        {
          invoiceId: 'invoice-a',
          amountCents: 320000,
          expectedInvoiceVersion: 1,
        },
        {
          invoiceId: 'invoice-b',
          amountCents: 180000,
          expectedInvoiceVersion: 1,
        },
      ],
    },
    snapshot: {
      payments: [
        {
          ...record,
          id: proposal.paymentId,
          reference: 'PAY-1',
          amountCents: 500000,
          unappliedCents: 500000,
        },
      ],
      invoices: [
        {
          ...record,
          id: 'invoice-a',
          reference: 'INV-A',
          amountCents: 320000,
          outstandingCents: 320000,
        },
        {
          ...record,
          id: 'invoice-b',
          reference: 'INV-B',
          amountCents: 180000,
          outstandingCents: 180000,
        },
      ],
      customers: [],
      allocations: [],
      activities: [],
    },
  });

  renderProposal(value);

  expect(screen.getByText('INV-A').nextElementSibling).toHaveTextContent(
    '$3,200.00',
  );
  expect(screen.getByText('INV-B').nextElementSibling).toHaveTextContent(
    '$1,800.00',
  );
  expect(screen.getByText('Total').nextElementSibling).toHaveTextContent(
    '$5,000.00',
  );
  expect(
    screen.getByText('Left unapplied').nextElementSibling,
  ).toHaveTextContent('$0.00');
});

test('makes approving the primary action and declining the secondary one', () => {
  cleanup();
  renderProposal(review());

  const approve = screen.getByRole('button', { name: 'Approve and apply' });
  const decline = screen.getByRole('button', { name: 'Decline' });

  expect(approve).toHaveClass('primary');
  expect(decline).not.toHaveClass('primary');
});
