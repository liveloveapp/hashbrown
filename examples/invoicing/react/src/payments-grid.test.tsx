import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { PaymentRow } from '@invoicing/contracts';
import { PaymentsGrid } from './payments-grid';

const payment = (
  id: string,
  payerId: string,
  received: string,
  amountCents: number,
  unappliedCents: number,
  currency = 'USD',
): PaymentRow => ({
  id,
  reference: `ACH ${id.toUpperCase()}`,
  payerId,
  payerName: payerId.toUpperCase(),
  currency,
  received,
  amountCents,
  appliedCents: amountCents - unappliedCents,
  unappliedCents,
  ageDays: 3,
  status:
    unappliedCents === 0
      ? 'matched'
      : unappliedCents < amountCents
        ? 'partly-applied'
        : 'unmatched',
});

const rows = [
  payment('p1', 'acme', '2026-09-01', 100000, 0),
  payment('p2', 'acme', '2026-09-12', 50000, 20000),
  payment('p3', 'birch', '2026-09-05', 80000, 80000),
  payment('p4', 'thistle', '2026-09-03', 70000, 0, 'GBP'),
];

const dataRowIds = () =>
  [
    ...document.querySelectorAll('[data-pretable-row][data-pretable-row-id]'),
  ].map((row) => row.getAttribute('data-pretable-row-id'));

test('the Payments tab lists every payment newest first, with payer, reference and status', () => {
  cleanup();

  render(
    <PaymentsGrid
      rows={rows}
      mode="all"
      currency="USD"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  expect(dataRowIds()).toEqual(['p2', 'p3', 'p1', 'p4']);
  expect(screen.getByText('ACH P2')).toBeVisible();
  expect(screen.getByText('Partly applied')).toBeVisible();
  expect(screen.getAllByText('Matched')).toHaveLength(2);
  expect(screen.getByText('Unmatched')).toBeVisible();
});

test('the Unapplied tab lists cash still to match, oldest first, with its hint', () => {
  cleanup();

  render(
    <PaymentsGrid
      rows={rows}
      mode="unapplied"
      currency="USD"
      hints={new Map([['p3', 'Advance: no open invoice']])}
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  expect(dataRowIds()).toEqual(['p3', 'p2']);
  expect(screen.getByText('Advance: no open invoice')).toBeVisible();
  expect(
    screen.getByRole('treegrid', { name: 'Unapplied payments' }),
  ).toBeVisible();
});

test('a focused client narrows the grid to its payments', () => {
  cleanup();

  render(
    <PaymentsGrid
      rows={rows}
      mode="all"
      currency="USD"
      clientId="acme"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  expect(dataRowIds()).toEqual(['p2', 'p1']);
});

test('clicking a payment reports it with its payer', () => {
  cleanup();
  const onSelect = vi.fn();
  render(
    <PaymentsGrid
      rows={rows}
      mode="all"
      currency="USD"
      onSelect={onSelect}
      viewportHeight={600}
    />,
  );

  fireEvent.click(screen.getByText('ACH P3'));

  expect(onSelect).toHaveBeenCalledWith('p3', 'birch');
});
