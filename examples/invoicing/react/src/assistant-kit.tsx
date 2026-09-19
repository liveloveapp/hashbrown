import {
  type CSSProperties,
  type ReactNode,
  useContext,
  useId,
  useMemo,
  useState,
} from 'react';
import {
  PretableBadge,
  type PretableBadgeTone,
  type PretableColumn,
  PretableSurface,
} from '@pretable/react';
import { getDensityHeights } from '@pretable/ui';
import { createAssistantKit, type PaymentProfile } from '@invoicing/contracts';
import {
  agingTotals,
  AS_OF,
  customerSummary,
  type LedgerRow,
  money,
  monthLabel,
  monthlySeries,
  resolveRecords,
} from './ledger-views';
import { SnapshotContext } from './snapshot-context';

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

// The assistant aside is narrow (~270-310px): the client is named by the prose
// and the CustomerCard, so the grid spends its width on reference and money.
const columns: PretableColumn<LedgerRow>[] = [
  {
    id: 'reference',
    header: 'Reference',
    flex: 2,
    minWidthPx: 110,
    type: 'text',
    value: (r) => r.reference,
  },
  {
    id: 'amount',
    header: 'Amount',
    flex: 1,
    minWidthPx: 90,
    type: 'number',
    value: (r) => r.amountCents,
    format: ({ row }) => money(row.amountCents, row.currency),
  },
  {
    id: 'balance',
    header: 'Balance',
    flex: 1,
    minWidthPx: 90,
    type: 'number',
    value: (r) => r.balanceCents,
    format: ({ row }) => money(row.balanceCents, row.currency),
  },
  {
    id: 'date',
    header: 'Date',
    widthPx: 88,
    type: 'text',
    value: (r) => r.date || '—',
  },
  {
    id: 'kind',
    header: 'Kind',
    widthPx: 76,
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
  if (!resolved) return null;
  const { rows, missing } = resolved;
  // Size the viewport from the theme's own density so no row is clipped.
  const { rowHeight, headerHeight } = getDensityHeights();
  return (
    <section className="assistant-kit assistant-kit-table">
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

// Chart chrome shared by both charts: series slots validated with the dataviz
// palette validator (light surface, all checks pass); text always wears ink.
const CHART_TOKENS: CSSProperties = {
  '--series-1': '#2a78d6',
  '--series-2': '#eb6834',
  '--ink': '#202327',
  '--ink-muted': '#73777c',
  '--grid': '#e4e6e5',
} as CSSProperties;

/** A round gridline step (1/2/5 × 10^n) giving roughly `ticks` lines up to `max`. */
function niceStep(max: number, ticks = 4): number {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function compactMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function chartTitle(kind: string, currency: string, customerId: string | null) {
  return `${kind} · ${currency}${customerId ? ` · ${customerId}` : ''}`;
}

function Tooltip({
  style,
  children,
}: {
  style: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div role="tooltip" className="tooltip" style={style}>
      {children}
    </div>
  );
}

// The assistant aside gives a chart ~270px, so the viewBox is sized to that
// column: the px specs below (2px gap, 4px caps, 12px text) render true-size.
const TREND = {
  width: 280,
  height: 170,
  left: 44,
  right: 8,
  top: 20,
  baseline: 148,
  axisLabelY: 165,
  fontSize: 12,
  /** Rendered width of a "Mon YYYY" axis label plus breathing room. */
  axisLabelWidth: 64,
};

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
  const clipId = useId();
  const [hovered, setHovered] = useState<string | null>(null);
  if (!snapshot) return null;
  // monthlySeries clamps to 1..24 months, so a model-typed count cannot blow up the plot.
  const rows = monthlySeries(snapshot, {
    currency,
    customerId,
    months,
    asOf: AS_OF,
  });
  const title = chartTitle('Invoiced vs received', currency, customerId);

  const { width, left, right, top, baseline } = TREND;
  const plotWidth = width - left - right;
  const plotHeight = baseline - top;
  const max = Math.max(
    0,
    ...rows.flatMap((r) => [r.invoicedCents, r.receivedCents]),
  );
  const step = niceStep(max);
  const ceiling = Math.max(step, Math.ceil(max / step) * step);
  const gridValues = Array.from(
    { length: Math.round(ceiling / step) + 1 },
    (_, i) => i * step,
  );
  const y = (cents: number) => baseline - (cents / ceiling) * plotHeight;

  const band = plotWidth / rows.length;
  // Two columns per month, 2px surface gap between them, <= 24px thick, the
  // rest of the band left as air between groups.
  const columnWidth = Math.max(1, Math.min(24, (band * 0.7 - 2) / 2));
  const groupWidth = columnWidth * 2 + 2;
  // Label every month when a label fits its band; otherwise every Nth month,
  // counted back from the latest so the as-of month is always labelled.
  const labelEvery = Math.max(1, Math.ceil(TREND.axisLabelWidth / band));

  const columns = rows.map((row, i) => {
    const x0 = left + i * band + (band - groupWidth) / 2;
    return {
      row,
      label: monthLabel(row.month),
      hitX: left + i * band,
      centerX: left + i * band + band / 2,
      // Keep a centred axis label inside the viewBox at either edge.
      labelX: Math.min(
        width - TREND.axisLabelWidth / 2,
        Math.max(TREND.axisLabelWidth / 2, left + i * band + band / 2),
      ),
      labelled: (rows.length - 1 - i) % labelEvery === 0,
      invoiced: { x: x0, top: y(row.invoicedCents) },
      received: { x: x0 + columnWidth + 2, top: y(row.receivedCents) },
    };
  });

  // The latest month's values live in an HTML caption rather than as labels
  // in the plot: the pair always sits at the right edge, where in-plot labels
  // would collide with neighbouring columns or clip at the edge.
  const last = rows[rows.length - 1];
  const caption = `${monthLabel(last.month)} · Invoiced ${money(
    last.invoicedCents,
    currency,
  )} · Received ${money(last.receivedCents, currency)}`;

  const hoveredColumn = columns.find((c) => c.row.month === hovered);

  return (
    <figure
      className="assistant-kit assistant-kit-chart"
      aria-label={title}
      style={CHART_TOKENS}
    >
      <h4>{title}</h4>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--series-1)' }} />
          Invoiced
        </span>
        <span>
          <i style={{ background: 'var(--series-2)' }} />
          Received
        </span>
      </div>
      <p className="assistant-kit-caption">{caption}</p>
      <div className="plot">
        <svg
          viewBox={`0 0 ${width} ${TREND.height}`}
          role="img"
          aria-label={title}
        >
          <defs>
            {/* Columns are drawn 4px past the baseline with rx=4 and clipped
                here, so the caps are rounded and the foot stays square. */}
            <clipPath id={clipId}>
              <rect x={left} y={0} width={plotWidth} height={baseline} />
            </clipPath>
          </defs>
          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={left}
                x2={left + plotWidth}
                y1={y(value)}
                y2={y(value)}
                stroke="var(--grid)"
                strokeWidth={1}
              />
              <text
                x={left - 8}
                y={y(value)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={TREND.fontSize}
                fill="var(--ink-muted)"
              >
                {compactMoney(value, currency)}
              </text>
            </g>
          ))}
          {columns.map((c) => (
            <g
              key={c.row.month}
              data-month={c.row.month}
              tabIndex={0}
              onMouseEnter={() => setHovered(c.row.month)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(c.row.month)}
              onBlur={() => setHovered(null)}
              opacity={hovered && hovered !== c.row.month ? 0.6 : 1}
            >
              <rect
                x={c.hitX}
                y={top - 10}
                width={band}
                height={plotHeight + 10}
                fill="transparent"
              />
              <g clipPath={`url(#${clipId})`}>
                <rect
                  data-series="invoiced"
                  x={c.invoiced.x}
                  y={c.invoiced.top}
                  width={columnWidth}
                  height={baseline - c.invoiced.top + 4}
                  rx={4}
                  fill="var(--series-1)"
                />
                <rect
                  data-series="received"
                  x={c.received.x}
                  y={c.received.top}
                  width={columnWidth}
                  height={baseline - c.received.top + 4}
                  rx={4}
                  fill="var(--series-2)"
                />
              </g>
              {c.labelled && (
                <text
                  x={c.labelX}
                  y={TREND.axisLabelY}
                  textAnchor="middle"
                  fontSize={TREND.fontSize}
                  fill="var(--ink-muted)"
                >
                  {c.label}
                </text>
              )}
            </g>
          ))}
        </svg>
        {hoveredColumn && (
          // Centred over the plot: the aside is too narrow to float a readout
          // beside the hovered month without clipping at either edge.
          <Tooltip
            style={{
              left: '50%',
              top: 0,
              transform: 'translate(-50%, calc(-100% - 4px))',
            }}
          >
            <strong>{hoveredColumn.label}</strong>
            <div>
              <i className="key" style={{ background: 'var(--series-1)' }} />
              <strong>
                {money(hoveredColumn.row.invoicedCents, currency)}
              </strong>{' '}
              invoiced
            </div>
            <div>
              <i className="key" style={{ background: 'var(--series-2)' }} />
              <strong>
                {money(hoveredColumn.row.receivedCents, currency)}
              </strong>{' '}
              received
            </div>
          </Tooltip>
        )}
      </div>
      <details>
        <summary>Show data</summary>
        <table aria-label={title}>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Invoiced ({currency})</th>
              <th scope="col">Received ({currency})</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month}>
                <td>{monthLabel(row.month)}</td>
                <td>{money(row.invoicedCents, currency)}</td>
                <td>{money(row.receivedCents, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

const AGING = {
  width: 280,
  labelWidth: 88,
  /** Approximate advance of a 12px semibold digit, for sizing the value column. */
  charWidth: 7,
  barHeight: 16,
  gap: 8,
  pad: 8,
  fontSize: 12,
};

export function AgingSummary({
  currency,
  customerId,
}: {
  currency: string;
  customerId: string | null;
}) {
  const snapshot = useContext(SnapshotContext);
  const clipId = useId();
  const [hovered, setHovered] = useState<string | null>(null);
  if (!snapshot) return null;
  const rows = agingTotals(snapshot, { currency, customerId, asOf: AS_OF });
  const title = chartTitle('Aging', currency, customerId);
  const total = rows.reduce((sum, r) => sum + r.cents, 0);

  const { width, labelWidth, barHeight, gap, pad } = AGING;
  const rowPitch = barHeight + gap;
  const height = pad * 2 + rows.length * rowPitch - gap;
  // Reserve the value column from the longest amount so no label is clipped.
  const valueWidth =
    Math.max(...rows.map((r) => money(r.cents, currency).length)) *
      AGING.charWidth +
    12;
  const plotWidth = width - labelWidth - valueWidth;
  const max = Math.max(1, ...rows.map((r) => r.cents));
  const bars = rows.map((row, i) => {
    const top = pad + i * rowPitch;
    return {
      row,
      top,
      centerY: top + barHeight / 2,
      length: (row.cents / max) * plotWidth,
    };
  });
  const hoveredBar = bars.find((b) => b.row.bucket === hovered);

  return (
    <figure
      className="assistant-kit assistant-kit-chart"
      aria-label={title}
      style={CHART_TOKENS}
    >
      <h4>{title}</h4>
      <p className="muted">Open: {money(total, currency)}</p>
      <div className="plot">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
          <defs>
            {/* Bars start 4px left of the axis with rx=4 and are clipped here,
                so the tip is rounded and the foot at the axis stays square. */}
            <clipPath id={clipId}>
              <rect
                x={labelWidth}
                y={0}
                width={plotWidth + 8}
                height={height}
              />
            </clipPath>
          </defs>
          <line
            x1={labelWidth}
            x2={labelWidth}
            y1={pad - 4}
            y2={height - pad + 4}
            stroke="var(--grid)"
            strokeWidth={1}
          />
          {bars.map((b) => (
            <g
              key={b.row.bucket}
              data-bucket-row={b.row.bucket}
              tabIndex={0}
              onMouseEnter={() => setHovered(b.row.bucket)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(b.row.bucket)}
              onBlur={() => setHovered(null)}
              opacity={hovered && hovered !== b.row.bucket ? 0.6 : 1}
            >
              <rect
                x={0}
                y={b.top - gap / 2}
                width={width}
                height={rowPitch}
                fill="transparent"
              />
              <text
                x={labelWidth - 8}
                y={b.centerY}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={AGING.fontSize}
                fill="var(--ink-muted)"
              >
                {b.row.label}
              </text>
              <g clipPath={`url(#${clipId})`}>
                <rect
                  data-bucket={b.row.bucket}
                  x={labelWidth - 4}
                  y={b.top}
                  width={b.length + 4}
                  height={barHeight}
                  rx={4}
                  fill="var(--series-1)"
                />
              </g>
              <text
                x={labelWidth + b.length + 8}
                y={b.centerY}
                dominantBaseline="middle"
                fontSize={AGING.fontSize}
                fontWeight={600}
                fill="var(--ink)"
              >
                {money(b.row.cents, currency)}
              </text>
            </g>
          ))}
        </svg>
        {hoveredBar && (
          <Tooltip
            style={{
              left: '50%',
              top: `${(hoveredBar.centerY / height) * 100}%`,
              // Above the hovered row, except the first row, which has no room above.
              transform:
                hoveredBar === bars[0]
                  ? `translate(-50%, ${barHeight / 2 + 4}px)`
                  : `translate(-50%, calc(-100% - ${barHeight / 2 + 4}px))`,
            }}
          >
            <strong>{hoveredBar.row.label}</strong>
            <div>
              <strong>{money(hoveredBar.row.cents, currency)}</strong> ·{' '}
              {hoveredBar.row.count} invoice
              {hoveredBar.row.count === 1 ? '' : 's'}
            </div>
          </Tooltip>
        )}
      </div>
      <details>
        <summary>Show data</summary>
        <table aria-label={title}>
          <thead>
            <tr>
              <th scope="col">Bucket</th>
              <th scope="col">Open ({currency})</th>
              <th scope="col">Invoices</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.bucket}>
                <td>{row.label}</td>
                <td>{money(row.cents, currency)}</td>
                <td>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
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
