import {
  createContext,
  Fragment,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { HashbrownProvider, useUiChat } from '@hashbrownai/react';
import type { TransportOrFactory } from '@hashbrownai/core';
import type { LedgerSnapshot } from '@invoicing/contracts';
import { findRenderCall, RenderDraft } from './assistant-draft';
import { assistantKit } from './assistant-kit';
import { ReviewChat, type ReviewChatHandle } from './review-chat';
import { SnapshotContext } from './snapshot-context';

const ActionContext = createContext<{
  review: (id: string) => boolean;
  disabled: boolean;
  snapshot: LedgerSnapshot;
} | null>(null);
function ReviewPayment({ paymentId }: { paymentId: string }) {
  const context = useContext(ActionContext);
  const payment = context?.snapshot.payments.find((p) => p.id === paymentId);
  if (!context || !payment || payment.unappliedCents <= 0) return null;
  return (
    <button
      disabled={context.disabled}
      onClick={() => context.review(paymentId)}
    >
      Review {payment.reference ?? paymentId}
    </button>
  );
}
const components = assistantKit(ReviewPayment);
const ASSISTANT_URL = '/agui/%2Fassistant%23agent';

/** Explicit matching entry point; false means an existing operation or invoice choice needs attention. */
export interface AssistantWorkspaceHandle {
  beginReview(paymentId: string, invoiceId?: string): boolean;
}
/** Application state and transports for the conversational assistant and isolated reviews. */
export interface AssistantWorkspaceProps {
  readonly ref?: Ref<AssistantWorkspaceHandle>;
  readonly selectedPaymentId?: string;
  readonly snapshot: LedgerSnapshot;
  readonly onApplied: (snapshot: LedgerSnapshot) => void;
  /** Reports whether conversation or an unresolved review prevents matching. */
  readonly onBusyChange?: (busy: boolean) => void;
  readonly transport?: TransportOrFactory;
}
interface Session {
  readonly id: string;
  readonly paymentId: string;
  readonly invoiceId: string;
}

function ReviewSession({
  session,
  snapshot,
  onApplied,
  onTerminal,
  transport,
}: {
  session: Session;
  snapshot: LedgerSnapshot;
  onApplied: (snapshot: LedgerSnapshot) => void;
  onTerminal: () => void;
  transport?: TransportOrFactory;
}) {
  const handle = useRef<ReviewChatHandle>(null);
  const started = useRef(false);
  const [terminal, setTerminal] = useState<
    'applied' | 'cancelled' | 'failed'
  >();
  const [expanded, setExpanded] = useState(false);
  const finish = useCallback(
    (status: 'applied' | 'cancelled' | 'failed') => {
      setTerminal(status);
      onTerminal();
    },
    [onTerminal],
  );
  const payment = snapshot.payments.find(
    (record) => record.id === session.paymentId,
  );
  const invoice = snapshot.invoices.find(
    (record) => record.id === session.invoiceId,
  );
  useEffect(() => {
    if (!started.current && handle.current) {
      started.current = true;
      if (!handle.current.startReview(session.paymentId)) finish('failed');
    }
  }, [session.paymentId, finish]);
  return (
    <details className="review-history" open={!terminal || expanded}>
      <summary
        onClick={(event) => {
          event.preventDefault();
          if (terminal) setExpanded((value) => !value);
        }}
      >
        {terminal ? `Review ${terminal}` : 'Payment review'} ·{' '}
        {payment?.reference ?? session.paymentId} →{' '}
        {invoice?.reference ?? session.invoiceId}
      </summary>
      <HashbrownProvider url="/agui/%2Freview%23agent">
        <ReviewChat
          ref={handle}
          selectedPaymentId={session.paymentId}
          selectedInvoiceId={session.invoiceId}
          snapshot={snapshot}
          showComposer={false}
          onApplied={onApplied}
          onTerminal={finish}
          transport={transport}
        />
      </HashbrownProvider>
    </details>
  );
}

function Conversation({
  selectedPaymentId,
  locked,
  onBusy,
  transport,
}: {
  selectedPaymentId?: string;
  locked: boolean;
  onBusy: (busy: boolean) => void;
  transport?: TransportOrFactory;
}) {
  const [threadId] = useState(() => crypto.randomUUID());
  const [prompt, setPrompt] = useState('');
  const chat = useUiChat({
    components,
    threadId,
    transport,
    state: {} as Record<string, unknown>,
    debounceTime: 0,
    system:
      'Answer questions about the current server ledger using trusted text and review action components.',
  });
  const busy = chat.isLoading || chat.isResuming;
  const claim = useRef(false);
  useEffect(() => {
    claim.current = false;
    onBusy(busy);
  }, [busy, onBusy]);
  return (
    <section aria-label="Ledger conversation">
      {chat.messages.map((message, index) => {
        if (message.role === 'user')
          return (
            <p className="user-message" key={index}>
              {typeof message.content === 'string' ? message.content : ''}
            </p>
          );
        if (message.role !== 'assistant') return null;
        if (message.ui) return <Fragment key={index}>{message.ui}</Fragment>;
        // The validated answer arrives as a later assistant message with
        // `ui`; until it does, the server's render call, surfaced by hashbrown
        // with its arguments as they stream, stands in for it, drawn through
        // the same components so the swap is invisible.
        const draft = findRenderCall(message.serverToolCalls);
        const superseded = chat.messages
          .slice(index + 1)
          .some((later) => later.role === 'assistant' && later.ui);
        return draft && !superseded ? (
          <RenderDraft key={index} args={draft} />
        ) : null;
      })}
      {(chat.error || chat.sendingError || chat.generatingError) && (
        <p role="alert">
          The assistant could not finish. No financial changes were made by this
          conversation. Try again.
        </p>
      )}
      {busy && <p role="status">Reading your ledger…</p>}
      {locked && (
        <p role="status">
          Finish the payment review below before sending another message.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!prompt.trim() || busy || locked || claim.current) return;
          claim.current = true;
          chat.setState(selectedPaymentId ? { selectedPaymentId } : {});
          chat.sendMessage({ role: 'user', content: prompt.trim() });
          setPrompt('');
        }}
      >
        <label htmlFor="ledger-message">Message assistant</label>
        <textarea
          id="ledger-message"
          value={prompt}
          placeholder="Ask about invoices or incoming payments…"
          disabled={busy || locked}
          onChange={(event) => setPrompt(event.currentTarget.value)}
        />
        <button type="submit" disabled={busy || locked || !prompt.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}

/** Keep read-only conversation available between independently authorized allocation reviews. */
export function AssistantWorkspace({
  ref,
  selectedPaymentId,
  snapshot,
  onApplied,
  onBusyChange,
  transport,
}: AssistantWorkspaceProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [active, setActive] = useState<string>();
  const activeClaim = useRef<string | undefined>(undefined);
  const [conversationBusy, setConversationBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    onBusyChange?.(Boolean(active) || conversationBusy);
  }, [active, conversationBusy, onBusyChange]);
  function beginReview(paymentId: string, invoiceId?: string): boolean {
    if (activeClaim.current || conversationBusy) return false;
    const payment = snapshot.payments.find((p) => p.id === paymentId);
    if (!payment || payment.unappliedCents <= 0) {
      setNotice('This payment has no unapplied balance.');
      return false;
    }
    const candidates = snapshot.invoices.filter(
      (i) =>
        i.customerId === payment.customerId &&
        i.currency === payment.currency &&
        i.outstandingCents > 0,
    );
    const invoice = invoiceId
      ? candidates.find((i) => i.id === invoiceId)
      : candidates.length === 1
        ? candidates[0]
        : undefined;
    if (!invoice) {
      setNotice(
        candidates.length
          ? 'Select this payment in the grid and choose an invoice before matching.'
          : 'No outstanding invoice is available for this payment.',
      );
      return false;
    }
    const session = {
      id: crypto.randomUUID(),
      paymentId,
      invoiceId: invoice.id,
    };
    activeClaim.current = session.id;
    setActive(session.id);
    setSessions((previous) => [...previous, session]);
    setNotice('');
    return true;
  }
  useImperativeHandle(ref, () => ({ beginReview }));
  return (
    <ActionContext.Provider
      value={{
        review: beginReview,
        disabled: Boolean(active) || conversationBusy,
        snapshot,
      }}
    >
      <SnapshotContext.Provider value={snapshot}>
        <HashbrownProvider url={ASSISTANT_URL}>
          <Conversation
            selectedPaymentId={selectedPaymentId}
            locked={Boolean(active)}
            onBusy={setConversationBusy}
            transport={transport}
          />
        </HashbrownProvider>
        {notice && <p role="status">{notice}</p>}
        {sessions.map((session) => (
          <ReviewSession
            key={session.id}
            session={session}
            snapshot={snapshot}
            onApplied={onApplied}
            transport={transport}
            onTerminal={() => {
              if (activeClaim.current === session.id) {
                activeClaim.current = undefined;
                setActive(undefined);
              }
            }}
          />
        ))}
      </SnapshotContext.Provider>
    </ActionContext.Provider>
  );
}
