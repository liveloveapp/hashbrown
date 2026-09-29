import {
  clientRows,
  currencyTotals,
  invoiceRows,
  type LedgerSnapshot,
} from '@invoicing/contracts';
import { type KeyboardEvent, useMemo } from 'react';
import { ClientsGrid } from './clients-grid';
import {
  DASHBOARD_TABS,
  type DashboardTab,
  type Focus,
  type FocusAction,
} from './focus';
import { FocusBand } from './focus-band';
import { InvoicesGrid } from './invoices-grid';
import { KpiStrip } from './kpi-strip';
import { AS_OF } from './ledger-views';
import { SnapshotContext } from './snapshot-context';

const TAB_LABELS: Record<DashboardTab, string> = {
  clients: 'Clients',
  invoices: 'Invoices',
};

/** Inputs for {@link DashboardView}. */
export interface DashboardViewProps {
  readonly snapshot: LedgerSnapshot;
  readonly focus: Focus;
  readonly onFocus: (action: FocusAction) => void;
  /** Grid viewport height in px; tests raise it because jsdom has no layout. */
  readonly gridHeight?: number;
}

/**
 * The grid-centred dashboard: KPI strip, fixed-height focus band and one
 * tabbed grid, all reading one {@link Focus}. Keys 1–2 switch tabs; Esc clears.
 */
export function DashboardView({
  snapshot,
  focus,
  onFocus,
  gridHeight = 420,
}: DashboardViewProps) {
  const totals = useMemo(() => currencyTotals(snapshot, AS_OF), [snapshot]);
  const clients = useMemo(() => clientRows(snapshot, AS_OF), [snapshot]);
  const invoices = useMemo(() => invoiceRows(snapshot, AS_OF), [snapshot]);
  const client = clients.find((row) => row.id === focus.clientId);
  const invoice = focus.record
    ? invoices.find((row) => row.id === focus.record?.id)
    : undefined;
  const currency = client?.currency ?? focus.currency;
  const counts: Record<DashboardTab, number> = {
    clients: clients.length,
    invoices: invoices.filter((row) => row.balanceCents > 0).length,
  };

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]'))
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
          {focus.tab === 'clients' ? (
            <ClientsGrid
              rows={clients}
              currency={focus.currency}
              selectedId={focus.clientId}
              onSelect={(clientId) =>
                onFocus({ type: 'select-client', clientId })
              }
              viewportHeight={gridHeight}
            />
          ) : (
            <InvoicesGrid
              rows={invoices}
              currency={focus.currency}
              clientId={focus.clientId}
              selectedId={focus.record?.id}
              onSelect={(invoiceId, clientId) =>
                onFocus({ type: 'select-invoice', invoiceId, clientId })
              }
              viewportHeight={gridHeight}
            />
          )}
        </div>
      </div>
    </SnapshotContext.Provider>
  );
}
