import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createRef } from 'react';
import { expect, test, vi } from 'vitest';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import type { Transport, TransportRequest } from '@hashbrownai/core';
import type { LedgerSnapshot } from '@invoicing/contracts';
import {
  AssistantWorkspace,
  type AssistantWorkspaceHandle,
} from './assistant-workspace';

const snapshot: LedgerSnapshot = {
  payments: [
    {
      id: 'p',
      customerId: 'c',
      currency: 'USD',
      amountCents: 10000,
      unappliedCents: 10000,
      version: 1,
    },
  ],
  invoices: [
    {
      id: 'i',
      customerId: 'c',
      currency: 'USD',
      amountCents: 10000,
      outstandingCents: 10000,
      version: 1,
    },
  ],
  customers: [],
  allocations: [],
  activities: [],
};

// Every test must leave no runtime work in flight: a pending debounce timer,
// transport stream, or fetch would commit React updates after vitest tears
// down jsdom, and React's passive-effect scheduling then throws
// "window is not defined". Each test settles the UI it is waiting on, then
// calls this to flush act, unmount, and restore globals before returning.
async function settle() {
  await act(() => Promise.resolve());
  cleanup();
  vi.unstubAllGlobals();
}

function controlled(failAfterInterrupt = false, failCancellation = false) {
  const requests: TransportRequest[] = [];
  const transport: Transport = {
    name: 'conversation-test',
    async send(request) {
      requests.push(request);
      const identity = {
        threadId: request.input.threadId,
        runId: request.input.runId,
      };
      return {
        events: (async function* (): AsyncIterable<AGUIEvent> {
          yield { type: EventType.RUN_STARTED, ...identity };
          if ('selectedInvoiceId' in (request.input.state ?? {})) {
            if (!request.input.resume?.length) {
              yield {
                type: EventType.TEXT_MESSAGE_START,
                messageId: 'review',
                role: 'assistant',
              };
              yield {
                type: EventType.TEXT_MESSAGE_CONTENT,
                messageId: 'review',
                delta: JSON.stringify({
                  ui: [
                    {
                      AllocationProposal: { props: { proposalId: 'proposal' } },
                    },
                  ],
                }),
              };
              yield { type: EventType.TEXT_MESSAGE_END, messageId: 'review' };
              if (failAfterInterrupt) {
                yield { type: EventType.RUN_ERROR, message: 'stream failed' };
                return;
              }
              yield {
                type: EventType.RUN_FINISHED,
                ...identity,
                outcome: {
                  type: 'interrupt',
                  interrupts: [
                    {
                      id: 'interrupt',
                      reason: 'tool',
                      metadata: {
                        type: 'permission-request',
                        detail: { toolName: 'applyAllocation' },
                      },
                    },
                  ],
                },
              };
              return;
            }
          } else {
            // Ids must be unique per turn, as a real server guarantees;
            // reusing one appends the delta to the earlier message.
            const messageId = `answer-${requests.length}`;
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId,
              role: 'assistant',
            };
            yield {
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId,
              delta: JSON.stringify({
                ui: [
                  {
                    AssistantText: {
                      props: { text: 'There is one unapplied payment.' },
                    },
                  },
                ],
              }),
            };
            yield { type: EventType.TEXT_MESSAGE_END, messageId };
          }
          if (failCancellation && request.input.resume?.length) {
            yield {
              type: EventType.RUN_ERROR,
              message: 'cancel response lost',
            };
            return;
          }
          yield { type: EventType.RUN_FINISHED, ...identity };
        })(),
      };
    },
  };
  return { requests, transport };
}

