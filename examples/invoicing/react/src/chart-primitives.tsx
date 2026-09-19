import { type CSSProperties, type ReactNode, useState } from 'react';

// Chart chrome shared by both charts: series slots validated with the dataviz
// palette validator (light surface, all checks pass); text always wears ink.
export const CHART_TOKENS = {
  '--series-1': '#2a78d6',
  '--series-2': '#eb6834',
  '--ink': '#202327',
  '--ink-muted': '#73777c',
  '--grid': '#e4e6e5',
} as CSSProperties;

/** A round gridline step (1/2/5 × 10^n) giving roughly `ticks` lines up to `max`. */
export function niceStep(max: number, ticks = 4): number {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

/** `$1.5K`, `$500`, `$2M`: one fraction digit so 5×10ⁿ steps keep distinct ticks. */
export function compactMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

export function chartTitle(
  kind: string,
  currency: string,
  customerId: string | null,
) {
  return `${kind} · ${currency}${customerId ? ` · ${customerId}` : ''}`;
}

export function Tooltip({
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

/**
 * The figure shell both charts share: the heading names the figure, the SVG is
 * decorative to assistive tech, and the details table is the accessible twin.
 */
export function ChartFigure({
  title,
  headingId,
  columns,
  rows,
  children,
}: {
  title: string;
  headingId: string;
  columns: string[];
  rows: string[][];
  children: ReactNode;
}) {
  return (
    <figure
      className="assistant-kit assistant-kit-chart"
      aria-labelledby={headingId}
      style={CHART_TOKENS}
    >
      <h4 id={headingId}>{title}</h4>
      {children}
      <details>
        <summary>Show data</summary>
        <table aria-label={title}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells) => (
              <tr key={cells[0]}>
                {cells.map((cell, i) => (
                  <td key={i}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Hover and keyboard focus share one highlighted key; the tooltip follows it. */
export function useHighlight() {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const handlers = (key: string) => ({
    tabIndex: 0,
    onMouseEnter: () => setHighlighted(key),
    onMouseLeave: () => setHighlighted(null),
    onFocus: () => setHighlighted(key),
    onBlur: () => setHighlighted(null),
    opacity: highlighted && highlighted !== key ? 0.6 : 1,
  });
  return { highlighted, handlers };
}
