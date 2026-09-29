import { expect, test } from 'vitest';
import type { LedgerSnapshot } from '@invoicing/contracts';
import {
  assistantRunState,
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
  const reselected = focusReducer(client, {
    type: 'select-client',
    clientId: 'thistle',
  });

  expect(client).toEqual({ ...DEFAULT_FOCUS, clientId: 'thistle' });
  expect(reselected).toBe(client);
  expect(invoice).toEqual({
    ...DEFAULT_FOCUS,
    clientId: 'thistle',
    record: { kind: 'invoice', id: 'inv-t' },
  });
});

test('re-selecting the same invoice for the same client bails out; a different client refocuses it', () => {
  const invoice = {
    ...DEFAULT_FOCUS,
    clientId: 'thistle',
    record: { kind: 'invoice' as const, id: 'inv-t' },
  };

  const reselected = focusReducer(invoice, {
    type: 'select-invoice',
    invoiceId: 'inv-t',
    clientId: 'thistle',
  });
  const otherClient = focusReducer(invoice, {
    type: 'select-invoice',
    invoiceId: 'inv-t',
    clientId: 'harbor',
  });

  expect(reselected).toBe(invoice);
  expect(otherClient).toEqual({
    ...DEFAULT_FOCUS,
    clientId: 'harbor',
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

test('focusToSearch omits a record that has no client', () => {
  const focus = {
    ...DEFAULT_FOCUS,
    record: { kind: 'invoice' as const, id: 'inv-t' },
  };

  const search = focusToSearch(focus);

  expect(search).toBe('');
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

test('sanitizeFocus keeps a focus the ledger recognises, and drops only an unknown invoice', () => {
  const known = {
    ...DEFAULT_FOCUS,
    clientId: 'thistle',
    record: { kind: 'invoice' as const, id: 'inv-t' },
  };
  const unknownInvoice = {
    ...DEFAULT_FOCUS,
    clientId: 'thistle',
    record: { kind: 'invoice' as const, id: 'inv-ghost' },
  };

  const kept = sanitizeFocus(known, snapshot);
  const droppedRecord = sanitizeFocus(unknownInvoice, snapshot);

  expect(kept).toEqual(known);
  expect(droppedRecord).toEqual({ ...DEFAULT_FOCUS, clientId: 'thistle' });
});

test('sanitizeFocus returns the same focus when nothing is dropped', () => {
  const known = {
    ...DEFAULT_FOCUS,
    clientId: 'thistle',
    record: { kind: 'invoice' as const, id: 'inv-t' },
  };
  const client = { ...DEFAULT_FOCUS, clientId: 'thistle' };

  const results = [
    sanitizeFocus(known, snapshot),
    sanitizeFocus(client, snapshot),
    sanitizeFocus(DEFAULT_FOCUS, snapshot),
  ];

  expect(results[0]).toBe(known);
  expect(results[1]).toBe(client);
  expect(results[2]).toBe(DEFAULT_FOCUS);
});

test('clear returns the same focus when nothing is focused', () => {
  const focus = { ...DEFAULT_FOCUS, tab: 'invoices' as const };

  const cleared = focusReducer(focus, { type: 'clear' });

  expect(cleared).toBe(focus);
});

test('assistantRunState keeps only the selections that are set', () => {
  const selections = [
    {},
    { selectedPaymentId: 'p' },
    { focusedClientId: 'thistle', focusedInvoiceId: undefined },
    { focusedClientId: 'thistle', focusedInvoiceId: 'inv-t' },
  ];

  const states = selections.map(assistantRunState);

  expect(states).toEqual([
    {},
    { selectedPaymentId: 'p' },
    { focusedClientId: 'thistle' },
    { focusedClientId: 'thistle', focusedInvoiceId: 'inv-t' },
  ]);
});
