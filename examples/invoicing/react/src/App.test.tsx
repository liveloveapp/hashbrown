import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { StrictMode } from 'react';
import type { Transport, TransportRequest } from '@hashbrownai/core';
import { type AGUIEvent, EventType } from '@ag-ui/core';
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
  customers: [],
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

test('explicit matching starts one real chat and approval refreshes the ledger without changing selection', async () => {
  cleanup();
  const requests: TransportRequest[] = [];
  const proposal = {
    proposalId: 'proposal-001',
    operationId: 'operation-001',
    generation: 1,
    proposalVersion: 1,
    expectedPaymentVersion: 1,
    expectedInvoiceVersion: 1,
    customerId: 'customer-001',
    paymentId: 'payment-001',
    invoiceId: 'invoice-001',
    amountCents: 240000,
    currency: 'USD',
  };
  const twoPayments: LedgerSnapshot = {
    ...snapshot,
    payments: [
      ...snapshot.payments,
      { ...snapshot.payments[0], id: 'payment-002' },
    ],
  };
  const applied: LedgerSnapshot = {
    ...twoPayments,
    payments: twoPayments.payments.map((payment) =>
      payment.id === 'payment-001'
        ? { ...payment, unappliedCents: 0, version: 2 }
        : payment,
    ),
    invoices: snapshot.invoices.map((invoice) => ({
      ...invoice,
      outstandingCents: 0,
      version: 2,
    })),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('/api/reviews/')
              ? proposal
              : {
                  proposalId: proposal.proposalId,
                  operationId: proposal.operationId,
                  status: 'approved',
                  snapshot: applied,
                },
          ),
        ),
    ),
  );
  const transport: Transport = {
    name: 'app-review',
    async send(request) {
      requests.push(request);
      const identity = {
        threadId: request.input.threadId,
        runId: request.input.runId,
      };
      return {
        events: (async function* (): AsyncIterable<AGUIEvent> {
          yield { type: EventType.RUN_STARTED, ...identity };
          if (request.input.resume?.length) {
            yield { type: EventType.RUN_FINISHED, ...identity };
            return;
          }
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'proposal',
            role: 'assistant',
          };
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'proposal',
            delta: JSON.stringify({
              ui: [
                {
                  AllocationProposal: {
                    props: { proposalId: proposal.proposalId },
                  },
                },
              ],
            }),
          };
          yield { type: EventType.TEXT_MESSAGE_END, messageId: 'proposal' };
          yield {
            type: EventType.RUN_FINISHED,
            ...identity,
            outcome: {
              type: 'interrupt',
              interrupts: [
                {
                  id: 'permission-1',
                  reason: 'tool',
                  metadata: {
                    type: 'permission-request',
                    detail: { toolName: 'applyAllocation' },
                  },
                },
              ],
            },
          };
        })(),
      };
    },
  };
  render(
    <StrictMode>
      <App
        initialSnapshot={twoPayments}
        enableAssistant
        transport={transport}
      />
    </StrictMode>,
  );

  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);
  expect(requests).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Match payment' }));
  const approve = await screen.findByRole('button', {
    name: 'Approve and apply',
  });
  await waitFor(() => expect(approve).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Review payment-001' }));
  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[1]);
  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));

  expect(requests).toHaveLength(1);
  expect(requests[0].input.state).toMatchObject({
    selectedPaymentId: 'payment-001',
    selectedInvoiceId: 'invoice-001',
  });
  expect(requests[0].input.hashbrown?.ui).toBe(true);
  expect(
    screen.getAllByRole('checkbox', { name: 'Select row' })[0],
  ).toBeChecked();
  expect(
    screen.getAllByRole('checkbox', { name: 'Select row' })[1],
  ).not.toBeChecked();

  fireEvent.click(screen.getByRole('button', { name: 'Match payment' }));
  expect(
    screen.getByText(/Finish the current assistant request/),
  ).toBeVisible();

  fireEvent.click(approve);
  await screen.findByText('Allocation applied.');
  expect(
    await screen.findByText(
      'Applied $2,400.00 to invoice-001. This payment is fully matched.',
    ),
  ).toBeVisible();

  await waitFor(() =>
    expect(
      screen.queryByText(/Finish the current assistant request/),
    ).not.toBeInTheDocument(),
  );
  expect(requests).toHaveLength(2);
  expect(requests[1].input.resume).toEqual([
    { interruptId: 'permission-1', status: 'resolved', payload: 'once' },
  ]);
  expect(
    within(
      screen
        .getByRole('button', { name: 'Review payment-001' })
        .closest('[role="row"]') as HTMLElement,
    ).getByRole('checkbox', { name: 'Select row' }),
  ).toBeChecked();
  fireEvent.click(screen.getByText('Paid invoices (1)'));
  expect(
    screen.getByRole('region', { name: 'Related invoices' }),
  ).toHaveTextContent('Paid');
  expect(
    screen.getByRole('region', { name: 'Related invoices' }),
  ).toHaveTextContent('$0.00');
  expect(
    screen.getByRole('region', { name: 'Ledger totals' }),
  ).toHaveTextContent('1 payment to match');
  expect(
    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
  ).toHaveTextContent('$0.00 unapplied');
  vi.unstubAllGlobals();
});