// The server now suppresses the assistant's closing message in middleware
// (the `after` hook in `server/src/middleware.ts`), so these shapes should
// not reach a browser. They are pinned anyway as defence in depth: if that
// hook is ever removed or bypassed, the client must still render nothing for
// an empty wrapper or a bare object rather than showing the user raw JSON.
function closingTransport(closing: string): Transport {
  return {
    name: 'closing-test',
    async send(request) {
      const identity = {
        threadId: request.input.threadId,
        runId: request.input.runId,
      };
      return {
        events: (async function* (): AsyncIterable<AGUIEvent> {
          yield { type: EventType.RUN_STARTED, ...identity };
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'answer',
            role: 'assistant',
          };
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'answer',
            delta: JSON.stringify({
              ui: [{ AssistantText: { props: { text: 'One payment.' } } }],
            }),
          };
          yield { type: EventType.TEXT_MESSAGE_END, messageId: 'answer' };
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'closing',
            role: 'assistant',
          };
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'closing',
            delta: closing,
          };
          yield { type: EventType.TEXT_MESSAGE_END, messageId: 'closing' };
          yield { type: EventType.RUN_FINISHED, ...identity };
        })(),
      };
    },
  };
}

for (const [label, closing, visible] of [
  ['the prompted empty wrapper', '{"ui":[]}', 'nothing'],
  ['a bare object', '{}', 'nothing'],
  ['other JSON', '{"text":"hi"}', 'text'],
] as const) {
  test(`closing message: ${label} renders ${visible} and raises no error`, async () => {
    cleanup();
    render(
      <AssistantWorkspace
        snapshot={snapshot}
        onApplied={() => undefined}
        transport={closingTransport(closing)}
      />,
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Message assistant' }),
      { target: { value: 'What needs matching?' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('One payment.');
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Message assistant' }),
      ).toBeEnabled(),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    const conversation = screen.getByRole('region', {
      name: 'Ledger conversation',
    });
    expect(conversation.textContent).toBe(
      `What needs matching?One payment.${visible === 'text' ? closing : ''}Message assistantSend`,
    );
    await settle();
  });
}

test('conversation accepts questions before selecting a payment and remains usable after answering', async () => {
  cleanup();
  const { requests, transport } = controlled();
  render(
    <AssistantWorkspace
      snapshot={snapshot}
      onApplied={() => undefined}
      transport={transport}
    />,
  );

  fireEvent.change(screen.getByRole('textbox', { name: 'Message assistant' }), {
    target: { value: 'What needs matching?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  await screen.findByText('There is one unapplied payment.');
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'Message assistant' }),
    ).toBeEnabled(),
  );
  expect(requests).toHaveLength(1);
  expect(requests[0].input.state).toEqual({});
  fireEvent.change(screen.getByRole('textbox', { name: 'Message assistant' }), {
    target: { value: 'And what is the balance?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(requests).toHaveLength(2));
  await waitFor(() =>
    expect(screen.getAllByText('There is one unapplied payment.')).toHaveLength(
      2,
    ),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'Message assistant' }),
    ).toBeEnabled(),
  );
  await settle();
});

for (const failCancellation of [false, true]) {
  test(`cancellation unlocks chat and retires the old approval even when the response fails: ${failCancellation}`, async () => {
    cleanup();
    const { requests, transport } = controlled(false, failCancellation);
    const ref = createRef<AssistantWorkspaceHandle>();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              proposalId: 'proposal',
              operationId: 'operation',
              generation: 1,
              proposalVersion: 1,
              expectedPaymentVersion: 1,
              expectedInvoiceVersion: 1,
              paymentId: 'p',
              invoiceId: 'i',
              customerId: 'c',
              currency: 'USD',
              amountCents: 10000,
            }),
          ),
      ),
    );
    render(
      <AssistantWorkspace
        ref={ref}
        snapshot={snapshot}
        onApplied={() => undefined}
        transport={transport}
      />,
    );

    act(() => {
      expect(ref.current?.beginReview('p', 'i')).toBe(true);
    });
    const decline = await screen.findByRole('button', { name: 'Decline' });
    await waitFor(() => expect(decline).toBeEnabled());
    expect(
      screen.getByRole('textbox', { name: 'Message assistant' }),
    ).toBeDisabled();
    act(() => {
      expect(ref.current?.beginReview('p', 'i')).toBe(false);
    });
    fireEvent.click(decline);
    await screen.findByText(
      failCancellation
        ? 'Cancellation could not be confirmed. No allocation was requested.'
        : 'Review cancelled. No allocation was requested.',
    );
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Message assistant' }),
      ).toBeEnabled(),
    );
    const summary = screen.getByText(
      failCancellation ? 'Review failed · p → i' : 'Review cancelled · p → i',
    );
    expect(summary.closest('details')).not.toHaveAttribute('open');
    expect(decline).not.toBeVisible();
    fireEvent.click(summary);
    expect(decline).toBeVisible();
    expect(decline).toBeDisabled();
    act(() => {
      expect(ref.current?.beginReview('p', 'i')).toBe(true);
    });

    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[0].input.threadId).not.toBe(requests[2].input.threadId);
    expect(requests[1].input.resume).toEqual([
      { interruptId: 'interrupt', status: 'cancelled' },
    ]);
    expect(
      screen.getAllByRole('button', { name: 'Decline' })[0],
    ).toBeDisabled();
    await waitFor(() => {
      const declines = screen.getAllByRole('button', { name: 'Decline' });
      expect(declines).toHaveLength(2);
      expect(declines[1]).toBeEnabled();
    });
    await settle();
  });
}

