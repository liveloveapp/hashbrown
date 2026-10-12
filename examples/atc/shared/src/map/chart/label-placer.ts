import { intersects, type PixelRect } from '../pixels';

/**
 * One label that wants a place on the map: its candidate boxes, in container
 * pixels, in preference order.
 */
export interface LabelRequest {
  /** Unique across every layer that places labels together. */
  readonly id: string;
  /** Lower values place first. */
  readonly priority: number;
  /** Where the label may go, best first. */
  readonly candidates: readonly PixelRect[];
}

/**
 * Label priorities shared by the chart layers: towered airports first, then
 * airspace labels, then other airports, then fallback-table airports. A
 * layer adds a fraction below 1 to order labels within a tier.
 */
export const LABEL_PRIORITY = {
  towered: 0,
  airspace: 1,
  airport: 2,
  fallback: 3,
} as const;

/** Estimated advance per character of label text, in pixels. */
const CHAR_PX = 6.4;
/** A label line's height (`line-height` in chart.css), in pixels. */
const LINE_PX = 12;
/** A label's horizontal padding, both sides, in pixels. */
const PAD_X = 6;
/** A label's vertical padding, both sides, in pixels. */
const PAD_Y = 2;

/**
 * A chart label's estimated size in pixels: its longest line at
 * 6.4 px per character, by its line count. An estimate rather than a canvas
 * measure, so placement is the same in jsdom and the browser and does not
 * shift when the web fonts finish loading.
 */
export function estimateLabelSize(lines: readonly string[]): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(0, ...lines.map((line) => line.length)) * CHAR_PX + PAD_X,
    height: lines.length * LINE_PX + PAD_Y,
  };
}

/**
 * Places labels greedily, by priority and then by id so the result never
 * depends on input order. A candidate is taken only when it comes within
 * `gap` pixels of no obstacle and no label already placed. Returns, per id,
 * the index of the chosen candidate, or null when none fits.
 */
export function placeLabels(
  requests: readonly LabelRequest[],
  obstacles: readonly PixelRect[],
  gap = 2,
): Map<string, number | null> {
  const ordered = [...requests].sort(
    (a, b) =>
      a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const placed: PixelRect[] = [];
  const result = new Map<string, number | null>();
  for (const request of ordered) {
    const index = request.candidates.findIndex(
      (candidate) =>
        !obstacles.some((o) => intersects(candidate, o, gap)) &&
        !placed.some((p) => intersects(candidate, p, gap)),
    );
    const chosen = request.candidates[index];
    if (chosen) placed.push(chosen);
    result.set(request.id, chosen ? index : null);
  }

  return result;
}
