import type {
  PendingInterruptBatch,
  TransportOrFactory,
} from '@hashbrownai/core';
import { exposeComponent, useUiChat } from '@hashbrownai/react';
import {
  allocationProposalConfig,
  type LedgerSnapshot,
  type Proposal,
} from '@invoicing/contracts';
import {
  Fragment,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  AllocationProposal,
  AllocationProposalContext,
} from './allocation-proposal';

const components = [
  exposeComponent(AllocationProposal, allocationProposalConfig),
];
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function validProposal(value: unknown, paymentId: string): value is Proposal {
  if (!record(value) || value.paymentId !== paymentId) return false;
  return (
    ['proposalId', 'operationId', 'invoiceId', 'customerId', 'currency'].every(
      (key) => typeof value[key] === 'string' && value[key].length > 0,
    ) &&
    [
      'generation',
      'proposalVersion',
      'expectedPaymentVersion',
      'expectedInvoiceVersion',
      'amountCents',
    ].every(
      (key) => Number.isSafeInteger(value[key]) && Number(value[key]) > 0,
    ) &&
    typeof value.currency === 'string' &&
    /^[A-Z]{3}$/.test(value.currency)
  );
}

function expectedBatch(batch: PendingInterruptBatch): boolean {
  const interrupt = batch.interrupts[0];
  const metadata = interrupt?.metadata;
  return (
    batch.interrupts.length === 1 &&
    interrupt.reason === 'tool' &&
    metadata?.['type'] === 'permission-request' &&
    record(metadata['detail']) &&
    metadata['detail']['toolName'] === 'applyAllocation'
  );
}

/** Event-driven entry point for the single-payment proof runtime. */
export interface ReviewChatHandle {
  /** Start from a selection event; false leaves the current review unchanged. */
  startReview(paymentId: string): boolean;
}

/** Inputs for the stable, single-payment proof runtime. */
export interface ReviewChatProps {
  readonly selectedPaymentId?: string;
  readonly ref?: Ref<ReviewChatHandle>;
  readonly onApplied: (snapshot: LedgerSnapshot) => void;
  readonly transport?: TransportOrFactory;
}

interface OwnedReview {
  readonly batch: PendingInterruptBatch;
  readonly proposal: Proposal;
}
interface Attempt extends OwnedReview {
  readonly approve: boolean;
}
type Phase =
  'idle' | 'submitting' | 'verifying' | 'applied' | 'cancelled' | 'failed';