test('a completed review without an approval retires and unlocks the composer', async () => {
  cleanup();
  const ref = createRef<AssistantWorkspaceHandle>();
  const transport: Transport = {
    name: 'empty-review',
    async send(request) {
      return {
        events: (async function* (): AsyncIterable<AGUIEvent> {
          yield {
            type: EventType.RUN_STARTED,
            threadId: request.input.threadId,
            runId: request.input.runId,
          };
          yield {
            type: EventType.RUN_FINISHED,
            threadId: request.input.threadId,
            runId: request.input.runId,
          };
        })(),
      };
    },
  };
  render(
    <AssistantWorkspace
      ref={ref}
      snapshot={snapshot}
      onApplied={() => undefined}
      transport={transport}
    />,
  );

  act(() => {
    ref.current?.beginReview('p', 'i');
  });

  await screen.findByText(
    'No allocation proposal was completed. You can start another review.',
  );
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'Message assistant' }),
    ).toBeEnabled(),
  );
  expect(
    screen.queryByRole('button', { name: 'Approve and apply' }),
  ).not.toBeInTheDocument();
  await settle();
});

test('an errored review surface cannot approve after a later review starts', async () => {
  cleanup();
  const { transport } = controlled(true);
  const ref = createRef<AssistantWorkspaceHandle>();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            proposalId: 'proposal',
            operationId: 'operation',
            generation: 1,
            proposalVersion: 1,
            expectedPaymentVersion: 1,
            expectedInvoiceVersion: 1,
            paymentId: 'p',
            invoiceId: 'i',
            customerId: 'c',
            currency: 'USD',
            amountCents: 10000,
          }),
        ),
    ),
  );
  render(
    <AssistantWorkspace
      ref={ref}
      snapshot={snapshot}
      onApplied={() => undefined}
      transport={transport}
    />,
  );

  act(() => {
    ref.current?.beginReview('p', 'i');
  });

  await screen.findByText(
    'No allocation proposal was completed. You can start another review.',
  );
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'Message assistant' }),
    ).toBeEnabled(),
  );
  for (const button of screen.queryAllByRole('button', {
    name: 'Approve and apply',
  }))
    expect(button).toBeDisabled();
  act(() => {
    expect(ref.current?.beginReview('p', 'i')).toBe(true);
  });
  for (const button of screen.queryAllByRole('button', {
    name: 'Approve and apply',
  }))
    expect(button).toBeDisabled();
  await waitFor(() =>
    expect(
      screen.getAllByText(
        'No allocation proposal was completed. You can start another review.',
      ),
    ).toHaveLength(2),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'Message assistant' }),
    ).toBeEnabled(),
  );
  for (const button of screen.queryAllByRole('button', {
    name: 'Approve and apply',
  }))
    expect(button).toBeDisabled();
  await settle();
});

// Streams a `render` call's arguments in pieces, pausing before TOOL_CALL_END
// until the test releases the gate, then delivers the tool's result the way
// B4 does: a serialized LangChain ToolMessage. There is no echo message; the
// browser renders the answer from the call itself.
function toolMessage(content: string, status: 'success' | 'error') {
  return JSON.stringify({
    lc: 1,
    type: 'constructor',
    id: ['langchain_core', 'messages', 'ToolMessage'],
    kwargs: { content, tool_call_id: 'call-render', name: 'render', status },
  });
}

