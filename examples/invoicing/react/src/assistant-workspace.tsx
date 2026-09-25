import {
  createContext,
  Fragment,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { HashbrownProvider, useUiChat } from '@hashbrownai/react';
import type { TransportOrFactory } from '@hashbrownai/core';
import type { LedgerSnapshot, Proposal } from '@invoicing/contracts';
import { findRenderCall, RenderDraft } from './assistant-draft';
import { assistantKit } from './assistant-kit';
import { appliedSummary, listJoin } from './ledger-views';
import { ReviewChat, type ReviewChatHandle } from './review-chat';
import { SnapshotContext } from './snapshot-context';

const ActionContext = createContext<{
  review: (paymentId: string, invoiceIds?: readonly string[]) => boolean;
  disabled: boolean;
  snapshot: LedgerSnapshot;
} | null>(null);

/**
 * The model's offer to match a payment. With invoices it starts that review
 * directly, one review for all of them; without any it reviews the payment,
 * or hands an ambiguous payment to the page's invoice picker.
 */
function ReviewPayment({
  paymentId,
  invoiceIds,
}: {
  paymentId: string;
  invoiceIds?: readonly string[] | null;
}) {
  const context = useContext(ActionContext);
  const payment = context?.snapshot.payments.find((p) => p.id === paymentId);
  const invoices = (invoiceIds ?? []).map((id) =>
    context?.snapshot.invoices.find((i) => i.id === id),
  );
  if (!context || !payment || payment.unappliedCents <= 0) return null;
  if (invoices.some((invoice) => !invoice || invoice.outstandingCents <= 0))
    return null;
  const named = invoices.filter((invoice) => invoice !== undefined);
  return (
    <button
      className="review-action"
      disabled={context.disabled}
      onClick={() =>
        context.review(
          paymentId,
          named.length ? named.map((invoice) => invoice.id) : undefined,
        )
      }
    >
      {named.length
        ? `Match to ${listJoin(named.map((invoice) => invoice.reference ?? 'invoice'))}`
        : `Review ${payment.reference ?? 'payment'}`}
    </button>
  );
}
const components = assistantKit(ReviewPayment);
const ASSISTANT_URL = '/agui/%2Fassistant%23agent';

const STARTERS = [
  'How much cash is still unapplied?',
  'Which clients pay late?',
  'How did invoicing trend over the last 6 months?',
] as const;
const SELECTED_STARTER = 'Which invoices does this payment cover?';

/** Explicit matching entry point; false means an existing operation or invoice choice needs attention. */
export interface AssistantWorkspaceHandle {
  beginReview(paymentId: string, invoiceIds?: readonly string[]): boolean;
}
/** Application state and transports for the conversational assistant and isolated reviews. */
export interface AssistantWorkspaceProps {
  readonly ref?: Ref<AssistantWorkspaceHandle>;
  readonly selectedPaymentId?: string;
  readonly snapshot: LedgerSnapshot;
  readonly onApplied: (snapshot: LedgerSnapshot) => void;
  /** Reports whether conversation or an unresolved review prevents matching. */
  readonly onBusyChange?: (busy: boolean) => void;
  /**
   * Called when the assistant offers a payment with several open invoices and
   * no clear match, so the page can select it and ask the user to choose.
   */
  readonly onChooseInvoice?: (paymentId: string) => void;
  readonly transport?: TransportOrFactory;
}
interface Session {
  readonly id: string;
  readonly paymentId: string;
  readonly invoiceIds: readonly string[];
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
  const [appliedProposal, setAppliedProposal] = useState<Proposal>();
  const [expanded, setExpanded] = useState(false);
  const finish = useCallback(
    (status: 'applied' | 'cancelled' | 'failed', proposal?: Proposal) => {
      setTerminal(status);
      if (status === 'applied') setAppliedProposal(proposal);
      onTerminal();
    },
    [onTerminal],
  );
  const payment = snapshot.payments.find(
    (record) => record.id === session.paymentId,
  );
  const invoices = session.invoiceIds.map((id) =>
    snapshot.invoices.find((record) => record.id === id),
  );
  useEffect(() => {
    if (!started.current && handle.current) {
      started.current = true;
      if (!handle.current.startReview(session.paymentId)) finish('failed');
    }
  }, [session.paymentId, finish]);
  return (
    <>
      <details className="review-history" open={!terminal || expanded}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            if (terminal) setExpanded((value) => !value);
          }}
        >
          {terminal ? `Review ${terminal}` : 'Payment review'} ·{' '}
          {payment?.reference ?? 'payment'} →{' '}
          {invoices
            .map((invoice) => invoice?.reference ?? 'invoice')
            .join(', ')}
        </summary>
        <HashbrownProvider url="/agui/%2Freview%23agent">
          <ReviewChat
            ref={handle}
            selectedPaymentId={session.paymentId}
            selectedInvoiceIds={session.invoiceIds}
            snapshot={snapshot}
            showComposer={false}
            onApplied={onApplied}
            onTerminal={finish}
            transport={transport}
          />
        </HashbrownProvider>
      </details>
      {appliedProposal && (
        <p className="review-outcome" role="status">
          {appliedSummary(snapshot, appliedProposal)}
        </p>
      )}
    </>
  );
}

