import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { HashbrownProvider } from '@hashbrownai/react';
import type { Transport, TransportRequest } from '@hashbrownai/core';
import { type AGUIEvent, EventType } from '@ag-ui/core';
import { expect, test, vi } from 'vitest';
import { ReviewChat, type ReviewChatHandle } from './review-chat';
import { createRef } from 'react';

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
const snapshot = {
  payments: [],
  invoices: [],
  customers: [],
  allocations: [],
  activities: [],
};

function setup(
  options: {
    review?: unknown;
    reviewStatus?: number;
    result?: unknown;
    resultStatus?: number;
    unknownInterrupt?: boolean;
    immediate?: boolean;
    initialComplete?: boolean;
    resumeError?: boolean;
  } = {},
) {
  cleanup();
  const requests: TransportRequest[] = [];
  let finishResume: (() => void) | undefined;
  const resumed = new Promise<void>((resolve) => {
    finishResume = resolve;
  });
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes('/api/reviews/')
            ? (options.review ?? proposal)
            : (options.result ?? {
                proposalId: proposal.proposalId,
                operationId: proposal.operationId,
                status: 'approved',
                snapshot,
              }),
        ),
        {
          status: url.includes('/api/reviews/')
            ? (options.reviewStatus ?? 200)
            : (options.resultStatus ?? 200),
        },
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  const transport: Transport = {
    name: 'controlled-review',
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
            if (!options.immediate) await resumed;
            if (options.resumeError) {
              yield {
                type: EventType.RUN_ERROR,
                message: 'Transport interrupted',
                code: 'test-error',
              };
              return;
            }
            yield { type: EventType.RUN_FINISHED, ...identity };
            return;
          }
          if (options.initialComplete) {
            yield { type: EventType.RUN_FINISHED, ...identity };
            return;
          }
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'proposal-message',
            role: 'assistant',
          };
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'proposal-message',
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
          yield {
            type: EventType.TEXT_MESSAGE_END,
            messageId: 'proposal-message',
          };
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
                    detail: {
                      toolName: options.unknownInterrupt
                        ? 'otherTool'
                        : 'applyAllocation',
                    },
                  },
                },
              ],
            },
          };
        })(),
      };
    },
  };
  const onApplied = vi.fn();
  const ref = createRef<ReviewChatHandle>();
  const view = render(
    <HashbrownProvider url="/agui">
      <ReviewChat ref={ref} transport={transport} onApplied={onApplied} />
    </HashbrownProvider>,
  );
  const start = () => {
    let accepted = false;
    act(() => {
      accepted = ref.current?.startReview('payment-001') ?? false;
      if (accepted)
        view.rerender(
          <HashbrownProvider url="/agui">
            <ReviewChat
              ref={ref}
              selectedPaymentId="payment-001"
              transport={transport}
              onApplied={onApplied}
            />
          </HashbrownProvider>,
        );
    });
    return accepted;
  };
  return {
    requests,
    fetcher,
    onApplied,
    start,
    ref,
    finish: async () => {
      await act(async () => {
        finishResume?.();
      });
    },
  };
}

test('sends selection and actual UI schema, then holds messages for the verified proposal', async () => {
  const subject = setup();

  act(() => {
    expect(subject.start()).toBe(true);
    expect(subject.start()).toBe(false);
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Approve and apply' }),
    ).toBeEnabled(),
  );

  expect(subject.requests).toHaveLength(1);
  expect(subject.requests[0].input.state).toEqual({
    selectedPaymentId: 'payment-001',
  });
  expect(subject.requests[0].input.hashbrown?.ui).toBe(true);
  expect(subject.requests[0].input.hashbrown?.responseSchema).toBeDefined();
  expect(subject.fetcher.mock.calls[0][0]).toBe(
    `/api/reviews/${subject.requests[0].input.threadId}`,
  );
  expect(screen.getByText('$2,400.00')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  expect(subject.start()).toBe(false);
  expect(subject.ref.current?.startReview('payment-002')).toBe(false);
});

test('offers no approval for a proposal whose total disagrees with its lines', async () => {
  const subject = setup({ review: { ...proposal, amountCents: 1 } });

  act(() => {
    subject.start();
  });

  expect(
    await screen.findByText(
      'Unable to verify this proposal. No approval is available.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Approve and apply' }),
  ).not.toBeInTheDocument();
});

