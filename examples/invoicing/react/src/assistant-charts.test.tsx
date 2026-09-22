import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, test } from 'vitest';
import type { LedgerSnapshot } from '@invoicing/contracts';
import { AgingSummary, compactMoney, TrendChart } from './assistant-charts';
import { SnapshotContext } from './snapshot-context';

afterEach(cleanup);

const snapshot: LedgerSnapshot = {
  customers: [
    { id: 'c', name: 'Cedar Health', currency: 'USD', profile: 'on-time' },
    // A GBP client with no invoices or payments: an empty currency.
    { id: 'g', name: 'Granite Ltd', currency: 'GBP', profile: 'on-time' },
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

const withSnapshot = (ui: ReactNode, value: LedgerSnapshot = snapshot) =>
  render(
    <SnapshotContext.Provider value={value}>{ui}</SnapshotContext.Provider>,
  );

const tickLabels = (figure: HTMLElement) =>
  [...figure.querySelectorAll('svg text[data-tick]')].map((t) => t.textContent);

test('compactMoney keeps one fraction digit so 5×10ⁿ steps stay distinct', () => {
  expect(compactMoney(150000, 'USD')).toBe('$1.5K');
  expect(compactMoney(50000, 'USD')).toBe('$500');
  expect(compactMoney(200000000, 'USD')).toBe('$2M');
});

test('TrendChart draws grouped columns with a legend, a caption, and a table view', () => {
  withSnapshot(<TrendChart currency="USD" customerId={null} months={3} />);

  const figure = screen.getByRole('figure', {
    name: /Invoiced vs received · USD/,
  });
  expect(figure).toBeVisible();
  expect(screen.getByText('Invoiced')).toBeVisible();
  expect(screen.getByText('Received')).toBeVisible();
  expect(figure.querySelectorAll('rect[data-series="invoiced"]')).toHaveLength(
    3,
  );
  expect(figure.querySelectorAll('rect[data-series="received"]')).toHaveLength(
    3,
  );
  expect(screen.getByText('Show data')).toBeVisible();
  expect(
    screen.getByRole('table', { name: /Invoiced vs received/ }),
  ).toBeInTheDocument();
  expect(screen.getAllByText('Jul 2026').length).toBeGreaterThan(0);
  // The latest month's values are a caption, not labels inside the plot.
  expect(figure.querySelector('.assistant-kit-caption')).toHaveTextContent(
    'Sep 2026 · Invoiced $0.00 · Received $100.00',
  );
  const svgText = [...figure.querySelectorAll('svg text')].map(
    (t) => t.textContent,
  );
  expect(svgText.filter((t) => t?.includes('.'))).toEqual([]);
});

test('TrendChart names the figure once and exposes each month group as a named img', () => {
  withSnapshot(<TrendChart currency="USD" customerId="c" months={3} />);

  const figure = screen.getByRole('figure', {
    name: 'Invoiced vs received · USD · c',
  });
  expect(figure.getAttribute('aria-labelledby')).toBe(
    figure.querySelector('h4')?.id,
  );
  // No aria-hidden on the SVG: its groups are focusable (axe aria-hidden-focus).
  expect(figure.querySelector('svg')?.hasAttribute('aria-hidden')).toBe(false);
  expect(figure.querySelector('svg')?.hasAttribute('role')).toBe(false);
  expect(
    screen.getAllByRole('img').map((g) => g.getAttribute('aria-label')),
  ).toEqual([
    'Jul 2026: invoiced $250.00, received $0.00',
    'Aug 2026: invoiced $50.00, received $0.00',
    'Sep 2026: invoiced $0.00, received $100.00',
  ]);
});

test('TrendChart clamps months and shows a tooltip on hover', () => {
  withSnapshot(<TrendChart currency="USD" customerId={null} months={5000} />);
  const figure = screen.getByRole('figure', { name: /Invoiced vs received/ });
  expect(figure.querySelectorAll('rect[data-series="invoiced"]')).toHaveLength(
    24,
  );
  const groups = figure.querySelectorAll('[data-month]');
  fireEvent.mouseEnter(groups[groups.length - 1]);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Sep 2026');
});

test('TrendChart groups are focusable, named, and show the tooltip on focus', () => {
  withSnapshot(<TrendChart currency="USD" customerId={null} months={3} />);
  const group = screen
    .getByRole('figure', { name: /Invoiced vs received/ })
    .querySelector('[data-month="2026-07"]') as SVGGElement;

  expect(group.getAttribute('tabindex')).toBe('0');
  expect(group.getAttribute('aria-label')).toBe(
    'Jul 2026: invoiced $250.00, received $0.00',
  );
  fireEvent.focus(group);
  expect(screen.getByRole('tooltip')).toHaveTextContent('$250.00 invoiced');
  fireEvent.blur(group);
  expect(screen.queryByRole('tooltip')).toBeNull();
});

test('TrendChart y-axis ticks stay unique on a 1.5K step', () => {
  // $1,800 in one month: step $500, ticks $0 / $500 / $1K / $1.5K / $2K.
  const value: LedgerSnapshot = {
    ...snapshot,
    invoices: [
      {
        ...snapshot.invoices[0],
        amountCents: 180000,
        outstandingCents: 180000,
      },
    ],
  };
  withSnapshot(
    <TrendChart currency="USD" customerId={null} months={3} />,
    value,
  );

  const ticks = tickLabels(screen.getByRole('figure', { name: /Invoiced/ }));
  expect(ticks).toEqual(['$0', '$500', '$1K', '$1.5K', '$2K']);
  expect(new Set(ticks).size).toBe(ticks.length);
});

test('TrendChart renders an empty currency as zero-height columns with unique ticks', () => {
  withSnapshot(<TrendChart currency="GBP" customerId={null} months={24} />);

  const figure = screen.getByRole('figure', {
    name: /Invoiced vs received · GBP/,
  });
  const columns = figure.querySelectorAll('rect[data-series="invoiced"]');
  expect(columns).toHaveLength(24);
  expect(figure.querySelectorAll('rect[data-series="received"]')).toHaveLength(
    24,
  );
  // Columns extend 4px below the baseline and are clipped, so a zero is 4 tall.
  expect(new Set([...columns].map((c) => c.getAttribute('height')))).toEqual(
    new Set(['4']),
  );
  const ticks = tickLabels(figure);
  expect(new Set(ticks).size).toBe(ticks.length);
  expect(figure.querySelector('.assistant-kit-caption')).toHaveTextContent(
    'Sep 2026 · Invoiced £0.00 · Received £0.00',
  );
});

test('AgingSummary draws one bar per bucket with direct labels and a table view', () => {
  withSnapshot(<AgingSummary currency="USD" customerId="c" />);

  const figure = screen.getByRole('figure', { name: /Aging · USD/ });
  expect(figure.querySelectorAll('rect[data-bucket]')).toHaveLength(5);
  expect(screen.getAllByText('31-60 days').length).toBeGreaterThan(0);
  expect(screen.getAllByText('$250.00').length).toBeGreaterThan(0);
  expect(screen.getByRole('table', { name: /Aging/ })).toBeInTheDocument();
  expect(figure.querySelector('svg')?.hasAttribute('aria-hidden')).toBe(false);
  expect(
    screen.getAllByRole('img').map((g) => g.getAttribute('aria-label')),
  ).toEqual([
    'Current: $0.00, 0 invoices',
    '1-30 days: $0.00, 0 invoices',
    '31-60 days: $250.00, 1 invoice',
    '61-90 days: $0.00, 0 invoices',
    'Over 90 days: $0.00, 0 invoices',
  ]);
});

test('AgingSummary names each bar row and pluralises the invoice count in its tooltip', () => {
  withSnapshot(<AgingSummary currency="USD" customerId="c" />);
  const figure = screen.getByRole('figure', { name: /Aging · USD/ });
  const one = figure.querySelector(
    '[data-bucket-row="days31to60"]',
  ) as SVGGElement;
  const none = figure.querySelector(
    '[data-bucket-row="current"]',
  ) as SVGGElement;

  expect(one.getAttribute('aria-label')).toBe('31-60 days: $250.00, 1 invoice');
  fireEvent.focus(one);
  expect(screen.getByRole('tooltip')).toHaveTextContent('$250.00 · 1 invoice');
  fireEvent.blur(one);
  expect(screen.queryByRole('tooltip')).toBeNull();

  expect(none.getAttribute('aria-label')).toBe('Current: $0.00, 0 invoices');
  fireEvent.mouseEnter(none);
  expect(screen.getByRole('tooltip')).toHaveTextContent('$0.00 · 0 invoices');
});
