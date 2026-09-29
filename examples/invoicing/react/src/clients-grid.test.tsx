import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { ClientRow, PaymentProfile } from '@invoicing/contracts';
import { ClientsGrid } from './clients-grid';

const client = (
  id: string,
  name: string,
  currency: string,
  openCents: number,
  overdueCents: number,
  profile: PaymentProfile = 'on-time',
): ClientRow => ({
  id,
  name,
  currency,
  profile,
  openCents,
  overdueCents,
  aging: {
    current: openCents - overdueCents,
    days1to30: overdueCents,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
  },
  openInvoiceCount: 1,
  averageDaysToPay: 20,
  unappliedCents: 0,
});

const rows = [
  client('acme', 'Acme', 'USD', 100000, 20000),
  client('cobalt', 'Cobalt', 'USD', 300000, 250000, 'late-fixed'),
  client('echo', 'Echo', 'USD', 30000, 0),
  client('birch', 'Birch', 'GBP', 50000, 40000, 'late-drifting'),
  client('delta', 'Delta', 'GBP', 70000, 5000),
];

const dataRowIds = () =>
  [
    ...document.querySelectorAll('[data-pretable-row][data-pretable-row-id]'),
  ].map((row) => row.getAttribute('data-pretable-row-id'));

test('groups clients by currency with the switcher currency first and per-group totals', () => {
  cleanup();

  render(
    <ClientsGrid
      rows={rows}
      currency="GBP"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  const groups = [
    ...document.querySelectorAll<HTMLElement>('[data-pretable-group-row]'),
  ];
  expect(
    groups.map(
      (g) => g.querySelector('[data-pretable-group-label]')?.textContent,
    ),
  ).toEqual(['GBP', 'USD']);
  expect(within(groups[0]).getByText('£1,200')).toBeVisible();
  expect(within(groups[1]).getByText('$4,300')).toBeVisible();
  expect(dataRowIds()).toEqual(['birch', 'delta', 'cobalt', 'acme', 'echo']);
});

test('habit reads as a word and aging as a labelled bar', () => {
  cleanup();

  render(
    <ClientsGrid
      rows={rows}
      currency="USD"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  expect(screen.getByText('Late, drifting')).toBeVisible();
  expect(
    screen.getByRole('img', {
      name: 'Current £100, 1-30 days £400, 31-60 days £0, 61-90 days £0, Over 90 days £0',
    }),
  ).toBeVisible();
});

test('the selected client is marked', () => {
  cleanup();

  render(
    <ClientsGrid
      rows={rows}
      currency="USD"
      selectedId="delta"
      onSelect={vi.fn()}
      viewportHeight={600}
    />,
  );

  expect(
    document.querySelector('[data-pretable-row-id="delta"]'),
  ).toHaveAttribute('aria-selected', 'true');
  expect(
    document.querySelectorAll('[role="row"][aria-selected="true"]'),
  ).toHaveLength(1);
});

test('clicking a client reports it', () => {
  cleanup();
  const onSelect = vi.fn();
  render(
    <ClientsGrid
      rows={rows}
      currency="USD"
      onSelect={onSelect}
      viewportHeight={600}
    />,
  );

  fireEvent.click(screen.getByText('Birch'));

  expect(onSelect).toHaveBeenCalledWith('birch');
});

test('arrow keys move to the next client', () => {
  cleanup();
  const onSelect = vi.fn();
  render(
    <ClientsGrid
      rows={rows}
      currency="USD"
      onSelect={onSelect}
      viewportHeight={600}
    />,
  );
  fireEvent.click(screen.getByText('Cobalt'));
  onSelect.mockClear();

  fireEvent.keyDown(screen.getByRole('treegrid', { name: 'Clients' }), {
    key: 'ArrowDown',
  });

  expect(onSelect).toHaveBeenLastCalledWith('acme');
});