test('resumes once with exact identity and waits for completion before checking the operation', async () => {
  const subject = setup();
  subject.start();
  const approve = await screen.findByRole('button', {
    name: 'Approve and apply',
  });
  await waitFor(() => expect(approve).toBeEnabled());

  fireEvent.click(approve);
  fireEvent.click(approve);
  await waitFor(() => expect(subject.requests).toHaveLength(2));

  expect(subject.requests[1].input.resume).toEqual([
    { interruptId: 'permission-1', status: 'resolved', payload: 'once' },
  ]);
  expect(subject.requests[1].input.state).toEqual({
    selectedPaymentId: 'payment-001',
    proposalId: 'proposal-001',
    proposalVersion: 1,
    operationId: 'operation-001',
    generation: 1,
  });
  expect(subject.fetcher).toHaveBeenCalledTimes(1);
  expect(subject.onApplied).not.toHaveBeenCalled();

  await subject.finish();
  await waitFor(() =>
    expect(subject.onApplied).toHaveBeenCalledExactlyOnceWith(snapshot),
  );
  expect(screen.getByText('Allocation applied.')).toBeVisible();
});

test('cancels the complete batch without claiming a domain decline or reading an operation', async () => {
  const subject = setup();
  subject.start();
  const decline = await screen.findByRole('button', { name: 'Decline' });
  await waitFor(() => expect(decline).toBeEnabled());

  fireEvent.click(decline);
  await waitFor(() => expect(subject.requests).toHaveLength(2));
  await subject.finish();

  expect(subject.requests[1].input.resume).toEqual([
    { interruptId: 'permission-1', status: 'cancelled' },
  ]);
  await screen.findByText('Review cancelled. No allocation was requested.');
  expect(subject.fetcher).toHaveBeenCalledTimes(1);
  expect(subject.onApplied).not.toHaveBeenCalled();
});

for (const options of [
  { reviewStatus: 404 },
  { review: { ...proposal, paymentId: 'payment-002' } },
  { unknownInterrupt: true },
]) {
  test(`does not enable approval for an unverified review ${JSON.stringify(options)}`, async () => {
    const subject = setup(options);

    subject.start();
    await screen.findByRole('alert');

    expect(
      screen.queryByRole('button', { name: 'Approve and apply' }),
    ).not.toBeInTheDocument();
    expect(subject.requests).toHaveLength(1);
    expect(subject.onApplied).not.toHaveBeenCalled();
  });
}

for (const options of [
  { resultStatus: 404 },
  {
    result: {
      proposalId: 'wrong',
      operationId: 'operation-001',
      status: 'approved',
      snapshot,
    },
  },
]) {
  test(`does not report application without matching recorded success ${JSON.stringify(options)}`, async () => {
    const subject = setup(options);
    subject.start();
    const approve = await screen.findByRole('button', {
      name: 'Approve and apply',
    });
    await waitFor(() => expect(approve).toBeEnabled());

    fireEvent.click(approve);
    await waitFor(() => expect(subject.requests).toHaveLength(2));
    await subject.finish();

    await screen.findByRole('alert');
    expect(subject.onApplied).not.toHaveBeenCalled();
    expect(screen.queryByText('Allocation applied.')).not.toBeInTheDocument();
  });
}

test('confirms an immediately completed resumed stream without missing its busy transition', async () => {
  const subject = setup({ immediate: true });
  subject.start();
  const approve = await screen.findByRole('button', {
    name: 'Approve and apply',
  });
  await waitFor(() => expect(approve).toBeEnabled());

  fireEvent.click(approve);

  await waitFor(() =>
    expect(subject.onApplied).toHaveBeenCalledExactlyOnceWith(snapshot),
  );
});

test('does not claim cancellation when the resumed stream fails', async () => {
  const subject = setup({ resumeError: true });
  subject.start();
  const decline = await screen.findByRole('button', { name: 'Decline' });
  await waitFor(() => expect(decline).toBeEnabled());

  fireEvent.click(decline);
  await waitFor(() => expect(subject.requests).toHaveLength(2));
  await subject.finish();

  await screen.findByRole('alert');
  expect(
    screen.queryByText('Review cancelled. No allocation was requested.'),
  ).not.toBeInTheDocument();
  expect(subject.fetcher).toHaveBeenCalledTimes(1);
});

test('checks recorded success when the approved resumed stream fails', async () => {
  const subject = setup({ resumeError: true });
  subject.start();
  const approve = await screen.findByRole('button', {
    name: 'Approve and apply',
  });
  await waitFor(() => expect(approve).toBeEnabled());

  fireEvent.click(approve);
  await waitFor(() => expect(subject.requests).toHaveLength(2));
  await subject.finish();

  await waitFor(() =>
    expect(subject.onApplied).toHaveBeenCalledExactlyOnceWith(snapshot),
  );
});

test('releases the message claim after an immediately completed initial turn', async () => {
  const subject = setup({ initialComplete: true });

  await act(async () => {
    subject.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  await waitFor(() => expect(subject.requests).toHaveLength(1));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeEnabled(),
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
    target: { value: 'Try matching again' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  await waitFor(() => expect(subject.requests).toHaveLength(2));
});
