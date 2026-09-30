import {
  type PretableColumn,
  PretableSurface,
  type PretableSurfaceProps,
} from '@pretable/react';
import type { PaymentRow } from '@invoicing/contracts';
import { useMemo, useState } from 'react';
import { currencyColumn, moneyColumn } from './grid-columns';
import { paymentStatusLabel } from './ledger-views';
import { StatusDot } from './status-dot';

type Query = NonNullable<PretableSurfaceProps<PaymentRow>['query']>;

/** Which payments a {@link PaymentsGrid} lists. */
export type PaymentsGridMode = 'all' | 'unapplied';

const INITIAL_QUERY: Record<PaymentsGridMode, Query> = {
  // Payments: newest first. Unapplied: oldest first, the longest-waiting cash on top.
  all: {
    filters: [],
    sort: [{ columnId: 'received', direction: 'desc' }],
    rowGroups: [{ columnId: 'currency' }],
  },
  unapplied: {
    filters: [],
    sort: [{ columnId: 'received', direction: 'asc' }],
    rowGroups: [{ columnId: 'currency' }],
  },
};

/** Inputs for {@link PaymentsGrid}. */
export interface PaymentsGridProps {
  readonly rows: PaymentRow[];
  readonly mode: PaymentsGridMode;
  /** The currency whose group comes first. */
  readonly currency: string;
  /** The focused client; when set, only its payments show. */
  readonly clientId?: string;
  readonly selectedId?: string;
  /** Match-hint words by payment id, shown in unapplied mode. */
  readonly hints?: ReadonlyMap<string, string>;
  /** Fires on click, Enter/Space and ↑/↓, possibly more than once per gesture. */
  readonly onSelect: (paymentId: string, clientId: string) => void;
  readonly viewportHeight?: number;
}

function Payer({ row }: { readonly row: PaymentRow }) {
  return (
    <span className="payer">
      <span>{row.payerName}</span>
      <span className="payer-reference">{row.reference}</span>
    </span>
  );
}

/**
 * The Payments tab (every payment, newest first) or the Unapplied tab (cash
 * still to match, oldest first, with a match hint), grouped by currency. A row
 * click focuses the payment and its payer.
 */
export function PaymentsGrid({
  rows,
  mode,
  currency,
  clientId,
  selectedId,
  hints,
  onSelect,
  viewportHeight = 420,
}: PaymentsGridProps) {
  const [query, setQuery] = useState<Query>(INITIAL_QUERY[mode]);
  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!clientId || row.payerId === clientId) &&
          (mode === 'all' || row.unappliedCents > 0),
      ),
    [rows, clientId, mode],
  );
  const payerOf = useMemo(
    () => new Map(rows.map((row) => [row.id, row.payerId])),
    [rows],
  );
  const select = (paymentId: string) => {
    const payer = payerOf.get(paymentId);
    if (payer) onSelect(paymentId, payer);
  };
  const columns = useMemo<PretableColumn<PaymentRow>[]>(() => {
    const received: PretableColumn<PaymentRow> = {
      id: 'received',
      header: 'Received',
      widthPx: 104,
      type: 'text',
      value: (row) => row.received || '—',
    };
    const payer: PretableColumn<PaymentRow> = {
      id: 'payer',
      header: 'Payer and reference',
      pinned: 'left',
      flex: 2,
      minWidthPx: 220,
      type: 'text',
      value: (row) => `${row.payerName} ${row.reference}`,
      render: ({ row }) => <Payer row={row} />,
    };
    if (mode === 'unapplied')
      return [
        payer,
        currencyColumn<PaymentRow>(currency),
        received,
        moneyColumn<PaymentRow>(
          'unapplied',
          'Unapplied',
          (row) => row.unappliedCents,
        ),
        {
          id: 'age',
          header: 'Age',
          widthPx: 80,
          type: 'number',
          value: (row) => row.ageDays,
          format: ({ row }) =>
            `${row.ageDays} day${row.ageDays === 1 ? '' : 's'}`,
        },
        {
          id: 'hint',
          header: 'Match hint',
          flex: 2,
          minWidthPx: 200,
          sortable: false,
          type: 'text',
          value: (row) => hints?.get(row.id) ?? '—',
        },
      ];
    return [
      payer,
      currencyColumn<PaymentRow>(currency),
      received,
      moneyColumn<PaymentRow>('amount', 'Amount', (row) => row.amountCents),
      moneyColumn<PaymentRow>('applied', 'Applied', (row) => row.appliedCents),
      moneyColumn<PaymentRow>(
        'unapplied',
        'Unapplied',
        (row) => row.unappliedCents,
      ),
      {
        id: 'status',
        header: 'Status',
        widthPx: 150,
        type: 'text',
        value: (row) => paymentStatusLabel(row.status).label,
        render: ({ row }) => <StatusDot {...paymentStatusLabel(row.status)} />,
      },
    ];
  }, [mode, currency, hints]);
  return (
    <div className="dashboard-grid" data-density="compact">
      <PretableSurface
        rows={visible}
        columns={columns}
        getRowId={(row: PaymentRow) => row.id}
        ariaLabel={mode === 'all' ? 'Payments' : 'Unapplied payments'}
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
  );
}
