import {
  clientRows,
  currencyTotals,
  invoiceRows,
  type LedgerSnapshot,
  matchHint,
  paymentRows,
} from '@invoicing/contracts';
import { type KeyboardEvent, useMemo } from 'react';
import { ClientsGrid } from './clients-grid';
import {
  DASHBOARD_TABS,
  type DashboardTab,
  type Focus,
  type FocusAction,
} from './focus';
import { FocusBand, type FocusBandProps } from './focus-band';
import { InvoicesGrid } from './invoices-grid';
import { KpiStrip } from './kpi-strip';
import { AS_OF, hintLabel } from './ledger-views';
import { PaymentsGrid } from './payments-grid';
import { SnapshotContext } from './snapshot-context';

const TAB_LABELS: Record<DashboardTab, string> = {
  clients: 'Clients',
  invoices: 'Invoices',
  payments: 'Payments',
  unapplied: 'Unapplied',
};

/** Inputs for {@link DashboardView}. */
export interface DashboardViewProps {
  readonly snapshot: LedgerSnapshot;
  readonly focus: Focus;
  readonly onFocus: (action: FocusAction) => void;
  /** Review wiring for the band's "Match this payment" panel. */
  readonly match?: FocusBandProps['match'];
  /** Grid viewport height in px; tests raise it because jsdom has no layout. */
  readonly gridHeight?: number;
}

/**
 * The grid-centred dashboard: KPI strip, fixed-height focus band and one
 * tabbed grid, all reading one {@link Focus}. Keys 1–4 switch tabs; Esc clears.
 */
export function DashboardView({
  snapshot,
  focus,
  onFocus,
  match,
  gridHeight = 420,
}: DashboardViewProps) {
  const totals = useMemo(() => currencyTotals(snapshot, AS_OF), [snapshot]);
  const clients = useMemo(() => clientRows(snapshot, AS_OF), [snapshot]);
  const invoices = useMemo(() => invoiceRows(snapshot, AS_OF), [snapshot]);
  const payments = useMemo(() => paymentRows(snapshot, AS_OF), [snapshot]);
  const hints = useMemo(() => {
    const balances = new Map(
      snapshot.invoices.map((i) => [
        i.id,
        {
          reference: i.reference ?? i.id,
          outstandingCents: i.outstandingCents,
        },
      ]),
    );
    return new Map(
      payments
        .filter((row) => row.unappliedCents > 0)
        .map((row) => [
          row.id,
          hintLabel(matchHint(snapshot, row.id), row, balances),
        ]),
    );
  }, [snapshot, payments]);
  const client = clients.find((row) => row.id === focus.clientId);
  const invoice =
    focus.record?.kind === 'invoice'
      ? invoices.find((row) => row.id === focus.record?.id)
      : undefined;
  const payment =
    focus.record?.kind === 'payment'
      ? payments.find((row) => row.id === focus.record?.id)
      : undefined;
  const currency = client?.currency ?? focus.currency;
  const counts: Record<DashboardTab, number> = {
    clients: clients.length,
    invoices: invoices.filter((row) => row.balanceCents > 0).length,
    payments: payments.length,
    unapplied: hints.size,
  };

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.isContentEditable || target.closest('input, textarea, select'))
      return;
    if (event.key === 'Escape') {
      onFocus({ type: 'clear' });
      return;
    }
    const tab = /^[1-9]$/.test(event.key)
      ? DASHBOARD_TABS[Number(event.key) - 1]
      : undefined;
    if (tab) onFocus({ type: 'set-tab', tab });
  }

  return (
    <SnapshotContext.Provider value={snapshot}>
      <div className="dashboard" onKeyDown={onKeyDown}>
        <KpiStrip
          totals={totals}
          currency={currency}
          client={client}
          onCurrencyChange={(code) =>
            onFocus({ type: 'set-currency', currency: code })
          }
        />
        <FocusBand
          currency={currency}
          client={client}
          invoice={invoice}
          payment={payment}
          match={match}
          onClear={() => onFocus({ type: 'clear' })}
        />
        <div
          className="dashboard-tabs"
          role="tablist"
          aria-label="Ledger views"
        >
          {DASHBOARD_TABS.map((tab, index) => (
            <button
              key={tab}
              id={`dashboard-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={focus.tab === tab}
              aria-controls="dashboard-panel"
              aria-keyshortcuts={String(index + 1)}
              onClick={() => onFocus({ type: 'set-tab', tab })}
            >
              {TAB_LABELS[tab]} <span className="tab-count">{counts[tab]}</span>
            </button>
          ))}
        </div>
        <div
          id="dashboard-panel"
          role="tabpanel"
          aria-labelledby={`dashboard-tab-${focus.tab}`}
        >
          {focus.tab === 'clients' && (
            <ClientsGrid
              rows={clients}
              currency={focus.currency}
              selectedId={focus.clientId}
              onSelect={(clientId) =>
                onFocus({ type: 'select-client', clientId })
              }
              viewportHeight={gridHeight}
            />
          )}
          {focus.tab === 'invoices' && (
            <InvoicesGrid
              rows={invoices}
              currency={focus.currency}
              clientId={focus.scoped ? focus.clientId : undefined}
              selectedId={invoice?.id}
              onSelect={(invoiceId, clientId) =>
                onFocus({ type: 'select-invoice', invoiceId, clientId })
              }
              viewportHeight={gridHeight}
            />
          )}
          {(focus.tab === 'payments' || focus.tab === 'unapplied') && (
            <PaymentsGrid
              key={focus.tab}
              rows={payments}
              mode={focus.tab === 'payments' ? 'all' : 'unapplied'}
              currency={focus.currency}
              clientId={focus.scoped ? focus.clientId : undefined}
              selectedId={payment?.id}
              hints={hints}
              onSelect={(paymentId, clientId) =>
                onFocus({ type: 'select-payment', paymentId, clientId })
              }
              viewportHeight={gridHeight}
            />
          )}
        </div>
      </div>
    </SnapshotContext.Provider>
  );
}
