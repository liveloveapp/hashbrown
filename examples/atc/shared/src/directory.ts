import type { ChartAirport } from './chart';
import { type Airport, AIRPORT_CODES, FALLBACK_AIRPORTS } from './places';
import type { AtcState } from './store';

const cache = new WeakMap<readonly ChartAirport[], readonly ChartAirport[]>();
const PRIORITY = new Map<string, number>(
  AIRPORT_CODES.map((code, index) => [code, index]),
);
const ALIASES = new Map(FALLBACK_AIRPORTS.map((a) => [a.code, a.aliases]));

/** Chart airports with fallback aliases merged, in lookup priority order. */
function ordered(airports: readonly ChartAirport[]): readonly ChartAirport[] {
  const hit = cache.get(airports);
  if (hit) return hit;
  const result = airports
    .map((a) => ({
      ...a,
      aliases: [...a.aliases, ...(ALIASES.get(a.code) ?? [])],
    }))
    .sort(
      (a, b) =>
        (PRIORITY.get(a.code) ?? Infinity) -
          (PRIORITY.get(b.code) ?? Infinity) || a.rank - b.rank,
    );
  cache.set(airports, result);

  return result;
}

/**
 * The airports the assistant and map know: FAA chart airports once loaded,
 * else the 40-airport fallback table. Cached per airports array.
 */
export function airportDirectory(state: AtcState): readonly Airport[] {
  return state.chart.status === 'ready'
    ? ordered(state.chart.airports)
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
  if (state.chart.status !== 'ready') return null;
  const wanted = code.trim().toUpperCase();

  return (
    ordered(state.chart.airports).find(
      (a) => a.code === wanted || a.faa === wanted,
    ) ?? null
  );
}