test('shows client metadata and defaults to unmatched payments', async () => {
  cleanup();
  const ledger = {
    ...snapshot,
    payments: [
      {
        ...snapshot.payments[0],
        customerName: 'Northstar Labs',
        reference: 'PAY-2026-01',
        date: '2026-01-15',
      },
      {
        ...snapshot.payments[0],
        id: 'paid-payment',
        unappliedCents: 0,
        reference: 'PAY-PAID',
      },
    ],
  };

  render(<App initialSnapshot={ledger} />);

  expect(screen.getByText('Northstar Labs')).toBeVisible();
  expect(screen.getByText('PAY-2026-01')).toBeVisible();
  expect(screen.getByText('PAY-2026-01')).toHaveAttribute(
    'title',
    'PAY-2026-01',
  );
  expect(screen.getByText('2026-01-15')).toBeVisible();
  expect(screen.queryByText('PAY-PAID')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'All payments' }));
  expect(await screen.findByText('PAY-PAID')).toBeVisible();
});

test('requires an invoice choice when a payment has multiple outstanding invoices', () => {
  cleanup();
  const ledger = {
    ...snapshot,
    invoices: [
      ...snapshot.invoices,
      { ...snapshot.invoices[0], id: 'invoice-002', reference: 'INV-002' },
    ],
  };

  render(<App initialSnapshot={ledger} enableAssistant />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));

  expect(screen.getByRole('button', { name: 'Match payment' })).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Invoice to match' }), {
    target: { value: 'invoice-002' },
  });
  expect(screen.getByRole('button', { name: 'Match payment' })).toBeEnabled();
});

test('derives monthly invoiced and received totals from record dates', () => {
  cleanup();
  const ledger = {
    ...snapshot,
    invoices: [
      { ...snapshot.invoices[0], date: '2026-01-01', amountCents: 10000 },
    ],
    payments: [
      { ...snapshot.payments[0], date: '2026-01-15', amountCents: 5000 },
    ],
  };

  render(<App initialSnapshot={ledger} />);

  const report = screen.getByRole('table', {
    name: 'Monthly invoiced and received',
  });
  expect(report).toHaveTextContent('Jan 2026');
  expect(report).toHaveTextContent('$100.00');
  expect(report).toHaveTextContent('$50.00');
});

test('the Status column tells partially matched payments apart', async () => {
  cleanup();
  const ledger = {
    ...snapshot,
    payments: [
      { ...snapshot.payments[0], unappliedCents: 100000, reference: 'PART' },
      {
        ...snapshot.payments[0],
        id: 'payment-002',
        unappliedCents: 0,
        reference: 'DONE',
      },
      { ...snapshot.payments[0], id: 'payment-003', reference: 'OPEN' },
    ],
  };

  render(<App initialSnapshot={ledger} />);
  fireEvent.click(screen.getByRole('button', { name: 'All payments' }));
  await screen.findByText('DONE');

  const rowOf = (reference: string) =>
    screen.getByText(reference).closest('[role="row"]') as HTMLElement;
  expect(rowOf('PART')).toHaveTextContent('Partially matched');
  expect(rowOf('DONE')).toHaveTextContent('Matched');
  expect(rowOf('DONE')).not.toHaveTextContent('Partially');
  expect(rowOf('OPEN')).toHaveTextContent('Unmatched');
});

test('an assistant review of an ambiguous payment selects it and focuses the invoice picker', async () => {
  cleanup();
  const requests: TransportRequest[] = [];
  const args = JSON.stringify({
    text: 'PAY-1 could settle either invoice.',
    components: [{ ReviewPayment: { paymentId: 'payment-001' } }],
  });
  const transport: Transport = {
    name: 'app-render',
    async send(request) {
      requests.push(request);
      const identity = {
        threadId: request.input.threadId,
        runId: request.input.runId,
      };
      return {
        events: (async function* (): AsyncIterable<AGUIEvent> {
          yield { type: EventType.RUN_STARTED, ...identity };
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'call-render',
            toolCallName: 'render',
          };
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'call-render',
            delta: args,
          };
          yield { type: EventType.TOOL_CALL_END, toolCallId: 'call-render' };
          yield {
            type: EventType.TOOL_CALL_RESULT,
            messageId: 'result',
            toolCallId: 'call-render',
            content: JSON.stringify({
              lc: 1,
              type: 'constructor',
              id: ['langchain_core', 'messages', 'ToolMessage'],
              kwargs: {
                content: '{"rendered":true}',
                tool_call_id: 'call-render',
                name: 'render',
                status: 'success',
              },
            }),
          };
          yield { type: EventType.RUN_FINISHED, ...identity };
        })(),
      };
    },
  };
  const ledger = {
    ...snapshot,
    payments: [{ ...snapshot.payments[0], reference: 'PAY-1' }],
    invoices: [
      ...snapshot.invoices,
      { ...snapshot.invoices[0], id: 'invoice-002', reference: 'INV-002' },
    ],
  };
  render(
    <App initialSnapshot={ledger} enableAssistant transport={transport} />,
  );
  fireEvent.change(screen.getByLabelText('Message assistant'), {
    target: { value: 'Which invoice is PAY-1 for?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  const review = await screen.findByRole('button', { name: 'Review PAY-1' });
  await waitFor(() => expect(review).toBeEnabled());

  fireEvent.click(review);

  expect(screen.getByRole('checkbox', { name: 'Select row' })).toBeChecked();
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Invoice to match' }),
    ).toHaveFocus(),
  );
  expect(requests).toHaveLength(1);
});
