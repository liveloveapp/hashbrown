import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { StrictMode } from 'react';
import type { LedgerSnapshot } from '@invoicing/contracts';
import { App, createSnapshotLoader } from './App';

const snapshot: LedgerSnapshot = {
  payments: [
    {
      id: 'payment-001',
      customerId: 'customer-001',
      currency: 'USD',
      amountCents: 240000,
      version: 1,
      unappliedCents: 240000,
    },
  ],
  invoices: [
    {
      id: 'invoice-001',
      customerId: 'customer-001',
      currency: 'USD',
      amountCents: 240000,
      version: 1,
      outstandingCents: 240000,
    },
  ],
  allocations: [],
  activities: [],
};

test('lands on Dashboard with canonical totals and an open Assistant', () => {
  cleanup();

  render(<App initialSnapshot={snapshot} />);

  expect(
    screen.getByRole('heading', { name: 'Business overview' }),
  ).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Ledger totals' })).getAllByText(
      '$2,400.00',
    ),
  ).toHaveLength(3);
  expect(
    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
  ).toBeVisible();
});

test('preserves selected payment context when navigating between pages', () => {
  cleanup();
  render(<App initialSnapshot={snapshot} />);

  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));

  expect(
    screen.getByRole('heading', { name: 'Business overview' }),
  ).toBeVisible();
  expect(
    screen.getByRole('region', { name: 'Related invoices' }),
  ).toHaveTextContent('invoice-001');
  expect(
    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
  ).toHaveTextContent('payment-001');
  expect(
    screen.getByRole('textbox', { name: 'Message assistant' }),
  ).toBeDisabled();
});

test('shows a loading state while the initial snapshot is requested', () => {
  cleanup();

  render(<App loadSnapshot={() => new Promise(() => undefined)} />);

  expect(screen.getByRole('status')).toHaveTextContent('Loading ledger');
});

test('shows a useful error when the ledger cannot be loaded', async () => {
  cleanup();

  render(
    <App
      loadSnapshot={async () => {
        throw new Error('offline');
      }}
    />,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to load the ledger. Please reload and try again.',
  );
});

test('requests one initial snapshot for a StrictMode bootstrap', async () => {
  cleanup();
  const request = vi.fn(async () => snapshot);
  const loadSnapshot = createSnapshotLoader(request);

  render(
    <StrictMode>
      <App loadSnapshot={loadSnapshot} />
    </StrictMode>,
  );
  await screen.findByRole('region', { name: 'Ledger totals' });

  expect(request).toHaveBeenCalledTimes(1);
});

test('selects the newly checked payment even when it precedes the old selection', () => {
  cleanup();
  const twoPayments = {
    ...snapshot,
    payments: [
      ...snapshot.payments,
      { ...snapshot.payments[0], id: 'payment-002' },
    ],
  };
  render(<App initialSnapshot={twoPayments} />);

  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[1]);
  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);

  expect(
    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
  ).toHaveTextContent('payment-001');
  expect(
    screen.getAllByRole('checkbox', { name: 'Select row' })[0],
  ).toBeChecked();
  expect(
    screen.getAllByRole('checkbox', { name: 'Select row' })[1],
  ).not.toBeChecked();
});

test('clears payment and invoice context when the selected row is unchecked', () => {
  cleanup();
  render(<App initialSnapshot={snapshot} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));

  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));

  expect(
    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
  ).not.toHaveTextContent('payment-001');
  expect(
    screen.getByRole('region', { name: 'Related invoices' }),
  ).not.toHaveTextContent('invoice-001');
});

test('starts a fresh snapshot request for a new bootstrap', async () => {
  const request = vi.fn(async () => snapshot);
  const firstBootstrap = createSnapshotLoader(request);
  const secondBootstrap = createSnapshotLoader(request);

  await firstBootstrap();
  await firstBootstrap();
  await secondBootstrap();

  expect(request).toHaveBeenCalledTimes(2);
});
