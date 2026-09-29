import { expect, test } from 'vitest';
import type { LedgerSnapshot } from '@invoicing/contracts';
import {
  DEFAULT_FOCUS,
  focusFromSearch,
  focusReducer,
  focusToSearch,
  sanitizeFocus,
} from './focus';

const snapshot = {
  customers: [
    {
      id: 'thistle',
      name: 'Thistle Retail',
      currency: 'GBP',
      profile: 'late-drifting',
    },
    {
      id: 'harbor',
      name: 'Harbor Commerce',
      currency: 'USD',
      profile: 'on-time',
    },
  ],
  invoices: [
    {
      id: 'inv-t',
      customerId: 'thistle',
      currency: 'GBP',
      amountCents: 1,
      version: 1,
      outstandingCents: 1,
    },
  ],
  payments: [],
  allocations: [],
  activities: [],
} as LedgerSnapshot;

test('selecting a client focuses it; selecting an invoice focuses its client and marks the invoice', () => {
  const client = focusReducer(DEFAULT_FOCUS, {
    type: 'select-client',
    clientId: 'thistle',
  });

  const invoice = focusReducer(client, {
    type: 'select-invoice',
    invoiceId: 'inv-t',
    clientId: 'thistle',
  });

  expect(client).toEqual({ ...DEFAULT_FOCUS, clientId: 'thistle' });
  expect(
    focusReducer(client, { type: 'select-client', clientId: 'thistle' }),
  ).toBe(client);
  expect(invoice).toEqual({
    ...DEFAULT_FOCUS,
    clientId: 'thistle',
    record: { kind: 'invoice', id: 'inv-t' },
  });
});

test('switching tabs keeps the focused client but drops a record from the other tab', () => {
  const focused = {
    ...DEFAULT_FOCUS,
    tab: 'invoices' as const,
    clientId: 'thistle',
    record: { kind: 'invoice' as const, id: 'inv-t' },
  };

  const next = focusReducer(focused, { type: 'set-tab', tab: 'clients' });

  expect(next).toEqual({
    ...DEFAULT_FOCUS,
    tab: 'clients',
    clientId: 'thistle',
  });
});

test('clear drops the client and record; the currency switcher is ignored while a client is focused', () => {
  const focused = { ...DEFAULT_FOCUS, clientId: 'thistle' };

  const locked = focusReducer(focused, {
    type: 'set-currency',
    currency: 'EUR',
  });
  const cleared = focusReducer(focused, { type: 'clear' });
  const switched = focusReducer(cleared, {
    type: 'set-currency',
    currency: 'EUR',
  });

  expect(locked).toBe(focused);
  expect(cleared).toEqual(DEFAULT_FOCUS);
  expect(switched.currency).toBe('EUR');
});

test('the focus round-trips through the query string, omitting defaults', () => {
  const focus = {
    tab: 'invoices' as const,
    currency: 'GBP',
    clientId: 'thistle',
    record: { kind: 'invoice' as const, id: 'inv-t' },
  };

  const search = focusToSearch(focus);

  expect(search).toBe(
    '?tab=invoices&currency=GBP&client=thistle&invoice=inv-t',
  );
  expect(focusFromSearch(search)).toEqual(focus);
  expect(focusToSearch(DEFAULT_FOCUS)).toBe('');
  expect(focusFromSearch('?tab=unknown&currency=XYZ')).toEqual(DEFAULT_FOCUS);
});

test('sanitizeFocus drops ids the ledger does not know, and records that belong to another client', () => {
  const unknown = sanitizeFocus(
    { ...DEFAULT_FOCUS, clientId: 'nobody' },
    snapshot,
  );
  const mismatched = sanitizeFocus(
    {
      ...DEFAULT_FOCUS,
      clientId: 'harbor',
      record: { kind: 'invoice', id: 'inv-t' },
    },
    snapshot,
  );

  expect(unknown).toEqual(DEFAULT_FOCUS);
  expect(mismatched).toEqual({ ...DEFAULT_FOCUS, clientId: 'harbor' });
});
