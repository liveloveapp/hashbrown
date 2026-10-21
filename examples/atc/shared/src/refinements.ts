import type { Aircraft } from './aircraft';
import {
  type MapFilter,
  matchesResolved,
  type ResolvedFilter,
} from './find-aircraft';
import { knownAirlineFor } from './names';
import type { AppliedMapFilter } from './store';

/** A suggested next step for the map filter. */
export interface Refinement {
  /** What is sent to the filter route and shown on the button. */
  readonly text: string;
}

const MAX_REFINEMENTS = 2;
const MIN_COMMON_MATCHES = 3;
const MIN_COMMON_SHARE = 0.4;
const NEAR_RADIUS_LIMIT_NM = 10;
const LOW_ALTITUDE_FT = 5000;

/**
 * The airline (by its known name) that operates at least 40% of `matches`
 * (and at least three aircraft), with how many it operates, or null. Ties go
 * to the first name alphabetically. Unknown airline codes never count.
 */
function commonAirline(
  matches: readonly Aircraft[],
): { name: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const aircraft of matches) {
    const name = knownAirlineFor(aircraft.callsign);
    if (name !== null) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const [name, count] =
    [...counts.entries()].sort(
      ([an, ac], [bn, bc]) => bc - ac || an.localeCompare(bn),
    )[0] ?? [];

  return name !== undefined &&
    count !== undefined &&
    count >= MIN_COMMON_MATCHES &&
    count >= matches.length * MIN_COMMON_SHARE
    ? { name, count }
    : null;
}

/** True when `kept` of `total` matches is some but not all of them. */
function narrows(kept: number, total: number): boolean {
  return kept > 0 && kept < total;
}

/** How many of `matches` also pass `resolved` with `patch` applied. */
function keptBy(
  resolved: ResolvedFilter,
  patch: Partial<ResolvedFilter>,
  matches: readonly Aircraft[],
): number {
  const narrowed = { ...resolved, ...patch };

  return matches.filter((a) => matchesResolved(narrowed, a)).length;
}

/**
 * Up to two ways to narrow the applied map filter, in a fixed priority order:
 * an altitude ceiling, the airline that dominates the matches, a tighter
 * radius, then jets only. A clause the filter already has is never suggested,
 * nor is jets only for a filter that names a type, nor a tighter radius when
 * the near clause was dropped as an unknown place. Each suggestion keeps at
 * least one of the current matches and drops at least one. Returns an empty
 * list when no filter is applied or it matches no aircraft.
 *
 * @param applied - The filter on the map, or null.
 * @param aircraft - The aircraft on the map before filtering.
 */
export function refinements(
  applied: AppliedMapFilter | null,
  aircraft: readonly Aircraft[],
): readonly Refinement[] {
  if (applied === null) {
    return [];
  }
  const { filter, resolved } = applied;
  const matches = aircraft.filter((a) => matchesResolved(resolved, a));
  const total = matches.length;
  if (total === 0) {
    return [];
  }
  const hasAltitude =
    filter.minAltitudeFt != null || filter.maxAltitudeFt != null;
  const airline = filter.airline == null ? commonAirline(matches) : null;
  const wideNear =
    resolved.nearAirport !== null && resolved.radius > NEAR_RADIUS_LIMIT_NM;
  const jetsOnly = filter.kind == null && filter.typeCode == null;
  const lowOnly = keptBy(resolved, { maxAltitudeFt: LOW_ALTITUDE_FT }, matches);
  const closer = keptBy(resolved, { radius: NEAR_RADIUS_LIMIT_NM }, matches);
  const jets = keptBy(resolved, { kind: 'jet' }, matches);

  return [
    !hasAltitude && narrows(lowOnly, total) ? 'Below 5,000 ft' : null,
    airline !== null && narrows(airline.count, total)
      ? `Only ${airline.name}`
      : null,
    wideNear && narrows(closer, total) ? 'Within 10 nm' : null,
    jetsOnly && narrows(jets, total) ? 'Only jets' : null,
  ]
    .filter((text): text is string => text !== null)
    .slice(0, MAX_REFINEMENTS)
    .map((text) => ({ text }));
}

/**
 * Refinements held for one applied filter: `key` is the filter they were
 * computed for, or null when there is none yet (no filter, or a filter that
 * matched nothing, which is tried again).
 */
export interface StableRefinements {
  /** The `AppliedMapFilter.filter` object `list` was computed for, or null. */
  readonly key: MapFilter | null;
  /** The refinements to show. */
  readonly list: readonly Refinement[];
}

/** No filter, so no refinements. */
export const NO_REFINEMENTS: StableRefinements = { key: null, list: [] };

/**
 * {@link refinements} computed once per applied filter, so the suggestions do
 * not change as traffic moves under the same filter. Returns `prev` itself
 * while the filter object is the one `prev` was computed for; recomputes for
 * a new filter, and keeps recomputing while the filter matches no aircraft
 * (returning `prev` while it is already empty, so a caller can compare by
 * identity).
 * Call it only once a filter run has settled.
 *
 * @param prev - What the last call returned ({@link NO_REFINEMENTS} at first).
 * @param applied - The filter on the map, or null.
 * @param aircraft - The aircraft on the map before filtering.
 */
export function stableRefinements(
  prev: StableRefinements,
  applied: AppliedMapFilter | null,
  aircraft: readonly Aircraft[],
): StableRefinements {
  if (applied === null) {
    return NO_REFINEMENTS;
  }
  if (prev.key === applied.filter) {
    return prev;
  }
  const matched = aircraft.some((a) => matchesResolved(applied.resolved, a));
  if (!matched && prev.key === null && prev.list.length === 0) {
    return prev;
  }

  return {
    key: matched ? applied.filter : null,
    list: refinements(applied, aircraft),
  };
}
