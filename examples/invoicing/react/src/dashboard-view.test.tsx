import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import type { LedgerSnapshot } from '@invoicing/contracts';
import { DashboardView } from './dashboard-view';
import { DEFAULT_FOCUS, type Focus, focusReducer } from './focus';

const snapshot: LedgerSnapshot = {
  customers: [
    { id: 'acme', name: 'Acme', currency: 'USD', profile: 'on-time' },
    { id: 'birch', name: 'Birch', currency: 'USD', profile: 'late-fixed' },
    {
      id: 'thistle',
      name: 'Thistle Retail',
      currency: 'GBP',
      profile: 'late-drifting',
    },
  ],
  invoices: [
    {
      id: 'a1',
      customerId: 'acme',
      reference: 'INV-A1',
      date: '2026-09-01',
      currency: 'USD',
      amountCents: 50000,
      outstandingCents: 50000,
      version: 1,
    },
    {
      id: 'b1',
      customerId: 'birch',
      reference: 'INV-B1',
      date: '2026-06-01',
      currency: 'USD',
      amountCents: 90000,
      outstandingCents: 90000,
      version: 1,
    },
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
    {
      id: 't2',
      customerId: 'thistle',
      reference: 'INV-T2',
      date: '2026-09-10',
      currency: 'GBP',
      amountCents: 100000,
      outstandingCents: 100000,
      version: 1,
    },
  ],
  payments: [
    {
      id: 'pb',
      customerId: 'birch',
      reference: 'ACH BIRCH',
      date: '2026-09-12',
      currency: 'USD',
      amountCents: 90000,
      unappliedCents: 90000,
      version: 1,
    },
    {
      id: 'pa',
      customerId: 'acme',
      reference: 'ACH ACME',
      date: '2026-09-13',
      currency: 'USD',
      amountCents: 10000,
      unappliedCents: 10000,
      version: 1,
    },
  ],
  allocations: [],
  activities: [],
};

function Harness({
  initial = DEFAULT_FOCUS,
  onReview,
}: {
  readonly initial?: Focus;
  readonly onReview?: (
    paymentId: string,
    invoiceIds: readonly string[],
  ) => void;
}) {
  const [focus, setFocus] = useState(initial);
  return (
    <DashboardView
      snapshot={snapshot}
      focus={focus}
      onFocus={(action) => setFocus((current) => focusReducer(current, action))}
      match={{ onReview }}
      gridHeight={600}
    />
  );
}

const strip = () => screen.getByRole('region', { name: 'Ledger totals' });

test('opens on the Clients tab with the USD portfolio in the band', () => {
  cleanup();

  render(<Harness />);

  expect(screen.getByRole('tab', { name: /Clients/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(
    screen.getByRole('heading', { name: 'All USD clients' }),
  ).toBeVisible();
  expect(within(strip()).getByText('$1,400')).toBeVisible();
});

test('selecting a client row focuses the band and strip and locks the switcher', () => {
  cleanup();
  render(<Harness />);

  fireEvent.click(screen.getByText('Thistle Retail'));

  expect(screen.getByRole('heading', { name: 'Thistle Retail' })).toBeVisible();
  expect(within(strip()).getByText('£3,000')).toBeVisible();
  expect(screen.getByRole('button', { name: 'USD' })).toBeDisabled();
});

test('Escape clears the focus', () => {
  cleanup();
  render(<Harness initial={{ ...DEFAULT_FOCUS, clientId: 'thistle' }} />);

  fireEvent.keyDown(screen.getByRole('treegrid', { name: 'Clients' }), {
    key: 'Escape',
  });

  expect(
    screen.getByRole('heading', { name: 'All USD clients' }),
  ).toBeVisible();
});

test('key 2 opens Invoices, still scoped to the focused client', () => {
  cleanup();
  render(
    <Harness
      initial={{ ...DEFAULT_FOCUS, clientId: 'thistle', scoped: true }}
    />,
  );

  fireEvent.keyDown(screen.getByRole('treegrid', { name: 'Clients' }), {
    key: '2',
  });

  expect(screen.getByRole('tab', { name: /Invoices/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(screen.getByText('INV-T1')).toBeVisible();
  expect(screen.queryByText('INV-A1')).not.toBeInTheDocument();
});

test('selecting an invoice focuses its client and outlines its age bucket', () => {
  cleanup();
  const { container } = render(
    <Harness initial={{ ...DEFAULT_FOCUS, tab: 'invoices' }} />,
  );

  fireEvent.click(screen.getByText('INV-T1'));

  expect(screen.getByRole('heading', { name: 'Thistle Retail' })).toBeVisible();
  expect(container.querySelector('.band-charts')).toHaveAttribute(
    'data-outline-bucket',
    'days1to30',
  );
});

test('key 4 opens Unapplied with a hint, and a payment row opens the match panel', () => {
  cleanup();
  const onReview = vi.fn();
  render(<Harness onReview={onReview} />);
  fireEvent.keyDown(screen.getByRole('treegrid', { name: 'Clients' }), {
    key: '4',
  });
  expect(screen.getByText('Exact: INV-B1')).toBeVisible();

  fireEvent.click(screen.getByText('ACH BIRCH'));
  fireEvent.click(screen.getByRole('button', { name: 'Review match' }));

  expect(screen.getByRole('tab', { name: /Unapplied/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(screen.getByRole('heading', { name: 'Birch' })).toBeVisible();
  expect(screen.getByText('ACH BIRCH · $900 unapplied')).toBeVisible();
  expect(
    screen.getByRole('checkbox', { name: 'Apply to INV-B1' }),
  ).toBeChecked();
  expect(onReview).toHaveBeenCalledWith('pb', ['b1']);
});

test('picking a payment from the full Unapplied list keeps the other payments listed', () => {
  cleanup();
  render(<Harness initial={{ ...DEFAULT_FOCUS, tab: 'unapplied' }} />);

  fireEvent.click(screen.getByText('ACH BIRCH'));

  expect(screen.getByText('ACH BIRCH · $900 unapplied')).toBeVisible();
  expect(screen.getByText('ACH ACME')).toBeVisible();
});
