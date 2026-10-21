import type { Aircraft } from './aircraft';
import { matchesResolved } from './find-aircraft';
import { airlineFor } from './names';
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

/**
 * The airline that operates at least 40% of `matches` (and at least three
 * aircraft), or null. Ties go to the first name alphabetically.
 */
function commonAirline(matches: readonly Aircraft[]): string | null {
  const counts = new Map<string, number>();
  for (const aircraft of matches) {
    const name = airlineFor(aircraft.callsign);
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
    ? name
    : null;
}

/**
 * Up to two ways to narrow the applied map filter, in a fixed priority order:
 * an altitude ceiling, the airline that dominates the matches, a tighter
 * radius, then jets only. A clause the filter already has is never suggested.
 * Returns an empty list when no filter is applied or it matches no aircraft.
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
  if (matches.length === 0) {
    return [];
  }
  const hasAltitude =
    filter.minAltitudeFt != null || filter.maxAltitudeFt != null;
  const airline = filter.airline == null ? commonAirline(matches) : null;
  const wideNear =
    filter.near != null && filter.near.radiusNm > NEAR_RADIUS_LIMIT_NM;

  return [
    hasAltitude ? null : 'Below 5,000 ft',
    airline !== null ? `Only ${airline}` : null,
    wideNear ? 'Within 10 nm' : null,
    filter.kind == null ? 'Only jets' : null,
  ]
    .filter((text): text is string => text !== null)
    .slice(0, MAX_REFINEMENTS)
    .map((text) => ({ text }));
}
