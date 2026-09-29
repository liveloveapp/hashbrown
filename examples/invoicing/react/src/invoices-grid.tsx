import {
  type PretableColumn,
  PretableSurface,
  type PretableSurfaceProps,
} from '@pretable/react';
import type { InvoiceRow } from '@invoicing/contracts';
import { useMemo, useState } from 'react';
import { currencyColumn, moneyColumn } from './grid-columns';
import { invoiceStatusLabel } from './ledger-views';
import { StatusDot } from './status-dot';

type Query = NonNullable<PretableSurfaceProps<InvoiceRow>['query']>;

const INITIAL_QUERY: Query = {
  filters: [],
  sort: [{ columnId: 'balance', direction: 'desc' }],
  rowGroups: [{ columnId: 'currency' }],
};

/** The Invoices tab's filter chips, in display order. */
export const INVOICE_FILTERS = [
  {
    id: 'open',
    label: 'Open',
    keep: (row: InvoiceRow) => row.balanceCents > 0,
  },
  {
    id: 'overdue',
    label: 'Overdue',
    keep: (row: InvoiceRow) => row.balanceCents > 0 && row.daysOverdue > 0,
  },
  {
    id: 'paid',
    label: 'Paid',
    keep: (row: InvoiceRow) => row.balanceCents === 0,
  },
  { id: 'all', label: 'All', keep: () => true },
] as const;

/** One of {@link INVOICE_FILTERS}. */
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number]['id'];

/** Inputs for {@link InvoicesGrid}. */
export interface InvoicesGridProps {
  readonly rows: InvoiceRow[];
  /** The currency whose group comes first. */
  readonly currency: string;
  /** The focused client; when set, only its invoices show. */
  readonly clientId?: string;
  readonly selectedId?: string;
  readonly onSelect: (invoiceId: string, clientId: string) => void;
  readonly viewportHeight?: number;
}

/** Invoices grouped by currency with Open/Overdue/Paid/All chips; a row click focuses the invoice and its client. */
export function InvoicesGrid({
  rows,
  currency,
  clientId,
  selectedId,
  onSelect,
  viewportHeight = 420,
}: InvoicesGridProps) {
  const [filter, setFilter] = useState<InvoiceFilter>('open');
  const [query, setQuery] = useState<Query>(INITIAL_QUERY);
  const scoped = useMemo(
    () => (clientId ? rows.filter((row) => row.clientId === clientId) : rows),
    [rows, clientId],
  );
  const chip =
    INVOICE_FILTERS.find((candidate) => candidate.id === filter) ??
    INVOICE_FILTERS[0];
  const visible = useMemo(() => scoped.filter(chip.keep), [scoped, chip]);
  const clientOf = useMemo(
    () => new Map(rows.map((row) => [row.id, row.clientId])),
    [rows],
  );
  const select = (invoiceId: string) => {
    const owner = clientOf.get(invoiceId);
    if (owner) onSelect(invoiceId, owner);
  };
  const columns = useMemo<PretableColumn<InvoiceRow>[]>(
    () => [
      {
        id: 'reference',
        header: 'Invoice',
        pinned: 'left',
        flex: 2,
        minWidthPx: 190,
        type: 'text',
        value: (row) => row.reference,
      },
      currencyColumn<InvoiceRow>(currency),
      {
        id: 'client',
        header: 'Client',
        flex: 1,
        minWidthPx: 140,
        type: 'text',
        value: (row) => row.clientName,
      },
      {
        id: 'type',
        header: 'Type',
        widthPx: 100,
        type: 'text',
        value: (row) => row.type,
      },
      {
        id: 'issued',
        header: 'Issued',
        widthPx: 100,
        type: 'text',
        value: (row) => row.issued || '—',
      },
      moneyColumn<InvoiceRow>('amount', 'Amount', (row) => row.amountCents),
      moneyColumn<InvoiceRow>('balance', 'Balance', (row) => row.balanceCents),
      {
        id: 'status',
        header: 'Status',
        widthPx: 180,
        type: 'number',
        value: (row) => (row.balanceCents === 0 ? -1 : row.daysOverdue),
        render: ({ row }) => <StatusDot {...invoiceStatusLabel(row.status)} />,
      },
    ],
    [currency],
  );
  return (
    <>
      <div className="filter-chips" role="group" aria-label="Invoice filter">
        {INVOICE_FILTERS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={candidate.id === filter}
            onClick={() => setFilter(candidate.id)}
          >
            {candidate.label}{' '}
            <span className="chip-count">
              {scoped.filter(candidate.keep).length}
            </span>
          </button>
        ))}
      </div>
      <div className="dashboard-grid" data-density="compact">
        <PretableSurface
          rows={visible}
          columns={columns}
          getRowId={(row: InvoiceRow) => row.id}
          ariaLabel="Invoices"
          viewportHeight={viewportHeight}
          toolPanel={false}
          groupColumn={{ header: 'Currency', pinned: 'left' }}
          query={query}
          onQueryChange={setQuery}
          state={{
            rowSelection: {
              kind: 'explicit',
              rowIds: selectedId ? [selectedId] : [],
            },
          }}
          onRowActivate={({ rowId }) => select(rowId)}
          onFocusChange={({ ref }) => {
            if (ref?.kind === 'data') select(ref.rowId);
          }}
        />
      </div>
    </>
  );
}
