import type { ChartAirport } from '../../chart';
import type { Airport } from '../../places';

/** The ring's SVG box in CSS pixels; the ring sits at its centre. */
export const RING_BOX = 12;

const COLOR = 'currentColor';
const C = RING_BOX / 2;
const HELI_H = 'M-2.5 -3 V3 M2.5 -3 V3 M-2.5 0 H2.5';
const ANCHOR = 'M0 -4.5 V4.5 M-3 -1.5 H3 M-4.5 1 Q-4 4.5 0 4.5 Q4 4.5 4.5 1';

/** A fixed glyph path, scaled to sit inside the 10 px ring. */
const glyph = (d: string, scale: number) =>
  `<path transform="translate(${C} ${C}) scale(${scale})" d="${d}" fill="none" stroke="${COLOR}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;

/**
 * The ink ring for an airport the map cannot draw as runways: a 10 px open
 * ring at the reference point, with a small "H" for a heliport or an anchor
 * for a seaplane base. Fallback-table airports are marked `is-fallback`.
 * Colour comes from `currentColor`, which CSS sets to ink. The markup holds
 * numbers and fixed literals only, never upstream text.
 */
export function airportRing(airport: ChartAirport | Airport): {
  className: string;
  html: string;
} {
  const kind = 'kind' in airport ? airport.kind : 'airport';
  const inner =
    kind === 'heliport'
      ? glyph(HELI_H, 0.8)
      : kind === 'seaplane'
        ? glyph(ANCHOR, 0.65)
        : '';

  return {
    className: 'towered' in airport ? 'atc-apt' : 'atc-apt is-fallback',
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="${RING_BOX}" height="${RING_BOX}" viewBox="0 0 ${RING_BOX} ${RING_BOX}"><circle cx="${C}" cy="${C}" r="5" fill="none" stroke="${COLOR}" stroke-width="1.5"/>${inner}</svg>`,
  };
}
