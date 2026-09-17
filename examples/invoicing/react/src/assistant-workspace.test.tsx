import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
