import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TransportOrFactory } from '@hashbrownai/core';
import {
  AssistantWorkspace,
  type AssistantWorkspaceHandle,
} from './assistant-workspace';
import type { LedgerSnapshot } from '@invoicing/contracts';
import { DashboardView } from './dashboard-view';
import {
  type FocusAction,
  focusFromSearch,
  focusReducer,
  focusSelection,
  focusToSearch,
  sanitizeFocus,
} from './focus';
import { HABITS, money } from './ledger-views';

/** Initial data and optional snapshot transport for the invoicing workspace. */
export interface AppProps {
  readonly initialSnapshot?: LedgerSnapshot;
  readonly enableAssistant?: boolean;
  readonly transport?: TransportOrFactory;
  readonly loadSnapshot?: () => Promise<LedgerSnapshot>;
}

async function fetchSnapshot(): Promise<LedgerSnapshot> {
  const response = await fetch('/api/snapshot', { credentials: 'same-origin' });
  if (!response.ok)
    throw new Error(`Snapshot request failed: ${response.status}`);
  return response.json();
}

const BUSY_NOTICE =
  'Finish the current assistant request or approval before starting another match.';

/** Live ledger workspace: one dashboard whose focus the assistant shares. */
export function App({
  initialSnapshot,
  loadSnapshot = fetchSnapshot,
  enableAssistant = false,
  transport,
}: AppProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState(false);
  const reviewRef = useRef<AssistantWorkspaceHandle>(null);
  const [reviewNotice, setReviewNotice] = useState('');
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [matchRequest, setMatchRequest] = useState(0);
  const handleBusyChange = useCallback((busy: boolean) => {
    setAssistantBusy(busy);
    if (!busy) setReviewNotice('');
  }, []);
  const [focusState, setFocusState] = useState(() =>
    focusFromSearch(window.location.search),
  );
  // Derived, not stored: ids the ledger does not know drop out as soon as it loads.
  const focus = useMemo(
    () => (snapshot ? sanitizeFocus(focusState, snapshot) : focusState),
    [focusState, snapshot],
  );
  function dispatchFocus(action: FocusAction) {
    setReviewNotice('');
    setFocusState((prev) =>
      focusReducer(snapshot ? sanitizeFocus(prev, snapshot) : prev, action),
    );
  }
  useEffect(() => {
    const search = focusToSearch(focus);
    if (window.location.search === search) return;
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${search}${window.location.hash}`,
    );
  }, [focus]);

  // The assistant offered a payment without a clear invoice: bring its match panel to the user.
  useEffect(() => {
    if (!matchRequest) return;
    const panel = document.getElementById('match-panel');
    panel?.scrollIntoView?.({ block: 'center' });
    panel?.focus();
  }, [matchRequest]);

  function chooseInvoice(paymentId: string) {
    const payment = snapshot?.payments.find((p) => p.id === paymentId);
    if (!payment) return;
    dispatchFocus({
      type: 'set-tab',
      tab: payment.unappliedCents > 0 ? 'unapplied' : 'payments',
    });
    dispatchFocus({
      type: 'select-payment',
      paymentId,
      clientId: payment.customerId,
    });
    setMatchRequest((count) => count + 1);
  }

  function review(paymentId: string, invoiceIds: readonly string[]) {
    const started = reviewRef.current?.beginReview(paymentId, invoiceIds);
    setReviewNotice(started || !assistantBusy ? '' : BUSY_NOTICE);
  }

  useEffect(() => {
    if (initialSnapshot) return;
    let active = true;
    loadSnapshot()
      .then((data) => {
        if (active) setSnapshot(data);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [initialSnapshot, loadSnapshot]);

  const selection = focusSelection(focus);
  const focusedClient = snapshot?.customers.find(
    (customer) => customer.id === focus.clientId,
  );
  const focusedInvoice = snapshot?.invoices.find(
    (invoice) => invoice.id === selection.focusedInvoiceId,
  );
  const selected = snapshot?.payments.find(
    (payment) => payment.id === selection.selectedPaymentId,
  );

  return (
    <div className="workspace">
      <nav className="navigation" aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark">S</span> Studio
        </div>
        <button aria-current="page">
          <span aria-hidden="true">▦</span>
          Dashboard
        </button>
        <p className="nav-footer">
          Software consulting
          <br />
          Sample workspace
        </p>
      </nav>
      <main>
        <header className="page-header">
          <span>Dashboard</span>
          <span className="badge">Sample ledger · Sep 15, 2026</span>
        </header>
        <div className="content">
          <h1>Business overview</h1>
          <p className="muted">
            Select a client, invoice or payment to focus the charts.
          </p>
          {!snapshot && !error && <p role="status">Loading ledger…</p>}
          {error && (
            <p role="alert">
              Unable to load the ledger. Please reload and try again.
            </p>
          )}
          {snapshot && (
            <DashboardView
              snapshot={snapshot}
              focus={focus}
              onFocus={dispatchFocus}
              match={{
                onReview: enableAssistant ? review : undefined,
                notice: reviewNotice && assistantBusy ? reviewNotice : '',
              }}
            />
          )}
        </div>
      </main>
      <aside className="assistant" aria-label="Assistant sidebar">
        <header className="page-header">
          <span>Assistant</span>
          <span aria-hidden="true">✧</span>
        </header>
        <div className="assistant-body">
          <h2>
            {selected
              ? 'Payment context'
              : focusedClient
                ? 'Client context'
                : 'Your business assistant'}
          </h2>
          {selected ? (
            <div className="selection-summary">
              <strong>{selected.reference ?? selected.id}</strong>
              <span>{selected.customerName ?? selected.customerId}</span>
              <span>
                {money(selected.unappliedCents, selected.currency)} unapplied
              </span>
            </div>
          ) : focusedClient ? (
            <div className="selection-summary">
              <strong>{focusedClient.name}</strong>
              <span>
                {focusedClient.currency} · {HABITS[focusedClient.profile].label}
              </span>
              {focusedInvoice && (
                <span>{focusedInvoice.reference ?? focusedInvoice.id}</span>
              )}
            </div>
          ) : (
            <p className="muted">
              Select a client, invoice or payment to bring its details into the
              conversation.
            </p>
          )}
          {enableAssistant && snapshot ? (
            <AssistantWorkspace
              ref={reviewRef}
              snapshot={snapshot}
              selectedPaymentId={selection.selectedPaymentId}
              focusedClientId={selection.focusedClientId}
              focusedInvoiceId={selection.focusedInvoiceId}
              transport={transport}
              onApplied={setSnapshot}
              onBusyChange={handleBusyChange}
              onChooseInvoice={chooseInvoice}
            />
          ) : (
            <p className="connection-notice">
              Assistant connection is not ready yet. Payment context is
              available here; no allocation actions are enabled.
            </p>
          )}
        </div>
        {!enableAssistant && (
          <div className="composer">
            <textarea
              aria-label="Message assistant"
              placeholder="Ask about your business…"
              disabled
            />
            <div>
              <small>Connection pending</small>
              <button disabled aria-label="Send message">
                ↑
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

/** Creates the initial snapshot loader for one application bootstrap. */
export function createSnapshotLoader(
  request: () => Promise<LedgerSnapshot> = fetchSnapshot,
): () => Promise<LedgerSnapshot> {
  let initialRequest: Promise<LedgerSnapshot> | undefined;
  return () => {
    initialRequest ??= request();
    return initialRequest;
  };
}