function streamingRender(
  components: readonly Record<string, unknown>[],
  outcome: 'success' | 'error' = 'success',
) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const requests: TransportRequest[] = [];
  const args = JSON.stringify({
    text: 'Cedar Health has one open invoice.',
    components,
  });
  const transport: Transport = {
    name: 'streaming-render-test',
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
          for (let offset = 0; offset < args.length; offset += 7) {
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: 'call-render',
              delta: args.slice(offset, offset + 7),
            };
          }
          await gate;
          yield { type: EventType.TOOL_CALL_END, toolCallId: 'call-render' };
          yield {
            type: EventType.TOOL_CALL_RESULT,
            messageId: 'result',
            toolCallId: 'call-render',
            content:
              outcome === 'success'
                ? toolMessage('{"rendered":true}', 'success')
                : toolMessage(
                    'Error: invalid_ui: components[0].ReviewPayment.paymentId: unknown payment nope',
                    'error',
                  ),
          };
          if (outcome === 'error') {
            yield { type: EventType.RUN_ERROR, message: 'no_answer' };
            return;
          }
          yield { type: EventType.RUN_FINISHED, ...identity };
        })(),
      };
    },
  };
  return { transport, release, requests };
}

async function ask(transport: Transport, question: string) {
  render(
    <AssistantWorkspace
      snapshot={snapshot}
      onApplied={() => undefined}
      transport={transport}
    />,
  );
  fireEvent.change(screen.getByLabelText('Message assistant'), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

test('the render call paints its prose and table from the streamed arguments before the call ends', async () => {
  const { transport, release, requests } = streamingRender([
    { LedgerTable: { title: 'Open invoices', recordIds: ['i'] } },
  ]);
  await ask(transport, 'Show Cedar Health');
  await waitFor(() =>
    expect(
      screen.getByText('Cedar Health has one open invoice.'),
    ).toBeInTheDocument(),
  );
  // The answer comes from the server's own call; the client registers no
  // tools, and the server refuses any run that advertises one.
  expect(requests[0]?.input.tools).toEqual([]);
  expect(
    screen.getByRole('heading', { name: 'Open invoices' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Reading your ledger…')).toBeInTheDocument();

  release();
  await waitFor(() =>
    expect(screen.queryByText('Reading your ledger…')).not.toBeInTheDocument(),
  );
  // The result settles the same answer in place: nothing is duplicated and
  // no echo message is needed.
  expect(
    screen.getAllByText('Cedar Health has one open invoice.'),
  ).toHaveLength(1);
  expect(
    screen.getAllByRole('heading', { name: 'Open invoices' }),
  ).toHaveLength(1);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await settle();
});

test('a ReviewPayment leaf is not drawn from a draft, only once the server has validated the call', async () => {
  const { transport, release } = streamingRender([
    { ReviewPayment: { paymentId: 'p' } },
  ]);
  await ask(transport, 'Which payment should I review?');
  await waitFor(() =>
    expect(
      screen.getByText('Cedar Health has one open invoice.'),
    ).toBeInTheDocument(),
  );
  expect(
    screen.queryByRole('button', { name: /^Review / }),
  ).not.toBeInTheDocument();

  release();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /^Review / }),
    ).toBeInTheDocument(),
  );
  await settle();
});

test('a render call the server rejected renders nothing and the run surfaces the error alert', async () => {
  const { transport, release } = streamingRender(
    [{ ReviewPayment: { paymentId: 'nope' } }],
    'error',
  );
  await ask(transport, 'Review nope');
  await waitFor(() =>
    expect(
      screen.getByText('Cedar Health has one open invoice.'),
    ).toBeInTheDocument(),
  );

  release();
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(
    screen.queryByText('Cedar Health has one open invoice.'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /^Review / }),
  ).not.toBeInTheDocument();
  await settle();
});

const twoInvoices: LedgerSnapshot = {
  ...snapshot,
  payments: [{ ...snapshot.payments[0], reference: 'PAY-1' }],
  invoices: [
    { ...snapshot.invoices[0], reference: 'INV-1', outstandingCents: 6000 },
    {
      ...snapshot.invoices[0],
      id: 'i2',
      reference: 'INV-2',
      outstandingCents: 4000,
    },
  ],
};

