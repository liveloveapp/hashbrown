import { intersects, type TagRect } from '../tag-obstacles';

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
  readonly candidates: readonly TagRect[];
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

/**
 * Places labels greedily, by priority and then by id so the result never
 * depends on input order. A candidate is taken only when it comes within
 * `gap` pixels of no obstacle and no label already placed. Returns, per id,
 * the index of the chosen candidate, or null when none fits.
 */
export function placeLabels(
  requests: readonly LabelRequest[],
  obstacles: readonly TagRect[],
  gap = 2,
): Map<string, number | null> {
  const ordered = [...requests].sort(
    (a, b) =>
      a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const placed: TagRect[] = [];
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
