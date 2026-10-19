/**
 * Returns the level keys of a score question in scale order.
 *
 * Levels are a record keyed by the level value as a string, and JavaScript
 * enumerates integer-like keys first, so `0..1 step 0.25` would come out as
 * `0, 1, 0.25, 0.5, 0.75`. Sorting numerically restores the scale.
 *
 * @param levels - The score question's levels.
 * @returns The level keys sorted by numeric value.
 */
export function orderedLevelKeys(levels: Record<string, string>): string[] {
  return Object.keys(levels).sort((a, b) => Number(a) - Number(b));
}
