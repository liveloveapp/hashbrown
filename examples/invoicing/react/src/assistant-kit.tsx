import { type ReactNode, useContext, useMemo } from 'react';
import {
  PretableBadge,
  type PretableBadgeTone,
  type PretableColumn,
  PretableSurface,
} from '@pretable/react';
import {
  AGING_BUCKETS,
  agingBucket,
  type AgingBuckets,
  createAssistantKit,
  type PaymentProfile,
} from '@invoicing/contracts';
import {
  AS_OF,
  customerSummary,
  type LedgerRow,
  money,
  monthLabel,
  resolveRecords,
} from './ledger-views';
import { SnapshotContext } from './snapshot-context';

const BUCKET_LABELS: Record<keyof AgingBuckets, string> = {
  current: 'Current',
  days1to30: '1-30 days',
  days31to60: '31-60 days',
  days61to90: '61-90 days',
  over90: 'Over 90 days',
};

const PROFILE_TONE: Record<PaymentProfile, PretableBadgeTone | undefined> = {
  'on-time': 'positive',
  'late-fixed': 'warning',
  'late-drifting': 'negative',
  'short-payer': 'warning',
  'batch-payer': 'info',
  'wrong-reference': 'info',
};

const columns: PretableColumn<LedgerRow>[] = [
  {
    id: 'reference',
    header: 'Reference',
    widthPx: 200,
    type: 'text',
    value: (r) => r.reference,
  },
  {
    id: 'customer',
    header: 'Customer',
    widthPx: 140,
    type: 'text',
    value: (r) => r.customer,
  },
  {
    id: 'date',
    header: 'Date',
    widthPx: 100,
    type: 'text',
    value: (r) => r.date || '—',
  },
  {
    id: 'amount',
    header: 'Amount',
    widthPx: 110,
    type: 'number',
    value: (r) => r.amountCents,
    format: ({ row }) => money(row.amountCents, row.currency),
  },
  {
    id: 'balance',
    header: 'Balance',
    widthPx: 110,
    type: 'number',
    value: (r) => r.balanceCents,
    format: ({ row }) => money(row.balanceCents, row.currency),
  },
  {
    id: 'kind',
    header: 'Kind',
    widthPx: 90,
    type: 'text',
    value: (r) => (r.kind === 'invoice' ? 'Invoice' : 'Payment'),
  },
];

export function AssistantText({
  text,
  children,
}: {
  text: string;
  children?: ReactNode;
}) {
  if (!text) return null;
  return (
    <div className="assistant-answer">
      <p>{text}</p>
      {children}
    </div>
  );
}

export function LedgerTable({
  title,
  recordIds,
}: {
  title: string;
  recordIds: string[];
}) {
  const snapshot = useContext(SnapshotContext);
  const resolved = useMemo(
    () => (snapshot ? resolveRecords(snapshot, recordIds) : undefined),
    [snapshot, recordIds],
  );
  if (!resolved) return null;
  const { rows, missing } = resolved;
  return (
    <section className="assistant-kit assistant-kit-table">
      <h4>{title}</h4>
      <PretableSurface
        rows={rows}
        columns={columns}
        getRowId={(row: LedgerRow) => row.id}
        ariaLabel={title}
        viewportHeight={Math.min(320, 44 + rows.length * 32)}
        toolPanel={false}
      />
      {missing > 0 && (
        <p role="status" className="muted">
          {missing} record{missing === 1 ? '' : 's'} could not be shown.
        </p>
      )}
    </section>
  );
}