/** Review a selected payment through a trusted UI and server-owned approval. */
export function ReviewChat({
  selectedPaymentId,
  onApplied,
  transport,
  ref,
}: ReviewChatProps) {
  const [threadId] = useState(() => crypto.randomUUID());
  const [prompt, setPrompt] = useState('');
  const [owned, setOwned] = useState<OwnedReview>();
  const [attempt, setAttempt] = useState<Attempt>();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const submitted = useRef(false);
  const sendClaim = useRef(false);
  const boundPaymentId = useRef<string | undefined>(undefined);
  const chat = useUiChat({
    system:
      'Review the selected payment. Prepare a server proposal and show AllocationProposal before requesting applyAllocation approval.',
    components,
    transport,
    threadId,
    state: {} as Record<string, unknown>,
    debounceTime: 0,
  });
  const { pendingInterrupts, isLoading, isResuming } = chat;
  const runtimeError = chat.error || chat.sendingError || chat.generatingError;

  // The ref blocks repeated calls in one event. After commit, runtime busy
  // and pending flags own the gate, including turns that finished immediately.
  useEffect(() => {
    sendClaim.current = false;
  });

  useEffect(() => {
    if (!pendingInterrupts || submitted.current) return;
    const controller = new AbortController();
    setOwned(undefined);
    if (!expectedBatch(pendingInterrupts)) {
      setError(
        'This review contains an unsupported approval request. Start a new review.',
      );
      return;
    }
    setError('');
    void (async () => {
      try {
        const response = await fetch(
          `/api/reviews/${encodeURIComponent(threadId)}`,
          { credentials: 'same-origin', signal: controller.signal },
        );
        if (!response.ok) throw new Error('Review unavailable');
        const proposal: unknown = await response.json();
        if (!validProposal(proposal, selectedPaymentId ?? ''))
          throw new Error('Invalid proposal');
        if (!controller.signal.aborted)
          setOwned({ batch: pendingInterrupts, proposal });
      } catch {
        if (!controller.signal.aborted)
          setError('Unable to verify this proposal. No approval is available.');
      }
    })();
    return () => controller.abort();
  }, [pendingInterrupts, selectedPaymentId, threadId]);

  // resume() claims the runtime synchronously before this post-event effect runs.
  // Busy flags therefore cover slow streams and immediately completed streams.
  useEffect(() => {
    if (phase !== 'submitting' || !attempt || isLoading || isResuming) return;
    if (attempt.approve) setPhase('verifying');
    else if (runtimeError || pendingInterrupts) {
      setPhase('failed');
      setError(
        'Cancellation could not be confirmed. No allocation was requested.',
      );
    } else setPhase('cancelled');
  }, [phase, attempt, isLoading, isResuming, runtimeError, pendingInterrupts]);

  useEffect(() => {
    if (phase !== 'verifying' || !attempt) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/operations/${encodeURIComponent(attempt.proposal.operationId)}`,
          { credentials: 'same-origin', signal: controller.signal },
        );
        if (!response.ok) throw new Error('Operation unavailable');
        const result: unknown = await response.json();
        if (
          !record(result) ||
          result.proposalId !== attempt.proposal.proposalId ||
          result.operationId !== attempt.proposal.operationId ||
          result.status !== 'approved' ||
          !record(result.snapshot) ||
          !['payments', 'invoices', 'allocations', 'activities'].every((key) =>
            Array.isArray((result.snapshot as Record<string, unknown>)[key]),
          )
        )
          throw new Error('Unconfirmed operation');
        if (controller.signal.aborted) return;
        setPhase('applied');
        setError('');
        onApplied(result.snapshot as unknown as LedgerSnapshot);
      } catch {
        if (!controller.signal.aborted) {
          setPhase('failed');
          setError(
            'The allocation could not be confirmed. Refresh the ledger before starting another review.',
          );
        }
      }
    })();
    return () => controller.abort();
  }, [phase, attempt, onApplied]);

  const busy =
    isLoading || isResuming || phase === 'submitting' || phase === 'verifying';
  const canDecide = Boolean(
    owned &&
    owned.proposal.paymentId === selectedPaymentId &&
    owned.batch.id === pendingInterrupts?.id &&
    expectedBatch(owned.batch) &&
    phase === 'idle' &&
    !busy,
  );
  const holdMessages = busy || Boolean(pendingInterrupts) || phase !== 'idle';

  useImperativeHandle(ref, () => ({
    startReview: (paymentId: string) =>
      send('Review the selected payment and propose an allocation.', paymentId),
  }));

  function send(content: string, paymentId = selectedPaymentId): boolean {
    if (
      holdMessages ||
      sendClaim.current ||
      !content.trim() ||
      !paymentId ||
      (boundPaymentId.current && boundPaymentId.current !== paymentId)
    )
      return false;
    sendClaim.current = true;
    setError('');
    try {
      chat.setState({ selectedPaymentId: paymentId });
      chat.sendMessage({ role: 'user', content: content.trim() });
      boundPaymentId.current = paymentId;
      setPrompt('');
      return true;
    } catch {
      sendClaim.current = false;
      setError('Unable to start the review. Please try again.');
      return false;
    }
  }

  function decide(approve: boolean) {
    if (!canDecide || !owned || submitted.current) return;
    submitted.current = true;
    setAttempt({ ...owned, approve });
    setPhase('submitting');
    const { proposal, batch } = owned;
    try {
      chat.setState({
        selectedPaymentId,
        proposalId: proposal.proposalId,
        proposalVersion: proposal.proposalVersion,
        operationId: proposal.operationId,
        generation: proposal.generation,
      });
      chat.resume({
        batchId: batch.id,
        entries: batch.interrupts.map(({ id }) =>
          approve
            ? { interruptId: id, status: 'resolved', payload: 'once' }
            : { interruptId: id, status: 'cancelled' },
        ),
      });
    } catch {
      if (!approve) {
        setPhase('failed');
        setError('Unable to cancel this review. No allocation was requested.');
      }
    }
  }

  return (
    <section aria-label="Payment review chat">
      <AllocationProposalContext.Provider
        value={{
          verifiedProposal: owned?.proposal,
          selectedPaymentId,
          pendingForProposal: canDecide,
          isApplying: busy && Boolean(attempt),
          onApprove: () => decide(true),
          onDecline: () => decide(false),
        }}
      >
        {chat.messages.map((message, index) =>
          message.role === 'assistant' ? (
            <Fragment key={index}>{message.ui}</Fragment>
          ) : message.role === 'user' ? (
            <p key={index}>
              {typeof message.content === 'string' ? message.content : ''}
            </p>
          ) : null,
        )}
      </AllocationProposalContext.Provider>
      {pendingInterrupts && !owned && !error && (
        <p role="status">Verifying proposal…</p>
      )}
      {phase === 'applied' && <p role="status">Allocation applied.</p>}
      {phase === 'cancelled' && (
        <p role="status">Review cancelled. No allocation was requested.</p>
      )}
      {(error || (runtimeError && phase !== 'applied')) && (
        <p role="alert">
          {error ||
            'The review could not finish. Check the ledger before trying again.'}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(prompt);
        }}
      >
        <label htmlFor={`review-message-${threadId}`}>Message</label>
        <input
          id={`review-message-${threadId}`}
          value={prompt}
          disabled={holdMessages || !selectedPaymentId}
          onChange={(event) => setPrompt(event.currentTarget.value)}
        />
        <button
          type="submit"
          disabled={holdMessages || !selectedPaymentId || !prompt.trim()}
        >
          Send
        </button>
      </form>
    </section>
  );
}