function Conversation({
  selectedPaymentId,
  locked,
  onBusy,
  transport,
  children,
}: {
  selectedPaymentId?: string;
  locked: boolean;
  onBusy: (busy: boolean) => void;
  transport?: TransportOrFactory;
  /** Reviews and notices that belong in the thread, after the messages. */
  children?: ReactNode;
}) {
  const [threadId] = useState(() => crypto.randomUUID());
  const [prompt, setPrompt] = useState('');
  const thread = useRef<HTMLDivElement>(null);
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
  // Keep the newest message, answer or review in view as the thread grows.
  const childCount = Array.isArray(children) ? children.flat().length : 0;
  useLayoutEffect(() => {
    const element = thread.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [chat.messages.length, childCount, locked]);

  function send(text: string) {
    const content = text.trim();
    if (!content || busy || locked || claim.current) return;
    claim.current = true;
    chat.setState(selectedPaymentId ? { selectedPaymentId } : {});
    chat.sendMessage({ role: 'user', content });
    setPrompt('');
  }

  const starters = selectedPaymentId
    ? [SELECTED_STARTER, ...STARTERS.slice(0, 2)]
    : STARTERS;
  return (
    <section className="conversation" aria-label="Ledger conversation">
      <div className="thread" ref={thread}>
        {chat.messages.length === 0 && !locked && (
          <div
            className="starters"
            role="group"
            aria-label="Suggested questions"
          >
            {starters.map((starter) => (
              <button
                key={starter}
                type="button"
                disabled={busy}
                onClick={() => send(starter)}
              >
                {starter}
              </button>
            ))}
          </div>
        )}
        {chat.messages.map((message, index) => {
          if (message.role === 'user')
            return (
              <p className="user-message" key={index}>
                {typeof message.content === 'string' ? message.content : ''}
              </p>
            );
          if (message.role !== 'assistant') return null;
          if (message.ui) return <Fragment key={index}>{message.ui}</Fragment>;
          // The answer is the server's render call, surfaced by hashbrown with
          // its arguments as they stream: a draft until the server validates
          // the call, then the final answer, drawn through the same
          // components. A call the server rejected shows nothing; the model
          // retries or the run ends in the error alert below.
          const call = findRenderCall(message.serverToolCalls);
          return call && call.state !== 'failed' ? (
            <RenderDraft
              key={index}
              args={call.args}
              validated={call.state === 'validated'}
              ReviewPayment={ReviewPayment}
            />
          ) : null;
        })}
        {(chat.error || chat.sendingError || chat.generatingError) && (
          <p role="alert">
            The assistant could not finish. No financial changes were made by
            this conversation. Try again.
          </p>
        )}
        {busy && <p role="status">Reading your ledger…</p>}
        {children}
      </div>
      {locked && (
        <p role="status" className="composer-note">
          Finish the payment review above before sending another message.
        </p>
      )}
      <form
        className="composer-form"
        onSubmit={(event) => {
          event.preventDefault();
          send(prompt);
        }}
      >
        <label htmlFor="ledger-message">Message assistant</label>
        <textarea
          id="ledger-message"
          value={prompt}
          placeholder="Ask about invoices or incoming payments…"
          disabled={busy || locked}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              send(prompt);
            }
          }}
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
  onChooseInvoice,
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
  function beginReview(
    paymentId: string,
    invoiceIds?: readonly string[],
  ): boolean {
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
    const requested = invoiceIds?.length
      ? invoiceIds.map((id) => candidates.find((i) => i.id === id))
      : candidates.length === 1
        ? [candidates[0]]
        : [];
    const named = requested.filter((invoice) => invoice !== undefined);
    if (named.length === 0 || named.length !== requested.length) {
      if (!invoiceIds?.length && candidates.length > 1 && onChooseInvoice) {
        setNotice('');
        onChooseInvoice(paymentId);
        return false;
      }
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
      invoiceIds: named.map((invoice) => invoice.id),
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
          >
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
          </Conversation>
        </HashbrownProvider>
      </SnapshotContext.Provider>
    </ActionContext.Provider>
  );
}