export function TrendChart({
  currency,
  customerId,
  months,
}: {
  currency: string;
  customerId: string | null;
  months: number;
}) {
  const snapshot = useContext(SnapshotContext);
  if (!snapshot) return null;
  const own = <
    T extends { currency: string; customerId: string; date?: string },
  >(
    records: readonly T[],
  ) =>
    records.filter(
      (r) =>
        r.currency === currency && (!customerId || r.customerId === customerId),
    );
  const invoices = own(snapshot.invoices);
  const payments = own(snapshot.payments);
  // Calendar months back from the as-of month, zero-filled, matching the
  // server's monthlyTotals so the chart and the tool agree on which months exist.
  const [asOfYear, asOfMonth] = AS_OF.split('-').map(Number);
  // Defense in depth: the server validates 3 to 24, but never trust a model-typed count.
  const count = Math.min(24, Math.max(1, months));
  const rows = Array.from({ length: count }, (_, offset) => {
    const index = asOfYear * 12 + (asOfMonth - 1) - (count - 1 - offset);
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  }).map((month) => ({
    month,
    invoiced: invoices
      .filter((i) => i.date?.startsWith(month))
      .reduce((sum, i) => sum + i.amountCents, 0),
    received: payments
      .filter((p) => p.date?.startsWith(month))
      .reduce((sum, p) => sum + p.amountCents, 0),
  }));
  return (
    <section className="assistant-trend">
      <h4>
        Invoiced vs received · {currency}
        {customerId ? ` · ${customerId}` : ''}
      </h4>
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Invoiced</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.month}>
              <td>{monthLabel(row.month)}</td>
              <td>{money(row.invoiced, currency)}</td>
              <td>{money(row.received, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function AgingSummary({
  currency,
  customerId,
}: {
  currency: string;
  customerId: string | null;
}) {
  const snapshot = useContext(SnapshotContext);
  if (!snapshot) return null;
  const totals: Record<keyof AgingBuckets, number> = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
  };
  for (const invoice of snapshot.invoices) {
    if (
      invoice.currency !== currency ||
      invoice.outstandingCents <= 0 ||
      (customerId && invoice.customerId !== customerId)
    )
      continue;
    const bucket = invoice.date ? agingBucket(invoice.date, AS_OF) : 'current';
    totals[bucket] += invoice.outstandingCents;
  }
  return (
    <section className="assistant-aging">
      <h4>
        Aging · {currency}
        {customerId ? ` · ${customerId}` : ''}
      </h4>
      <dl>
        {AGING_BUCKETS.map((bucket) => (
          <div key={bucket}>
            <dt>{BUCKET_LABELS[bucket]}</dt>
            <dd>{money(totals[bucket], currency)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CustomerCard({ customerId }: { customerId: string }) {
  const snapshot = useContext(SnapshotContext);
  const summary = snapshot
    ? customerSummary(snapshot, customerId, AS_OF)
    : undefined;
  if (!summary) return null;
  const habit =
    summary.averageDaysToPay === null || summary.latePaymentRate === null
      ? null
      : {
          days: `${summary.averageDaysToPay} days`,
          late: `${Math.round(summary.latePaymentRate * 100)}% late`,
        };
  return (
    <section className="assistant-kit assistant-kit-customer">
      <header>
        <h4>{summary.name}</h4>
        <span className="muted">{summary.currency}</span>
        <PretableBadge tone={PROFILE_TONE[summary.profile]}>
          {summary.profile}
        </PretableBadge>
      </header>
      <dl className="assistant-kit-stats">
        <div>
          <dt>Open</dt>
          <dd>{money(summary.openCents, summary.currency)}</dd>
        </div>
        <div>
          <dt>Unapplied</dt>
          <dd>{money(summary.unappliedCents, summary.currency)}</dd>
        </div>
        <div>
          <dt>Invoiced</dt>
          <dd>{money(summary.invoicedCents, summary.currency)}</dd>
        </div>
        <div>
          <dt>Received</dt>
          <dd>{money(summary.receivedCents, summary.currency)}</dd>
        </div>
        <div>
          <dt>Avg. days to pay</dt>
          <dd>{habit ? habit.days : 'No payments yet'}</dd>
        </div>
        <div>
          <dt>Paid late</dt>
          <dd>{habit ? habit.late : '—'}</dd>
        </div>
      </dl>
      <p className="muted">
        {summary.openInvoiceCount} open invoice
        {summary.openInvoiceCount === 1 ? '' : 's'}
        {summary.lastPaymentDate
          ? ` · last payment ${summary.lastPaymentDate}`
          : ''}
      </p>
    </section>
  );
}

/** Build the kit over concrete renderers; `ReviewPayment` is supplied by the workspace, which owns the review action. */
export function assistantKit(
  ReviewPayment: (props: { paymentId: string }) => ReactNode,
) {
  return createAssistantKit({
    AssistantText,
    LedgerTable,
    TrendChart,
    AgingSummary,
    CustomerCard,
    ReviewPayment,
  });
}
