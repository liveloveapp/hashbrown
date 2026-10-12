import type { ChartAirport } from './chart';
import { type Airport, AIRPORT_CODES, FALLBACK_AIRPORTS } from './places';
import type { AtcState } from './store';

interface OrderedAirports {
  /** Chart airports with fallback aliases, in lookup priority order. */
  readonly chart: readonly ChartAirport[];
  /** `chart` plus the fallback airports it lacks, in lookup priority order. */
  readonly all: readonly Airport[];
}

const cache = new WeakMap<readonly ChartAirport[], OrderedAirports>();
const PRIORITY = new Map<string, number>(
  AIRPORT_CODES.map((code, index) => [code, index]),
);
const ALIASES = new Map(FALLBACK_AIRPORTS.map((a) => [a.code, a.aliases]));

// Fallback airports have no chart rank; they sort by the priority table only.
const rankOf = (airport: Airport): number =>
  'rank' in airport ? (airport as ChartAirport).rank : 0;

/** Fallback table order first, then chart rank. */
const byPriority = (a: Airport, b: Airport): number =>
  (PRIORITY.get(a.code) ?? Infinity) - (PRIORITY.get(b.code) ?? Infinity) ||
  rankOf(a) - rankOf(b);

/**
 * Chart airports with fallback aliases merged, in lookup priority order, and
 * the same list with the fallback airports the chart lacks (those beyond its
 * radius, such as KGEG and KSUN) added in their priority place.
 */
function orderedAirports(airports: readonly ChartAirport[]): OrderedAirports {
  const hit = cache.get(airports);
  if (hit) {
    return hit;
  }
  const chart = airports
    .map((a) => ({
      ...a,
      aliases: [...a.aliases, ...(ALIASES.get(a.code) ?? [])],
    }))
    .sort(byPriority);
  const codes = new Set(chart.map((a) => a.code));
  const all = [
    ...chart,
    ...FALLBACK_AIRPORTS.filter((a) => !codes.has(a.code)),
  ].sort(byPriority);
  const result = { chart, all };
  cache.set(airports, result);

  return result;
}

/**
 * The airports the assistant and map know: FAA chart airports once loaded,
 * plus the fallback airports the chart lacks, else the 40-airport fallback
 * table. Cached per airports array.
 */
export function airportDirectory(state: AtcState): readonly Airport[] {
  return state.chart.status === 'ready'
    ? orderedAirports(state.chart.airports).all
    : FALLBACK_AIRPORTS;
}

/** The airport with this ICAO code or FAA ident, ignoring case, or null. */
export function airportByCode(state: AtcState, code: string): Airport | null {
  const wanted = code.trim().toUpperCase();

  return (
    airportDirectory(state).find(
      (a) => a.code === wanted || a.faa === wanted,
    ) ?? null
  );
}

/** The FAA chart airport for a code, or null when the chart is not ready. */
export function chartAirportByCode(
  state: AtcState,
  code: string,
): ChartAirport | null {
  if (state.chart.status !== 'ready') {
    return null;
  }
  const wanted = code.trim().toUpperCase();

  return (
    orderedAirports(state.chart.airports).chart.find(
      (a) => a.code === wanted || a.faa === wanted,
    ) ?? null
  );
}
