import {
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  PretableBadge,
  type PretableBadgeTone,
  type PretableColumn,
  PretableSurface,
} from '@pretable/react';
import { type DensityHeights, getDensityHeights } from '@pretable/ui';
import { createAssistantKit, type PaymentProfile } from '@invoicing/contracts';
import { AgingSummary, TrendChart } from './assistant-charts';
import {
  customerSummary,
  type LedgerRow,
  money,
  resolveRecords,
} from './ledger-views';
import { SnapshotContext } from './snapshot-context';

export { AgingSummary, TrendChart } from './assistant-charts';

const PROFILE_LABEL: Record<PaymentProfile, string> = {
  'on-time': 'On time',
  'late-fixed': 'Late, fixed lag',
  'late-drifting': 'Late, drifting',
  'short-payer': 'Short payer',
  'batch-payer': 'Batch payer',
  'wrong-reference': 'Wrong reference',
};

const PROFILE_TONE: Record<PaymentProfile, PretableBadgeTone> = {
  'on-time': 'positive',
  'late-fixed': 'warning',
  'late-drifting': 'negative',
  'short-payer': 'warning',
  'batch-payer': 'info',
  'wrong-reference': 'warning',
};

// The assistant aside is narrow (310px, 270px at the medium breakpoint): the
// client is named by the prose and the CustomerCard, and the table's title
// says what the rows are, so the grid spends its width on reference and money.
// The minimums sum to 348px, so the grid still scrolls at 270px, but Reference,
// Amount and Balance are the first three columns and stay in view. Pretable has
// no per-column `hidden` option, so `date` stays rather than folding away.
const columns: PretableColumn<LedgerRow>[] = [
  {
    id: 'reference',
    header: 'Reference',
    flex: 2,
    minWidthPx: 96,
    type: 'text',
    value: (r) => r.reference,
  },
  {
    id: 'amount',
    header: 'Amount',
    flex: 1,
    minWidthPx: 84,
    type: 'number',
    value: (r) => r.amountCents,
    format: ({ row }) => money(row.amountCents, row.currency),
  },
  {
    id: 'balance',
    header: 'Balance',
    flex: 1,
    minWidthPx: 84,
    type: 'number',
    value: (r) => r.balanceCents,
    format: ({ row }) => money(row.balanceCents, row.currency),
  },
  {
    id: 'date',
    header: 'Date',
    widthPx: 84,
    type: 'text',
    value: (r) => r.date || '—',
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
  // Hashbrown hands the renderer a fresh `recordIds` array on every streamed
  // render, so key the memo on the ids' content rather than array identity.
  const idsKey = JSON.stringify(recordIds);
  const resolved = useMemo(
    () =>
      snapshot
        ? resolveRecords(snapshot, JSON.parse(idsKey) as string[])
        : undefined,
    [snapshot, idsKey],
  );
  // Size the viewport from the density the grid actually paints at. The
  // section scopes `data-density="compact"`, and the tokens inherit, so the
  // heights must be read against the section (or a descendant), not the
  // document root: the root never sees a wrapper-scoped density. The element
  // only exists after mount, so the first render falls back to the root.
  const sectionRef = useRef<HTMLElement>(null);
  const [heights, setHeights] = useState<DensityHeights | null>(null);
  useLayoutEffect(() => {
    setHeights(getDensityHeights(sectionRef.current));
  }, []);
  if (!resolved) return null;
  const { rows, missing } = resolved;
  const { rowHeight, headerHeight } = heights ?? getDensityHeights();
  return (
    <section
      ref={sectionRef}
      className="assistant-kit assistant-kit-table"
      data-density="compact"
    >
      <h4>{title}</h4>
      <PretableSurface
        rows={rows}
        columns={columns}
        getRowId={(row: LedgerRow) => row.id}
        ariaLabel={title}
        viewportHeight={Math.min(320, headerHeight + rows.length * rowHeight)}
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

export function CustomerCard({ customerId }: { customerId: string }) {
  const snapshot = useContext(SnapshotContext);
  const summary = snapshot ? customerSummary(snapshot, customerId) : undefined;
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
          {PROFILE_LABEL[summary.profile]}
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
          <dd>{habit ? habit.days : 'No applied payments'}</dd>
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
