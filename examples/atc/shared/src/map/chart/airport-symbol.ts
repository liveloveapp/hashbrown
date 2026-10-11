import type { ChartAirport, Runway } from '../../chart';
import type { Airport } from '../../places';

const COLOR = 'currentColor';
const HELI_H = 'M-2.5 -3 V3 M2.5 -3 V3 M-2.5 0 H2.5';
const ANCHOR = 'M0 -4.5 V4.5 M-3 -1.5 H3 M-4.5 1 Q-4 4.5 0 4.5 Q4 4.5 4.5 1';

const round = (n: number): number => Math.round(n * 100) / 100;

function ring(c: number, r: number, strokeWidth: number): string {
  return `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${COLOR}" stroke-width="${strokeWidth}"/>`;
}

function bar(c: number, runway: Runway): string {
  const rad = ((runway.bearingDeg ?? 0) * Math.PI) / 180;
  const dx = Math.sin(rad) * 6;
  const dy = -Math.cos(rad) * 6;
  return `<line x1="${round(c - dx)}" y1="${round(c - dy)}" x2="${round(
    c + dx,
  )}" y2="${round(c + dy)}" stroke="#fff" stroke-width="2"/>`;
}

function ticks(c: number): string {
  const rects = [
    [c - 1, c - 9, 2, 3],
    [c + 6, c - 1, 3, 2],
    [c - 1, c + 6, 2, 3],
    [c - 9, c - 1, 3, 2],
  ];
  return rects
    .map(
      ([x, y, w, h]) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${COLOR}"/>`,
    )
    .join('');
}

/**
 * The sectional symbol for an airport. Colour comes from `currentColor`
 * and the `is-*` class, so CSS decides blue or magenta. The markup holds
 * numbers and fixed literals only, never upstream text.
 */
export function airportSymbol(airport: ChartAirport | Airport): {
  className: string;
  html: string;
  size: number;
} {
  if (!('towered' in airport)) {
    const c = 9;
    return {
      className: 'atc-apt is-fallback',
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">${ring(
        c,
        5,
        1.5,
      )}</svg>`,
      size: 18,
    };
  }

  const tone = airport.towered ? 'is-towered' : 'is-nontowered';
  const hardLengths = airport.runways
    .filter((r) => r.hard)
    .map((r) => r.lengthFt);
  const longestHard = hardLengths.length > 0 ? Math.max(...hardLengths) : 0;
  const isDisc =
    airport.kind === 'airport' && !airport.military && longestHard >= 1500;
  const size = (airport.fuel && !airport.military) || isDisc ? 24 : 18;
  const c = size / 2;

  let shape: string;
  if (airport.kind === 'heliport') {
    shape = `${ring(c, 5, 1.5)}<path transform="translate(${c} ${c})" d="${HELI_H}" fill="none" stroke="${COLOR}" stroke-width="1.5"/>`;
  } else if (airport.kind === 'seaplane') {
    shape = `<path transform="translate(${c} ${c})" d="${ANCHOR}" fill="none" stroke="${COLOR}" stroke-width="1.5"/>`;
  } else if (airport.military) {
    shape = `${ring(c, 6, 1.5)}${ring(c, 3, 1.5)}`;
  } else if (!isDisc) {
    shape = ring(c, 5, 1.5);
  } else {
    shape = `<circle cx="${c}" cy="${c}" r="6" fill="${COLOR}" stroke="none"/>${airport.runways
      .filter((r) => r.hard && r.bearingDeg !== null)
      .map((r) => bar(c, r))
      .join('')}`;
  }

  return {
    className: `atc-apt ${tone}`,
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${shape}${
      airport.fuel && !airport.military ? ticks(c) : ''
    }</svg>`,
    size,
  };
}
