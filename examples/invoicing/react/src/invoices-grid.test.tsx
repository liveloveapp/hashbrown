import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { InvoiceRow } from '@invoicing/contracts';
import { InvoicesGrid } from './invoices-grid';

const invoice = (
  id: string,
  clientId: string,
  currency: string,
  balanceCents: number,
  daysOverdue: number,
): InvoiceRow => ({
  id,
  reference: `INV-${id}`,
  clientId,
  clientName: clientId.toUpperCase(),
  currency,
  type: 'Retainer',
  issued: '2026-08-01',
  amountCents: 100000,
  balanceCents,
  daysOverdue,
  bucket: balanceCents === 0 ? null : daysOverdue > 0 ? 'days1to30' : 'current',
  status:
    balanceCents === 0
      ? { kind: 'paid' }
      : daysOverdue > 0
        ? { kind: 'overdue', days: daysOverdue }
        : { kind: 'current' },
});

const rows = [
  invoice('a1', 'acme', 'USD', 20000, 0),
  invoice('a2', 'acme', 'USD', 90000, 12),
  invoice('a3', 'acme', 'USD', 0, 0),
  invoice('b1', 'birch', 'USD', 50000, 40),
  invoice('t1', 'thistle', 'GBP', 70000, 0),
];

const dataRowIds = () =>
  [
    ...document.querySelectorAll('[data-pretable-row][data-pretable-row-id]'),
  ].map((row) => row.getAttribute('data-pretable-row-id'));

test('defaults to open invoices, largest balance first, with status words', () => {
  cleanup();

  render(
    <InvoicesGrid
      rows={rows}
      currency="USD"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  expect(dataRowIds()).toEqual(['a2', 'b1', 'a1', 't1']);
  expect(screen.getByRole('button', { name: 'Open 4' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByText('12 days overdue')).toBeVisible();
  expect(screen.getByText('40 days overdue')).toBeVisible();
});

test('chips switch between overdue, paid and all', async () => {
  cleanup();
  render(
    <InvoicesGrid
      rows={rows}
      currency="USD"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Overdue 2' }));
  await waitFor(() => expect(dataRowIds()).toEqual(['a2', 'b1']));
  fireEvent.click(screen.getByRole('button', { name: 'Paid 1' }));
  await waitFor(() => expect(dataRowIds()).toEqual(['a3']));
  fireEvent.click(screen.getByRole('button', { name: 'All 5' }));

  await waitFor(() => expect(dataRowIds()).toHaveLength(5));
});

test('a focused client narrows the grid to its invoices', () => {
  cleanup();

  render(
    <InvoicesGrid
      rows={rows}
      currency="USD"
      clientId="acme"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  expect(dataRowIds()).toEqual(['a2', 'a1']);
  expect(screen.getByRole('button', { name: 'Open 2' })).toBeVisible();
});

test('clicking an invoice reports it with its client', () => {
  cleanup();
  const onSelect = vi.fn();
  render(
    <InvoicesGrid
      rows={rows}
      currency="USD"
      onSelect={onSelect}
      viewportHeight={600}
    />,
  );

  fireEvent.click(screen.getByText('INV-b1'));

  expect(onSelect).toHaveBeenCalledWith('b1', 'birch');
});
