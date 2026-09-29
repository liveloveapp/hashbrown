import {
  type PretableColumn,
  PretableSurface,
  type PretableSurfaceProps,
} from '@pretable/react';
import { AGING_BUCKETS, type ClientRow } from '@invoicing/contracts';
import { useMemo, useState } from 'react';
import { AGE_RAMP } from './chart-primitives';
import { currencyColumn, moneyColumn } from './grid-columns';
import { BUCKET_LABELS, HABITS, wholeMoney } from './ledger-views';
import { StatusDot } from './status-dot';

type Query = NonNullable<PretableSurfaceProps<ClientRow>['query']>;

const INITIAL_QUERY: Query = {
  filters: [],
  sort: [{ columnId: 'overdue', direction: 'desc' }],
  rowGroups: [{ columnId: 'currency' }],
};

/** Inputs for {@link ClientsGrid}. */
export interface ClientsGridProps {
  readonly rows: ClientRow[];
  /** The currency whose group comes first. */
  readonly currency: string;
  readonly selectedId?: string;
  readonly onSelect: (clientId: string) => void;
  readonly viewportHeight?: number;
}

function AgeBar({ row }: { readonly row: ClientRow }) {
  const label = AGING_BUCKETS.map(
    (bucket) =>
      `${BUCKET_LABELS[bucket]} ${wholeMoney(row.aging[bucket], row.currency)}`,
  ).join(', ');
  return (
    <span className="age-bar" role="img" aria-label={label}>
      {AGING_BUCKETS.map(
        (bucket, index) =>
          row.aging[bucket] > 0 && (
            <i
              key={bucket}
              style={{
                flexGrow: row.aging[bucket],
                background: AGE_RAMP[index],
              }}
            />
          ),
      )}
    </span>
  );
}

/** Every client, grouped by currency and sorted by overdue; a row click focuses the client. */
export function ClientsGrid({
  rows,
  currency,
  selectedId,
  onSelect,
  viewportHeight = 420,
}: ClientsGridProps) {
  const [query, setQuery] = useState<Query>(INITIAL_QUERY);
  const columns = useMemo<PretableColumn<ClientRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Client',
        pinned: 'left',
        flex: 2,
        minWidthPx: 170,
        type: 'text',
        value: (row) => row.name,
      },
      currencyColumn<ClientRow>(currency),
      moneyColumn<ClientRow>('open', 'Open', (row) => row.openCents),
      moneyColumn<ClientRow>('overdue', 'Overdue', (row) => row.overdueCents),
      {
        id: 'aging',
        header: 'Aging',
        widthPx: 120,
        sortable: false,
        type: 'number',
        value: (row) =>
          row.openCents ? 1 - row.aging.current / row.openCents : 0,
        render: ({ row }) => <AgeBar row={row} />,
      },
      {
        id: 'openInvoices',
        header: 'Open invoices',
        widthPx: 110,
        type: 'number',
        value: (row) => row.openInvoiceCount,
      },
      {
        id: 'daysToPay',
        header: 'Days to pay',
        widthPx: 100,
        type: 'number',
        value: (row) => row.averageDaysToPay ?? -1,
        format: ({ row }) =>
          row.averageDaysToPay === null ? '—' : String(row.averageDaysToPay),
      },
      {
        id: 'habit',
        header: 'Habit',
        widthPx: 150,
        type: 'text',
        value: (row) => HABITS[row.profile].label,
        render: ({ row }) => <StatusDot {...HABITS[row.profile]} />,
      },
      moneyColumn<ClientRow>(
        'unapplied',
        'Unapplied',
        (row) => row.unappliedCents,
      ),
    ],
    [currency],
  );
  return (
    <div className="dashboard-grid" data-density="compact">
      <PretableSurface
        rows={rows}
        columns={columns}
        getRowId={(row: ClientRow) => row.id}
        ariaLabel="Clients"
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
        onRowActivate={({ rowId }) => onSelect(rowId)}
        onFocusChange={({ ref }) => {
          if (ref?.kind === 'data') onSelect(ref.rowId);
        }}
      />
    </div>
  );
}
