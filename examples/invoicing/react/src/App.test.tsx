import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { expect, onTestFinished, test, vi } from 'vitest';
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
  customers: [
    {
      id: 'customer-001',
      name: 'Northstar Labs',
      currency: 'USD',
      profile: 'on-time',
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
  // Open and Unapplied are both $2,400 in the one-invoice, one-payment fixture.
  expect(
    within(screen.getByRole('region', { name: 'Ledger totals' })).getAllByText(
      '$2,400',
    ),
  ).toHaveLength(2);
  expect(screen.getByRole('tab', { name: /Clients/ })).toBeVisible();
  expect(
    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
  ).toBeVisible();
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

test('starts a fresh snapshot request for a new bootstrap', async () => {
  const request = vi.fn(async () => snapshot);
  const firstBootstrap = createSnapshotLoader(request);
  const secondBootstrap = createSnapshotLoader(request);

  await firstBootstrap();
  await firstBootstrap();
  await secondBootstrap();

  expect(request).toHaveBeenCalledTimes(2);
});

test('matching from the band starts one real chat and approval refreshes the ledger without changing the focus', async () => {
  cleanup();
  const requests: TransportRequest[] = [];
  const proposal = {
    proposalId: 'proposal-001',
    operationId: 'operation-001',
    generation: 1,
    proposalVersion: 1,
    expectedPaymentVersion: 1,
    customerId: 'customer-001',
    paymentId: 'payment-001',
    lines: [
      {
        invoiceId: 'invoice-001',
        amountCents: 240000,
        expectedInvoiceVersion: 1,
      },
    ],
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
  fireEvent.click(screen.getByRole('tab', { name: /Unapplied/ }));
  fireEvent.click(screen.getByText('payment-001'));

  expect(requests).toHaveLength(0);
  expect(
    screen.getByRole('checkbox', { name: 'Apply to invoice-001' }),
  ).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Review match' }));
  const approve = await screen.findByRole('button', {
    name: 'Approve and apply',
  });
  await waitFor(() => expect(approve).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Review match' }));

  expect(requests).toHaveLength(1);
  expect(requests[0].input.state).toMatchObject({
    selectedPaymentId: 'payment-001',
    selectedInvoiceIds: ['invoice-001'],
  });
  expect(requests[0].input.hashbrown?.ui).toBe(true);
  expect(
    screen.getByText(/Finish the current assistant request/),
  ).toBeVisible();

  fireEvent.click(approve);
  await screen.findByText('Allocation applied.');
  expect(
    await screen.findByText(
      'Applied $2,400.00 to the invoice. This payment is fully matched.',
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
      screen.getByRole('region', { name: 'Match this payment' }),
    ).getByText('This payment is fully matched.'),
  ).toBeVisible();
  expect(screen.getByRole('tab', { name: /Unapplied/ })).toHaveTextContent(
    'Unapplied 1',
  );
  expect(
    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
  ).toHaveTextContent('$0.00 unapplied');
  vi.unstubAllGlobals();
});

test('an assistant review of an ambiguous payment focuses it and brings its match panel to the user', async () => {
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

  expect(screen.getByRole('tab', { name: /Unapplied/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(
    screen.getByRole('checkbox', { name: 'Apply to invoice-001' }),
  ).not.toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Apply to INV-002' }),
  ).not.toBeChecked();
  await waitFor(() =>
    expect(
      screen.getByRole('region', { name: 'Match this payment' }),
    ).toHaveFocus(),
  );
  expect(requests).toHaveLength(1);
});

test('the dashboard focus drives the band and is mirrored to the URL', () => {
  onTestFinished(() => window.history.replaceState(null, '', '/'));
  cleanup();
  window.history.replaceState(null, '', '/');
  const ledger: LedgerSnapshot = {
    ...snapshot,
    customers: [
      {
        id: 'customer-001',
        name: 'Northstar Labs',
        currency: 'USD',
        profile: 'on-time',
      },
    ],
  };
  render(<App initialSnapshot={ledger} />);

  fireEvent.click(screen.getByText('Northstar Labs'));

  expect(
    screen.getByRole('heading', { name: 'Northstar Labs', level: 2 }),
  ).toBeVisible();
  expect(window.location.search).toBe('?client=customer-001');
});

test('a shared URL opens the dashboard on its focus, dropping ids the ledger does not know', () => {
  onTestFinished(() => window.history.replaceState(null, '', '/'));
  cleanup();
  window.history.replaceState(null, '', '/?tab=invoices&client=nobody');

  render(<App initialSnapshot={snapshot} />);

  expect(screen.getByRole('tab', { name: /Invoices/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(window.location.search).toBe('?tab=invoices');
});

test('selecting a payment on the Unapplied tab opens its match panel and payment context', () => {
  cleanup();
  onTestFinished(() => window.history.replaceState(null, '', '/'));
  render(<App initialSnapshot={snapshot} />);
  fireEvent.click(screen.getByRole('tab', { name: /Unapplied/ }));

  fireEvent.click(screen.getByText('payment-001'));

  expect(
    screen.getByRole('region', { name: 'Match this payment' }),
  ).toBeVisible();
  expect(screen.getByText('$2,400.00 of $2,400.00 ✓')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Review match' })).toBeDisabled();
  expect(
    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
  ).toHaveTextContent('Payment context');
  expect(window.location.search).toBe(
    '?tab=unapplied&client=customer-001&payment=payment-001',
  );
});

test('a chat message sent with a payment focused carries that payment and its client as run state', async () => {
  cleanup();
  onTestFinished(() => window.history.replaceState(null, '', '/'));
  const requests: TransportRequest[] = [];
  const transport: Transport = {
    name: 'app-state',
    async send(request) {
      requests.push(request);
      const identity = {
        threadId: request.input.threadId,
        runId: request.input.runId,
      };
      return {
        events: (async function* (): AsyncIterable<AGUIEvent> {
          yield { type: EventType.RUN_STARTED, ...identity };
          yield { type: EventType.RUN_FINISHED, ...identity };
        })(),
      };
    },
  };
  render(
    <App initialSnapshot={snapshot} enableAssistant transport={transport} />,
  );
  fireEvent.click(screen.getByRole('tab', { name: /Unapplied/ }));
  fireEvent.click(screen.getByText('payment-001'));

  fireEvent.change(screen.getByLabelText('Message assistant'), {
    target: { value: 'Which invoices does this payment cover?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].input.state).toEqual({
    selectedPaymentId: 'payment-001',
    focusedClientId: 'customer-001',
  });
});

test('focusing a client after a payment replaces the payment context', () => {
  cleanup();
  onTestFinished(() => window.history.replaceState(null, '', '/'));
  render(<App initialSnapshot={snapshot} />);
  fireEvent.click(screen.getByRole('tab', { name: /Unapplied/ }));
  fireEvent.click(screen.getByText('payment-001'));

  fireEvent.click(screen.getByRole('tab', { name: /Clients/ }));
  fireEvent.click(
    within(screen.getByRole('treegrid', { name: 'Clients' })).getByText(
      'Northstar Labs',
    ),
  );

  expect(
    screen.getByRole('complementary', { name: 'Assistant sidebar' }),
  ).toHaveTextContent('Client context');
  expect(window.location.search).toBe('?client=customer-001');
});
