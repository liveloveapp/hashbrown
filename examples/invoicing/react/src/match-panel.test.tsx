import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import type { LedgerSnapshot } from '@invoicing/contracts';
import { MatchPanel } from './match-panel';
import { SnapshotContext } from './snapshot-context';

const invoice = (
  id: string,
  customerId: string,
  outstandingCents: number,
  date: string,
) => ({
  id,
  reference: `INV-${id.toUpperCase()}`,
  customerId,
  currency: 'USD',
  date,
  amountCents: outstandingCents,
  outstandingCents,
  version: 1,
});

const payment = (id: string, customerId: string, unappliedCents: number) => ({
  id,
  customerId,
  currency: 'USD',
  date: '2026-09-14',
  amountCents: unappliedCents,
  unappliedCents,
  version: 1,
});

const snapshot: LedgerSnapshot = {
  customers: [],
  invoices: [
    invoice('api', 'harbor', 320000, '2026-09-09'),
    invoice('mig', 'harbor', 180000, '2026-09-10'),
    invoice('old', 'harbor', 90000, '2026-08-01'),
    invoice('a1', 'atlas', 150000, '2026-09-10'),
    invoice('a2', 'atlas', 150000, '2026-09-11'),
  ],
  payments: [
    payment('harbor-pay', 'harbor', 500000),
    payment('atlas-pay', 'atlas', 150000),
    payment('summit-pay', 'summit', 300000),
    { ...payment('done-pay', 'harbor', 0), amountCents: 5000 },
  ],
  allocations: [],
  activities: [],
};

const withSnapshot = (ui: ReactNode) =>
  render(
    <SnapshotContext.Provider value={snapshot}>{ui}</SnapshotContext.Provider>,
  );

test('a payment that ties out starts with its invoices checked and reviews them in fill order', () => {
  cleanup();
  const onReview = vi.fn();
  withSnapshot(<MatchPanel paymentId="harbor-pay" onReview={onReview} />);

  fireEvent.click(screen.getByRole('button', { name: 'Review match' }));

  expect(
    screen.getByRole('checkbox', { name: 'Apply to INV-API' }),
  ).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Apply to INV-MIG' }),
  ).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Apply to INV-OLD' }),
  ).toBeDisabled();
  expect(screen.getByText('$5,000.00 of $5,000.00 ✓')).toBeVisible();
  expect(onReview).toHaveBeenCalledWith('harbor-pay', ['api', 'mig']);
});

test('the panel labels its columns and announces the total and later notices', () => {
  cleanup();

  withSnapshot(<MatchPanel paymentId="harbor-pay" onReview={vi.fn()} />);

  expect(
    screen.getAllByRole('columnheader').map((cell) => cell.textContent),
  ).toEqual(['Select', 'Invoice', 'Issued', 'Balance', 'Amount applied']);
  expect(screen.getByText('$5,000.00 of $5,000.00 ✓')).toHaveAttribute(
    'aria-live',
    'polite',
  );
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

test('review sends only the invoices that receive money', () => {
  cleanup();
  const onReview = vi.fn();
  const view = withSnapshot(
    <MatchPanel paymentId="harbor-pay" onReview={onReview} />,
  );
  const lower: LedgerSnapshot = {
    ...snapshot,
    payments: snapshot.payments.map((p) =>
      p.id === 'harbor-pay' ? { ...p, unappliedCents: 320000 } : p,
    ),
  };

  view.rerender(
    <SnapshotContext.Provider value={lower}>
      <MatchPanel paymentId="harbor-pay" onReview={onReview} />
    </SnapshotContext.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Review match' }));

  expect(
    screen.getByRole('checkbox', { name: 'Apply to INV-MIG' }),
  ).toBeChecked();
  expect(onReview).toHaveBeenCalledWith('harbor-pay', ['api']);
});

test('an ambiguous payment starts unchecked, and one choice uses up the cash', () => {
  cleanup();
  const onReview = vi.fn();
  withSnapshot(<MatchPanel paymentId="atlas-pay" onReview={onReview} />);
  expect(screen.getByRole('button', { name: 'Review match' })).toBeDisabled();

  fireEvent.click(screen.getByRole('checkbox', { name: 'Apply to INV-A2' }));

  expect(screen.getByText('$1,500.00 of $1,500.00 ✓')).toBeVisible();
  expect(
    screen.getByRole('checkbox', { name: 'Apply to INV-A1' }),
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Review match' })).toBeEnabled();
});

test('invoices fill in the order they were checked, the last taking what is left', () => {
  cleanup();
  const onReview = vi.fn();
  withSnapshot(<MatchPanel paymentId="harbor-pay" onReview={onReview} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Apply to INV-API' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Apply to INV-MIG' }));

  fireEvent.click(screen.getByRole('checkbox', { name: 'Apply to INV-OLD' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Apply to INV-API' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Apply to INV-MIG' }));
  fireEvent.click(screen.getByRole('button', { name: 'Review match' }));

  const migRow = screen
    .getByRole('checkbox', { name: 'Apply to INV-MIG' })
    .closest('tr') as HTMLElement;
  expect(migRow).toHaveTextContent('$1,800.00$900.00');
  expect(screen.getByText('$5,000.00 of $5,000.00 ✓')).toBeVisible();
  expect(onReview).toHaveBeenCalledWith('harbor-pay', ['old', 'api', 'mig']);
});

test('an advance explains there is nothing to match yet', () => {
  cleanup();

  withSnapshot(<MatchPanel paymentId="summit-pay" onReview={vi.fn()} />);

  expect(screen.getByText(/No open USD invoice for this client/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Review match' }),
  ).not.toBeInTheDocument();
});

test('a fully matched payment says so', () => {
  cleanup();

  withSnapshot(<MatchPanel paymentId="done-pay" onReview={vi.fn()} />);

  expect(screen.getByText('This payment is fully matched.')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Review match' }),
  ).not.toBeInTheDocument();
});

test('without an assistant the review stays off, and a notice is announced', () => {
  cleanup();

  withSnapshot(<MatchPanel paymentId="harbor-pay" notice="Busy." />);

  expect(screen.getByRole('button', { name: 'Review match' })).toBeDisabled();
  expect(
    screen.getByText('Matching opens once the assistant is connected.'),
  ).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Busy.');
});
