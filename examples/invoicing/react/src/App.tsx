import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TransportOrFactory } from '@hashbrownai/core';
import {
  AssistantWorkspace,
  type AssistantWorkspaceHandle,
} from './assistant-workspace';
import { type PretableColumn, PretableSurface } from '@pretable/react';
import type { LedgerSnapshot } from '@invoicing/contracts';
import { DashboardView } from './dashboard-view';
import {
  type FocusAction,
  focusFromSearch,
  focusReducer,
  focusToSearch,
  sanitizeFocus,
} from './focus';
import { HABITS, money } from './ledger-views';

type Payment = LedgerSnapshot['payments'][number];

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

/** Live ledger workspace with persistent payment context across its two pages. */
export function App({
  initialSnapshot,
  loadSnapshot = fetchSnapshot,
  enableAssistant = false,
  transport,
}: AppProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState(false);
  const [page, setPage] = useState<'Dashboard' | 'Payments'>('Dashboard');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const reviewRef = useRef<AssistantWorkspaceHandle>(null);
  const [paymentFilter, setPaymentFilter] = useState<'unmatched' | 'all'>(
    'unmatched',
  );
  const [invoiceChoice, setInvoiceChoice] = useState('');
  const [reviewNotice, setReviewNotice] = useState('');
  const [assistantBusy, setAssistantBusy] = useState(false);
  const pickerRef = useRef<HTMLSelectElement>(null);
  const [pickerRequest, setPickerRequest] = useState(0);
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
    setFocusState((prev) =>
      focusReducer(snapshot ? sanitizeFocus(prev, snapshot) : prev, action),
    );
  }
  // The most recent selection owns the assistant: focusing a client or invoice drops the payment.
  function handleFocus(action: FocusAction) {
    dispatchFocus(action);
    if (action.type !== 'select-client' && action.type !== 'select-invoice')
      return;
    setInvoiceChoice('');
    setReviewNotice('');
    setSelectedIds((ids) => (ids.length ? [] : ids));
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
  const focusedClient = snapshot?.customers.find(
    (customer) => customer.id === focus.clientId,
  );
  const focusedInvoice = snapshot?.invoices.find(
    (invoice) => invoice.id === focus.record?.id,
  );

  function selectPayment(ids: string[]) {
    const addedId = ids.find((id) => !selectedIds.includes(id));
    const nextId = addedId ?? ids[0];
    setInvoiceChoice('');
    setReviewNotice('');
    setSelectedIds(nextId ? [nextId] : []);
    // A payment selected now replaces any client focused earlier.
    if (nextId) dispatchFocus({ type: 'clear' });
  }

  // The assistant asked for an invoice choice: bring the picker to the user.
  useEffect(() => {
    if (!pickerRequest) return;
    pickerRef.current?.scrollIntoView?.({ block: 'center' });
    pickerRef.current?.focus();
  }, [pickerRequest]);

  function chooseInvoice(paymentId: string) {
    setPage('Payments');
    setInvoiceChoice('');
    setReviewNotice('');
    setSelectedIds([paymentId]);
    dispatchFocus({ type: 'clear' });
    setPickerRequest((count) => count + 1);
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

  const selected = snapshot?.payments.find(
    (payment) => payment.id === selectedIds[0],
  );
  const invoices = selected
    ? (snapshot?.invoices.filter(
        (invoice) =>
          invoice.customerId === selected.customerId &&
          invoice.currency === selected.currency,
      ) ?? [])
    : [];
  const outstandingInvoices = invoices.filter(
    (invoice) => invoice.outstandingCents > 0,
  );
  const paidInvoices = invoices.filter(
    (invoice) => invoice.outstandingCents === 0,
  );
  const targetInvoiceId =
    outstandingInvoices.length === 1
      ? outstandingInvoices[0].id
      : invoiceChoice;
  const visiblePayments = (snapshot?.payments ?? [])
    .filter(
      (payment) =>
        paymentFilter === 'all' ||
        payment.unappliedCents > 0 ||
        payment.id === selected?.id,
    )
    .toSorted(
      (a, b) =>
        Number(b.unappliedCents > 0) - Number(a.unappliedCents > 0) ||
        (b.date ?? '').localeCompare(a.date ?? ''),
    );
  function invoiceRow(invoice: LedgerSnapshot['invoices'][number]) {
    return (
      <div className="invoice-row" key={invoice.id}>
        <div>
          <strong>{invoice.reference ?? invoice.id}</strong>
          <small>
            {invoice.customerName ?? invoice.customerId} ·{' '}
            {invoice.date ?? 'Undated'}
          </small>
        </div>
        <div>
          <strong>{money(invoice.outstandingCents, invoice.currency)}</strong>
          <small>
            {invoice.outstandingCents === 0 ? 'Paid' : 'Outstanding'}
          </small>
        </div>
      </div>
    );
  }
  const columns: PretableColumn<Payment>[] = [
    ...(enableAssistant
      ? [
          {
            id: 'reviewSelection',
            header: '',
            widthPx: 44,
            sortable: false,
            filterable: false,
            type: 'text' as const,
            value: (row: Payment) => row.id,
            render: ({ row }: { row: Payment }) => (
              <input
                type="checkbox"
                aria-label="Select row"
                checked={selectedIds.includes(row.id)}
                onChange={() =>
                  selectPayment(selectedIds.includes(row.id) ? [] : [row.id])
                }
              />
            ),
          },
        ]
      : []),
    {
      id: 'id',
      header: 'Payment',
      flex: 3,
      minWidthPx: 215,
      type: 'text',
      value: (row) => row.id,
      render: ({ row }) => (
        <button
          className="payment-link"
          title={row.reference ?? row.id}
          aria-label={`Review ${row.id}`}
          onClick={() => selectPayment([row.id])}
        >
          {row.reference ?? row.id}
        </button>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      flex: 2,
      minWidthPx: 140,
      type: 'text',
      value: (row) => row.customerName ?? row.customerId,
    },
    {
      id: 'amount',
      header: 'Received',
      widthPx: 100,
      type: 'number',
      value: (row) => row.amountCents,
      format: ({ row }) => money(row.amountCents, row.currency),
    },
    {
      id: 'unapplied',
      header: 'Unapplied',
      widthPx: 100,
      type: 'number',
      value: (row) => row.unappliedCents,
      format: ({ row }) => money(row.unappliedCents, row.currency),
    },
    {
      id: 'date',
      header: 'Date',
      widthPx: 100,
      type: 'text',
      value: (row) => row.date ?? '—',
    },
    {
      id: 'status',
      header: 'Status',
      widthPx: 130,
      type: 'text',
      value: (row) =>
        row.unappliedCents === 0
          ? 'Matched'
          : row.unappliedCents < row.amountCents
            ? 'Partially matched'
            : 'Unmatched',
    },
  ];

  return (
    <div className="workspace">
      <nav className="navigation" aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark">S</span> Studio
        </div>
        {(['Dashboard', 'Payments'] as const).map((item) => (
          <button
            key={item}
            aria-current={page === item ? 'page' : undefined}
            onClick={() => setPage(item)}
          >
            <span aria-hidden="true">{item === 'Dashboard' ? '▦' : '↙'}</span>
            {item}
          </button>
        ))}
        <p className="nav-footer">
          Software consulting
          <br />
          Sample workspace
        </p>
      </nav>
      <main>
        <header className="page-header">
          <span>{page}</span>
          <span className="badge">Sample ledger · Sep 15, 2026</span>
        </header>
        <div className="content">
          <h1>{page === 'Dashboard' ? 'Business overview' : 'Payments'}</h1>
          <p className="muted">
            {page === 'Dashboard'
              ? 'Select a client or invoice to focus the charts.'
              : 'Select a payment to review its related invoices.'}
          </p>
          {!snapshot && !error && <p role="status">Loading ledger…</p>}
          {error && (
            <p role="alert">
              Unable to load the ledger. Please reload and try again.
            </p>
          )}
          {snapshot && (
            <>
              {page === 'Dashboard' && (
                <DashboardView
                  snapshot={snapshot}
                  focus={focus}
                  onFocus={handleFocus}
                />
              )}
              {page === 'Payments' && (
                <>
                  <div className="section-heading">
                    <h2>Incoming payments</h2>
                    <span className="muted">
                      {snapshot.payments.length} total
                    </span>
                  </div>
                  <div className="payment-filters" aria-label="Payment filters">
                    <button
                      aria-pressed={paymentFilter === 'unmatched'}
                      onClick={() => setPaymentFilter('unmatched')}
                    >
                      Unmatched
                    </button>
                    <button
                      aria-pressed={paymentFilter === 'all'}
                      onClick={() => setPaymentFilter('all')}
                    >
                      All payments
                    </button>
                  </div>
                  {paymentFilter === 'unmatched' &&
                    selected?.unappliedCents === 0 && (
                      <p className="muted">
                        Your selected matched payment stays visible for context.
                      </p>
                    )}
                  <div className="payment-grid">
                    <PretableSurface
                      rows={visiblePayments}
                      columns={columns}
                      getRowId={(row: Payment) => row.id}
                      ariaLabel="Incoming payments"
                      viewportHeight={320}
                      toolPanel={false}
                      rowSelectionColumn={
                        enableAssistant
                          ? undefined
                          : { enabled: true, headerCheckbox: false }
                      }
                      state={{
                        rowSelection: { kind: 'explicit', rowIds: selectedIds },
                      }}
                      onRowSelectionChange={
                        enableAssistant ? undefined : selectPayment
                      }
                    />
                  </div>
                  <section
                    className="invoice-context"
                    aria-label="Related invoices"
                  >
                    <h2>Related invoices</h2>
                    {!selected ? (
                      <p className="muted">
                        Select a payment above to see invoices for the same
                        customer and currency.
                      </p>
                    ) : (
                      <>
                        <p className="muted">
                          {selected.customerName ?? selected.customerId} ·{' '}
                          {selected.reference ?? selected.id}
                        </p>
                        {outstandingInvoices.map(invoiceRow)}
                        {outstandingInvoices.length === 0 && (
                          <p className="muted">
                            No outstanding invoices for this customer and
                            currency.
                          </p>
                        )}
                        {paidInvoices.length > 0 && (
                          <details>
                            <summary>
                              Paid invoices ({paidInvoices.length})
                            </summary>
                            {paidInvoices.map(invoiceRow)}
                          </details>
                        )}
                        {enableAssistant && (
                          <div className="match-controls">
                            {outstandingInvoices.length > 1 && (
                              <label>
                                Invoice to match
                                <select
                                  ref={pickerRef}
                                  aria-label="Invoice to match"
                                  value={invoiceChoice}
                                  onChange={(event) =>
                                    setInvoiceChoice(event.target.value)
                                  }
                                >
                                  <option value="">
                                    Choose an outstanding invoice
                                  </option>
                                  {outstandingInvoices.map((invoice) => (
                                    <option key={invoice.id} value={invoice.id}>
                                      {invoice.reference ?? invoice.id} ·{' '}
                                      {money(
                                        invoice.outstandingCents,
                                        invoice.currency,
                                      )}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            <button
                              disabled={
                                !targetInvoiceId ||
                                selected.unappliedCents === 0
                              }
                              onClick={() => {
                                const started = reviewRef.current?.beginReview(
                                  selected.id,
                                  targetInvoiceId
                                    ? [targetInvoiceId]
                                    : undefined,
                                );
                                setReviewNotice(
                                  started
                                    ? ''
                                    : 'Finish the current assistant request or approval before starting another match.',
                                );
                              }}
                            >
                              Match payment
                            </button>
                            {selected.unappliedCents === 0 && (
                              <p className="muted">
                                This payment is fully matched.
                              </p>
                            )}
                            {reviewNotice && assistantBusy && (
                              <p role="status">{reviewNotice}</p>
                            )}
                          </div>
                        )}
                        <p className="context-note">
                          Related by customer and currency.
                        </p>
                      </>
                    )}
                  </section>
                </>
              )}
            </>
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
              selectedPaymentId={selected?.id}
              focusedClientId={focus.clientId}
              focusedInvoiceId={focus.record?.id}
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
