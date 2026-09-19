import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, test } from 'vitest';
import { s, ɵcreateUiKit } from '@hashbrownai/core';
import {
  assistantResponseSchema,
  type LedgerSnapshot,
} from '@invoicing/contracts';
import {
  AgingSummary,
  assistantKit,
  AssistantText,
  CustomerCard,
  LedgerTable,
  TrendChart,
} from './assistant-kit';
import { SnapshotContext } from './snapshot-context';

afterEach(cleanup);

const snapshot: LedgerSnapshot = {
  customers: [
    { id: 'c', name: 'Cedar Health', currency: 'USD', profile: 'on-time' },
  ],
  payments: [
    {
      id: 'p',
      customerId: 'c',
      customerName: 'Cedar Health',
      currency: 'USD',
      amountCents: 10000,
      unappliedCents: 10000,
      reference: 'ACH 1',
      date: '2026-09-10',
      version: 1,
    },
  ],
  invoices: [
    {
      id: 'i',
      customerId: 'c',
      customerName: 'Cedar Health',
      currency: 'USD',
      amountCents: 25000,
      outstandingCents: 25000,
      reference: 'INV-1',
      date: '2026-07-01',
      version: 1,
    },
    {
      id: 'i2',
      customerId: 'c',
      customerName: 'Cedar Health',
      currency: 'USD',
      amountCents: 5000,
      outstandingCents: 0,
      reference: 'INV-2',
      date: '2026-08-01',
      version: 1,
    },
  ],
  allocations: [],
  activities: [],
};

const withSnapshot = (ui: ReactNode) =>
  render(
    <SnapshotContext.Provider value={snapshot}>{ui}</SnapshotContext.Provider>,
  );

test('AssistantText renders prose and its children', () => {
  withSnapshot(
    <AssistantText text="Hello">
      <CustomerCard customerId="c" />
    </AssistantText>,
  );

  expect(screen.getByText('Hello')).toBeVisible();
  expect(screen.getByText('Cedar Health')).toBeVisible();
});

test('LedgerTable renders a Pretable grid of resolved rows and reports missing ones', () => {
  withSnapshot(<LedgerTable title="Rows" recordIds={['i', 'p', 'nope']} />);

  expect(screen.getByRole('heading', { name: 'Rows' })).toBeVisible();
  expect(screen.getByRole('grid', { name: 'Rows' })).toBeVisible();
  expect(screen.getByText('INV-1')).toBeVisible();
  expect(screen.getByText('ACH 1')).toBeVisible();
  expect(screen.getByText('Invoice')).toBeVisible();
  expect(screen.getByText('Payment')).toBeVisible();
  // INV-1 is fully outstanding, so its amount and balance both read $250.00.
  expect(screen.getAllByText('$250.00')).toHaveLength(2);
  expect(screen.getByText('1 record could not be shown.')).toBeVisible();
});

test('LedgerTable omits the missing note when every id resolves', () => {
  withSnapshot(<LedgerTable title="All" recordIds={['i', 'i', 'p']} />);

  expect(screen.getByText('INV-1')).toBeVisible();
  expect(screen.getByText('ACH 1')).toBeVisible();
  expect(screen.queryByText(/could not be shown/)).toBeNull();
});

test('TrendChart lists the last calendar months for a currency, zero-filled', () => {
  withSnapshot(<TrendChart currency="USD" customerId={null} months={3} />);

  expect(screen.getByText('Jul 2026')).toBeVisible();
  expect(screen.getByText('Aug 2026')).toBeVisible();
  expect(screen.getByText('Sep 2026')).toBeVisible();
  expect(screen.getByText('$250.00')).toBeVisible();
  expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
});

test('TrendChart clamps months so a malformed value cannot render an unbounded table', () => {
  withSnapshot(<TrendChart currency="USD" customerId={null} months={5000} />);

  expect(screen.getAllByRole('row').length).toBeLessThanOrEqual(25);
});

test('LedgerTable dedupes repeated ids and counts missing ones once', () => {
  withSnapshot(
    <LedgerTable title="Dup" recordIds={['i', 'i', 'nope', 'nope']} />,
  );

  expect(screen.getAllByText('INV-1')).toHaveLength(1);
  expect(screen.getByText('1 record could not be shown.')).toBeVisible();
});

test('LedgerTable renders nothing without a snapshot', () => {
  render(<LedgerTable title="None" recordIds={['i']} />);

  expect(screen.queryByRole('heading', { name: 'None' })).toBeNull();
});

test('AgingSummary buckets open invoices as of the ledger date', () => {
  withSnapshot(<AgingSummary currency="USD" customerId="c" />);

  expect(screen.getByText('31-60 days')).toBeVisible();
  expect(screen.getAllByText('$250.00').length).toBeGreaterThan(0);
});

test('CustomerCard shows habit badge, balances and payment figures', () => {
  withSnapshot(<CustomerCard customerId="c" />);

  expect(screen.getByRole('heading', { name: 'Cedar Health' })).toBeVisible();
  expect(screen.getByText('On time')).toBeVisible();
  expect(screen.getByText('USD')).toBeVisible();
  expect(screen.getByText('$250.00')).toBeVisible();
  expect(screen.getAllByText('$100.00')).toHaveLength(2);
  expect(screen.getByText('$300.00')).toBeVisible();
  expect(screen.getByText('No applied payments')).toBeVisible();
});

test('the React kit produces the exact schema the server expects', () => {
  const kit = assistantKit(() => null);

  expect(s.toJsonSchema(ɵcreateUiKit({ components: kit }).schema)).toEqual(
    assistantResponseSchema,
  );
});
