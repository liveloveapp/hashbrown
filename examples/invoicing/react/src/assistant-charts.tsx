import { useContext, useId } from 'react';
import {
  ChartFigure,
  chartTitle,
  compactMoney,
  niceStep,
  Tooltip,
  useHighlight,
} from './chart-primitives';
import {
  agingTotals,
  AS_OF,
  money,
  monthLabel,
  monthlySeries,
} from './ledger-views';
import { SnapshotContext } from './snapshot-context';

export { compactMoney, niceStep } from './chart-primitives';

// The assistant aside is ~270px wide, so the viewBox is sized to that column
// and the px specs below (2px gap, 4px caps, 12px text) render near true size
// there; below the 800px breakpoint the aside spans the page and the SVG
// scales up with the column width.
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
  const headingId = useId();
  const clipId = useId();
  const { highlighted, handlers } = useHighlight();
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
  const ceiling = max > 0 ? Math.ceil(max / step) * step : 1;
  // Nothing to plot: keep just the baseline rather than a meaningless tick.
  const gridValues =
    max > 0
      ? Array.from(
          { length: Math.round(ceiling / step) + 1 },
          (_, i) => i * step,
        )
      : [0];
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
    const invoiced = money(row.invoicedCents, currency);
    const received = money(row.receivedCents, currency);
    return {
      row,
      label: monthLabel(row.month),
      invoiced,
      received,
      name: `${monthLabel(row.month)}: invoiced ${invoiced}, received ${received}`,
      hitX: left + i * band,
      // Keep a centred axis label inside the viewBox at either edge.
      labelX: Math.min(
        width - TREND.axisLabelWidth / 2,
        Math.max(TREND.axisLabelWidth / 2, left + i * band + band / 2),
      ),
      labelled: (rows.length - 1 - i) % labelEvery === 0,
      invoicedX: x0,
      invoicedTop: y(row.invoicedCents),
      receivedX: x0 + columnWidth + 2,
      receivedTop: y(row.receivedCents),
    };
  });

  // The latest month's values live in an HTML caption rather than as labels
  // in the plot: the pair always sits at the right edge, where in-plot labels
  // would collide with neighbouring columns or clip at the edge.
  const last = columns[columns.length - 1];
  const caption = `${last.label} · Invoiced ${last.invoiced} · Received ${last.received}`;
  const hoveredColumn = columns.find((c) => c.row.month === highlighted);

  return (
    <ChartFigure
      title={title}
      headingId={headingId}
      columns={['Month', `Invoiced (${currency})`, `Received (${currency})`]}
      rows={columns.map((c) => [c.label, c.invoiced, c.received])}
    >
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
        <svg viewBox={`0 0 ${width} ${TREND.height}`} aria-hidden="true">
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
                data-tick
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
              aria-label={c.name}
              {...handlers(c.row.month)}
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
                  x={c.invoicedX}
                  y={c.invoicedTop}
                  width={columnWidth}
                  height={baseline - c.invoicedTop + 4}
                  rx={4}
                  fill="var(--series-1)"
                />
                <rect
                  data-series="received"
                  x={c.receivedX}
                  y={c.receivedTop}
                  width={columnWidth}
                  height={baseline - c.receivedTop + 4}
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
              <strong>{hoveredColumn.invoiced}</strong> invoiced
            </div>
            <div>
              <i className="key" style={{ background: 'var(--series-2)' }} />
              <strong>{hoveredColumn.received}</strong> received
            </div>
          </Tooltip>
        )}
      </div>
    </ChartFigure>
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
  const headingId = useId();
  const clipId = useId();
  const { highlighted, handlers } = useHighlight();
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
    const amount = money(row.cents, currency);
    const count = `${row.count} invoice${row.count === 1 ? '' : 's'}`;
    return {
      row,
      amount,
      count,
      name: `${row.label}: ${amount}, ${count}`,
      top,
      centerY: top + barHeight / 2,
      length: (row.cents / max) * plotWidth,
    };
  });
  const hoveredBar = bars.find((b) => b.row.bucket === highlighted);

  return (
    <ChartFigure
      title={title}
      headingId={headingId}
      columns={['Bucket', `Open (${currency})`, 'Invoices']}
      rows={bars.map((b) => [b.row.label, b.amount, String(b.row.count)])}
    >
      <p className="muted">Open: {money(total, currency)}</p>
      <div className="plot">
        <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
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
              aria-label={b.name}
              {...handlers(b.row.bucket)}
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
                {b.amount}
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
              <strong>{hoveredBar.amount}</strong> · {hoveredBar.count}
            </div>
          </Tooltip>
        )}
      </div>
    </ChartFigure>
  );
}
