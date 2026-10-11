import type { ChartAirport } from '../../chart';

function longestHardFt(airport: ChartAirport): number {
  return airport.runways.reduce(
    (max, r) => (r.hard && r.lengthFt > max ? r.lengthFt : max),
    0,
  );
}

/**
 * The airports worth drawing at a zoom, sorted by rank. Zoom 7 and below
 * keeps towered fields and hard runways of 5,000 ft or more; zooms 8 and 9
 * add hard runways of 3,000 ft or more; zoom 10 and above keeps all.
 */
export function visibleAirports(
  airports: readonly ChartAirport[],
  zoom: number,
): ChartAirport[] {
  const minHardFt = zoom <= 7 ? 5000 : zoom <= 9 ? 3000 : 0;
  return airports
    .filter((a) => zoom >= 10 || a.towered || longestHardFt(a) >= minHardFt)
    .sort((a, b) => a.rank - b.rank);
}
