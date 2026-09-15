import { useEffect, useRef, useState } from 'react';
import { HashbrownProvider } from '@hashbrownai/react';
import type { TransportOrFactory } from '@hashbrownai/core';
import { ReviewChat, type ReviewChatHandle } from './review-chat';
import { type PretableColumn, PretableSurface } from '@pretable/react';
import type { LedgerSnapshot } from '@invoicing/contracts';

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

function money(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    amountCents / 100,
  );
}

function totals(
  records: readonly { amountCents: number; currency: string }[],
): string {
  const currencies = [...new Set(records.map((record) => record.currency))];
  return (
    currencies
      .map((currency) =>
        money(
          records
            .filter((record) => record.currency === currency)
            .reduce((sum, record) => sum + record.amountCents, 0),
          currency,
        ),
      )
      .join(' · ') || '—'
  );
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
  const reviewRef = useRef<ReviewChatHandle>(null);

  function selectPayment(ids: string[]) {
    const addedId = ids.find((id) => !selectedIds.includes(id));
    const nextId = addedId ?? ids[0];
    if (enableAssistant) {
      if (!nextId || !reviewRef.current?.startReview(nextId)) return;
    }
    setSelectedIds(nextId ? [nextId] : []);
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

  const unappliedPaymentCount =
    snapshot?.payments.filter((payment) => payment.unappliedCents > 0).length ??
    0;
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
  const columns: PretableColumn<Payment>[] = [
    ...(enableAssistant
      ? [
          {
            id: 'reviewSelection',
            header: 'Review',
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
      type: 'text',
      value: (row) => row.id,
      render: ({ row }) => (
        <button
          className="payment-link"
          aria-label={`Review ${row.id}`}
          onClick={() => selectPayment([row.id])}
        >
          {row.id}
        </button>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      type: 'text',
      value: (row) => row.customerId,
    },
    {
      id: 'amount',
      header: 'Received',
      type: 'number',
      value: (row) => row.amountCents,
      format: ({ row }) => money(row.amountCents, row.currency),
    },
    {
      id: 'unapplied',
      header: 'Unapplied',
      type: 'number',
      value: (row) => row.unappliedCents,
      format: ({ row }) => money(row.unappliedCents, row.currency),
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
          <span className="badge">Sample ledger</span>
        </header>
        <div className="content">
          <h1>{page === 'Dashboard' ? 'Business overview' : 'Payments'}</h1>
          <p className="muted">
            {page === 'Dashboard'
              ? 'Your invoices and incoming payments, in one place.'
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
                <section className="stats" aria-label="Ledger totals">
                  <article>
                    <span>Invoiced</span>
                    <strong>{totals(snapshot.invoices)}</strong>
                    <small>
                      {snapshot.invoices.length} invoice
                      {snapshot.invoices.length === 1 ? '' : 's'}
                    </small>
                  </article>
                  <article>
                    <span>Received</span>
                    <strong>{totals(snapshot.payments)}</strong>
                    <small>Incoming payments</small>
                  </article>
                  <article>
                    <span>Unapplied cash</span>
                    <strong>
                      {totals(
                        snapshot.payments.map((payment) => ({
                          ...payment,
                          amountCents: payment.unappliedCents,
                        })),
                      )}
                    </strong>
                    <small>
                      {unappliedPaymentCount} payment
                      {unappliedPaymentCount === 1 ? '' : 's'} to match
                    </small>
                  </article>
                </section>
              )}
              <div className="section-heading">
                <h2>Incoming payments</h2>
                <span className="muted">{snapshot.payments.length} total</span>
              </div>
              <div className="payment-grid">
                <PretableSurface
                  rows={[...snapshot.payments]}
                  columns={columns}
                  getRowId={(row: Payment) => row.id}
                  ariaLabel="Incoming payments"
                  viewportHeight={240}
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
                    Select a payment above to see invoices for the same customer
                    and currency.
                  </p>
                ) : (
                  <>
                    <p className="muted">
                      {selected.customerId} · {selected.id}
                    </p>
                    {invoices.length === 0 ? (
                      <p>No invoices for this customer and currency.</p>
                    ) : (
                      invoices.map((invoice) => (
                        <div className="invoice-row" key={invoice.id}>
                          <div>
                            <strong>{invoice.id}</strong>
                            <small>{invoice.customerId}</small>
                          </div>
                          <div>
                            <strong>
                              {money(
                                invoice.outstandingCents,
                                invoice.currency,
                              )}
                            </strong>
                            <small>
                              {invoice.outstandingCents === 0
                                ? 'Paid'
                                : 'Outstanding'}
                            </small>
                          </div>
                        </div>
                      ))
                    )}
                    <p className="context-note">
                      Related by customer and currency.
                    </p>
                  </>
                )}
              </section>
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
          <div className="assistant-icon" aria-hidden="true">
            ✧
          </div>
          <h2>{selected ? 'Payment context' : 'Your business assistant'}</h2>
          {selected ? (
            <div className="selection-summary">
              <strong>{selected.id}</strong>
              <span>{selected.customerId}</span>
              <span>
                {money(selected.unappliedCents, selected.currency)} unapplied
              </span>
            </div>
          ) : (
            <p className="muted">
              Select an incoming payment to bring its details into the
              conversation.
            </p>
          )}
          {enableAssistant ? (
            <HashbrownProvider url="/agui/%2Freview%23agent">
              <ReviewChat
                ref={reviewRef}
                selectedPaymentId={selected?.id}
                transport={transport}
                onApplied={setSnapshot}
              />
            </HashbrownProvider>
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
