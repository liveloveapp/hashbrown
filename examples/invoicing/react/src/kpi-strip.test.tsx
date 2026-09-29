import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { ClientRow, CurrencyTotals } from '@invoicing/contracts';
import { KpiStrip } from './kpi-strip';

const totals: CurrencyTotals[] = [
  {
    currency: 'USD',
    clientCount: 8,
    openCents: 4230500,
    overdueCents: 1716700,
    unappliedCents: 1390000,
    unappliedPaymentCount: 5,
    averageDaysToPay: 17,
  },
  {
    currency: 'GBP',
    clientCount: 2,
    openCents: 1753200,
    overdueCents: 1143600,
    unappliedCents: 0,
    unappliedPaymentCount: 0,
    averageDaysToPay: 26,
  },
];

const thistle: ClientRow = {
  id: 'thistle',
  name: 'Thistle Retail',
  currency: 'GBP',
  profile: 'late-drifting',
  openCents: 1400000,
  overdueCents: 800000,
  aging: {
    current: 600000,
    days1to30: 600000,
    days31to60: 200000,
    days61to90: 0,
    over90: 0,
  },
  openInvoiceCount: 3,
  averageDaysToPay: 47,
  unappliedCents: 0,
};

test('the strip shows the switcher currency portfolio in whole units', () => {
  cleanup();

  render(
    <KpiStrip totals={totals} currency="USD" onCurrencyChange={vi.fn()} />,
  );

  const strip = screen.getByRole('region', { name: 'Ledger totals' });
  expect(within(strip).getByText('$42,305')).toBeVisible();
  expect(within(strip).getByText('8 clients')).toBeVisible();
  expect(within(strip).getByText('$17,167')).toBeVisible();
  expect(within(strip).getByText('41% of open')).toBeVisible();
  expect(within(strip).getByText('$13,900')).toBeVisible();
  expect(within(strip).getByText('5 payments to match')).toBeVisible();
  expect(within(strip).getByText('17')).toBeVisible();
  expect(screen.getByRole('button', { name: 'USD' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('the switcher asks for another currency', () => {
  cleanup();
  const onCurrencyChange = vi.fn();
  render(
    <KpiStrip
      totals={totals}
      currency="USD"
      onCurrencyChange={onCurrencyChange}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'GBP' }));

  expect(onCurrencyChange).toHaveBeenCalledWith('GBP');
});

test('a focused client replaces the figures and locks the switcher to its currency', () => {
  cleanup();

  render(
    <KpiStrip
      totals={totals}
      currency="GBP"
      client={thistle}
      onCurrencyChange={vi.fn()}
    />,
  );

  const strip = screen.getByRole('region', { name: 'Ledger totals' });
  expect(within(strip).getByText('£14,000')).toBeVisible();
  expect(within(strip).getByText('3 open invoices')).toBeVisible();
  expect(within(strip).getByText('£8,000')).toBeVisible();
  expect(within(strip).getByText('47')).toBeVisible();
  expect(screen.getByRole('button', { name: 'USD' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'GBP' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