test('a ReviewPayment that names its invoice starts that review directly', async () => {
  cleanup();
  const { transport, release, requests } = streamingRender([
    { ReviewPayment: { paymentId: 'p', invoiceId: 'i2' } },
  ]);
  render(
    <AssistantWorkspace
      snapshot={twoInvoices}
      onApplied={() => undefined}
      transport={transport}
    />,
  );
  fireEvent.change(screen.getByLabelText('Message assistant'), {
    target: { value: 'Match PAY-1' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  release();
  const match = await screen.findByRole('button', { name: 'Match to INV-2' });
  await waitFor(() => expect(match).toBeEnabled());

  fireEvent.click(match);

  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1].input.state).toEqual({
    selectedPaymentId: 'p',
    selectedInvoiceId: 'i2',
  });
  await settle();
});

test('a ReviewPayment without an invoice hands an ambiguous payment to the invoice picker', async () => {
  cleanup();
  const onChooseInvoice = vi.fn();
  const { transport, release, requests } = streamingRender([
    { ReviewPayment: { paymentId: 'p', invoiceId: null } },
  ]);
  render(
    <AssistantWorkspace
      snapshot={twoInvoices}
      onApplied={() => undefined}
      onChooseInvoice={onChooseInvoice}
      transport={transport}
    />,
  );
  fireEvent.change(screen.getByLabelText('Message assistant'), {
    target: { value: 'Match PAY-1' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  release();
  const review = await screen.findByRole('button', { name: 'Review PAY-1' });
  await waitFor(() => expect(review).toBeEnabled());

  fireEvent.click(review);

  expect(onChooseInvoice).toHaveBeenCalledWith('p');
  expect(requests).toHaveLength(1);
  expect(
    screen.queryByText(/choose an invoice before matching/),
  ).not.toBeInTheDocument();
  await settle();
});

test('Enter sends a message and Shift+Enter starts a new line', async () => {
  cleanup();
  const { requests, transport } = controlled();
  render(
    <AssistantWorkspace
      snapshot={snapshot}
      onApplied={() => undefined}
      transport={transport}
    />,
  );
  const box = screen.getByRole('textbox', { name: 'Message assistant' });
  fireEvent.change(box, { target: { value: 'What needs matching?' } });

  fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
  const afterShiftEnter = requests.length;
  fireEvent.keyDown(box, { key: 'Enter' });

  expect(afterShiftEnter).toBe(0);
  await waitFor(() => expect(requests).toHaveLength(1));
  await screen.findByText('There is one unapplied payment.');
  await settle();
});

test('an empty conversation offers starter questions that send when clicked', async () => {
  cleanup();
  const { requests, transport } = controlled();
  render(
    <AssistantWorkspace
      snapshot={snapshot}
      selectedPaymentId="p"
      onApplied={() => undefined}
      transport={transport}
    />,
  );
  const starters = screen.getByRole('group', { name: 'Suggested questions' });

  fireEvent.click(
    within(starters).getByRole('button', {
      name: 'Which invoices does this payment cover?',
    }),
  );

  await waitFor(() => expect(requests).toHaveLength(1));
  expect(JSON.stringify(requests[0].input.messages)).toContain(
    'Which invoices does this payment cover?',
  );
  await screen.findByText('There is one unapplied payment.');
  expect(
    screen.queryByRole('group', { name: 'Suggested questions' }),
  ).not.toBeInTheDocument();
  await settle();
});

test('an embedded review does not echo the message that started it', async () => {
  cleanup();
  const { transport } = controlled();
  const ref = createRef<AssistantWorkspaceHandle>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 404 })),
  );
  render(
    <AssistantWorkspace
      ref={ref}
      snapshot={snapshot}
      onApplied={() => undefined}
      transport={transport}
    />,
  );

  act(() => {
    ref.current?.beginReview('p', 'i');
  });

  await screen.findByText(
    'Unable to verify this proposal. No approval is available.',
  );
  expect(
    screen.queryByText(
      'Review the selected payment and propose an allocation.',
    ),
  ).not.toBeInTheDocument();
  await settle();
});
