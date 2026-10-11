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

/**
 * Whether an airport may show a data block at a zoom. Every airport that
 * `visibleAirports` returns does, at every zoom; the block's content shrinks
 * with the zoom instead (see `dataBlockLines`).
 */
// The signature is kept so callers can add per-airport rules later.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function blockZoomRule(_airport: ChartAirport, _zoom: number): boolean {
  return true;
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

/**
 * Greedily places data blocks in rank order. A block is kept only when its
 * box overlaps no placed block and no other airport's symbol box. Returns
 * the top-left pixel of each placed block, keyed by airport code.
 */
export function placeBlocks(
  items: readonly {
    code: string;
    x: number;
    y: number;
    lines: readonly string[];
  }[],
  symbolSize = 24,
): Map<string, { x: number; y: number }> {
  const half = symbolSize / 2;
  const symbols = items.map((item): Box => ({
    left: item.x - half,
    top: item.y - half,
    width: symbolSize,
    height: symbolSize,
  }));
  const placedBoxes: Box[] = [];
  const result = new Map<string, { x: number; y: number }>();

  items.forEach((item, index) => {
    const maxChars = Math.max(0, ...item.lines.map((l) => l.length));
    const box: Box = {
      left: item.x + 14,
      top: item.y - 10,
      width: maxChars * 6.4 + 6,
      height: item.lines.length * 12 + 2,
    };
    const blocked =
      placedBoxes.some((p) => overlaps(box, p)) ||
      symbols.some((s, i) => i !== index && overlaps(box, s));
    if (blocked) return;
    placedBoxes.push(box);
    result.set(item.code, { x: box.left, y: box.top });
  });

  return result;
}
