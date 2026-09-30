import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import type {
  ClientRow,
  InvoiceRow,
  LedgerSnapshot,
  PaymentRow,
} from '@invoicing/contracts';
import { FocusBand } from './focus-band';
import { SnapshotContext } from './snapshot-context';

const snapshot: LedgerSnapshot = {
  customers: [
    {
      id: 'thistle',
      name: 'Thistle Retail',
      currency: 'GBP',
      profile: 'late-drifting',
    },
  ],
  invoices: [
    {
      id: 't1',
      customerId: 'thistle',
      reference: 'INV-T1',
      date: '2026-07-20',
      currency: 'GBP',
      amountCents: 200000,
      outstandingCents: 200000,
      version: 1,
    },
  ],
  payments: [],
  allocations: [],
  activities: [],
};

const thistle: ClientRow = {
  id: 'thistle',
  name: 'Thistle Retail',
  currency: 'GBP',
  profile: 'late-drifting',
  openCents: 200000,
  overdueCents: 200000,
  aging: {
    current: 0,
    days1to30: 200000,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
  },
  openInvoiceCount: 1,
  averageDaysToPay: null,
  unappliedCents: 0,
};

const invoice: InvoiceRow = {
  id: 't1',
  reference: 'INV-T1',
  clientId: 'thistle',
  clientName: 'Thistle Retail',
  currency: 'GBP',
  type: 'One-off',
  issued: '2026-07-20',
  amountCents: 200000,
  balanceCents: 200000,
  daysOverdue: 27,
  bucket: 'days1to30',
  status: { kind: 'overdue', days: 27 },
};

const withSnapshot = (ui: ReactNode) =>
  render(
    <SnapshotContext.Provider value={snapshot}>{ui}</SnapshotContext.Provider>,
  );

test('with nothing focused the band charts the whole currency', () => {
  cleanup();

  withSnapshot(<FocusBand currency="USD" onClear={vi.fn()} />);

  expect(
    screen.getByRole('heading', { name: 'All USD clients' }),
  ).toBeVisible();
  expect(
    screen.getByRole('figure', { name: /Invoiced vs received · USD$/ }),
  ).toBeVisible();
  expect(screen.getByRole('figure', { name: /Aging · USD$/ })).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Clear focus' }),
  ).not.toBeInTheDocument();
});

test('a focused client names its habit, charts only that client, and can be cleared', () => {
  cleanup();
  const onClear = vi.fn();
  withSnapshot(<FocusBand currency="GBP" client={thistle} onClear={onClear} />);

  fireEvent.click(screen.getByRole('button', { name: 'Clear focus' }));

  expect(screen.getByRole('heading', { name: 'Thistle Retail' })).toBeVisible();
  expect(screen.getByText('Late, drifting')).toBeVisible();
  expect(
    screen.getByRole('figure', { name: 'Aging · GBP · thistle' }),
  ).toBeVisible();
  expect(onClear).toHaveBeenCalledOnce();
});

test('a focused invoice is named and its age bucket is outlined', () => {
  cleanup();

  const { container } = withSnapshot(
    <FocusBand
      currency="GBP"
      client={thistle}
      invoice={invoice}
      onClear={vi.fn()}
    />,
  );

  expect(screen.getByText('INV-T1 · £2,000 open')).toBeVisible();
  expect(container.querySelector('.band-charts')).toHaveAttribute(
    'data-outline-bucket',
    'days1to30',
  );
});

test('a focused payment swaps the aging chart for the match panel', () => {
  cleanup();
  const withPayment: LedgerSnapshot = {
    ...snapshot,
    payments: [
      {
        id: 'tp',
        customerId: 'thistle',
        reference: 'BACS THISTLE',
        date: '2026-09-12',
        currency: 'GBP',
        amountCents: 200000,
        unappliedCents: 200000,
        version: 1,
      },
    ],
  };
  const payment: PaymentRow = {
    id: 'tp',
    reference: 'BACS THISTLE',
    payerId: 'thistle',
    payerName: 'Thistle Retail',
    currency: 'GBP',
    received: '2026-09-12',
    amountCents: 200000,
    appliedCents: 0,
    unappliedCents: 200000,
    ageDays: 3,
    status: 'unmatched',
  };

  render(
    <SnapshotContext.Provider value={withPayment}>
      <FocusBand
        currency="GBP"
        client={thistle}
        payment={payment}
        match={{ onReview: vi.fn() }}
        onClear={vi.fn()}
      />
    </SnapshotContext.Provider>,
  );

  expect(screen.getByText('BACS THISTLE · £2,000 unapplied')).toBeVisible();
  expect(
    screen.getByRole('region', { name: 'Match this payment' }),
  ).toBeVisible();
  expect(
    screen.getByRole('checkbox', { name: 'Apply to INV-T1' }),
  ).toBeChecked();
  expect(
    screen.queryByRole('figure', { name: /Aging/ }),
  ).not.toBeInTheDocument();
});
