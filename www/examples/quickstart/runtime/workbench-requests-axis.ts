import type { WorkbenchFrame } from './workbench';

/** An active-time axis shared by the overview timeline and the waterfall. */
export interface WorkbenchActiveAxis {
  /** Position, 0 to 100, of an elapsed time within the given turn. */
  readonly percentAt: (elapsedMs: number, turn: number) => number;
  /** The index of the event nearest a position, or null for an empty run. */
  readonly nearestIndex: (percent: number) => number | null;
  /** Where each turn begins and ends on the axis. */
  readonly turns: readonly {
    readonly turn: number;
    readonly startPercent: number;
    readonly endPercent: number;
  }[];
}

interface TurnSpan {
  readonly turn: number;
  readonly first: number;
  readonly last: number;
}

/**
 * Builds an axis from active time only: each turn takes the width of its own
 * span, and the idle time between turns collapses to a fixed gap.
 *
 * @param events - The captured events, in order.
 * @param gapPercent - The axis share between turns; defaults to 2.
 * @returns The axis. A run with no span maps every time to 0.
 */
export function workbenchActiveAxis(
  events: readonly WorkbenchFrame[],
  gapPercent = 2,
): WorkbenchActiveAxis {
  const spans = events.reduce<readonly TurnSpan[]>((found, event) => {
    const existing = found.find((span) => span.turn === event.turn);
    return existing
      ? found.map((span) =>
          span === existing
            ? {
                ...span,
                first: Math.min(span.first, event.elapsedMs),
                last: Math.max(span.last, event.elapsedMs),
              }
            : span,
        )
      : [
          ...found,
          { turn: event.turn, first: event.elapsedMs, last: event.elapsedMs },
        ];
  }, []);
  const totalSpan = spans.reduce(
    (sum, span) => sum + (span.last - span.first),
    0,
  );
  const available = 100 - gapPercent * Math.max(0, spans.length - 1);
  const scale = totalSpan > 0 ? available / totalSpan : 0;

  const placed = spans.reduce<
    readonly (TurnSpan & { readonly start: number; readonly end: number })[]
  >((laid, span) => {
    const start = laid.length ? laid[laid.length - 1].end + gapPercent : 0;
    return [
      ...laid,
      { ...span, start, end: start + (span.last - span.first) * scale },
    ];
  }, []);

  const percentAt = (elapsedMs: number, turn: number) => {
    const found = placed.find((span) => span.turn === turn);
    if (!found || scale === 0) return 0;
    const clamped = Math.min(Math.max(elapsedMs, found.first), found.last);
    return found.start + (clamped - found.first) * scale;
  };

  return {
    percentAt,
    nearestIndex: (percent) =>
      events.reduce<{
        readonly index: number;
        readonly distance: number;
      } | null>((best, event, index) => {
        const distance = Math.abs(
          percentAt(event.elapsedMs, event.turn) - percent,
        );
        return best === null || distance < best.distance
          ? { index, distance }
          : best;
      }, null)?.index ?? null,
    turns: placed.map((span) => ({
      turn: span.turn,
      startPercent: span.start,
      endPercent: span.end,
    })),
  };
}
