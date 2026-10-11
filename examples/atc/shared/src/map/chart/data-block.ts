import type { ChartAirport } from '../../chart';

/** The second line of a block: the frequency to call on, then the elevation. */
function dataLine(airport: ChartAirport): string {
  const { frequencies } = airport;
  const elevation = String(airport.elevationFt);
  if (airport.towered && frequencies.tower !== null) {
    const star = airport.towerPartTime ? '★' : '';
    return `CT ${frequencies.tower}${star} · ${elevation}`;
  }
  if (frequencies.ctaf !== null)
    return `CTAF ${frequencies.ctaf} · ${elevation}`;
  return elevation;
}

/**
 * The lines of an airport's ink data block. At zoom 9 and below the block is
 * the ident alone; from zoom 10 to 13 it adds a data line (tower or CTAF
 * frequency, then elevation in feet); from zoom 14 only the name line shows,
 * because the diagram carries the detail.
 */
export function dataBlockLines(airport: ChartAirport, zoom: number): string[] {
  if (zoom <= 9) return [airport.faa];
  const title = `${airport.name} (${airport.faa})`;
  if (zoom >= 14) return [title];
  return [title, dataLine(airport)];
}

/**
 * Builds a data block element with one span per line; when `ident` is true
 * (the regional ident-only block) the single span gets `is-ident`. Text goes
 * in through `textContent` only, so upstream names cannot inject markup.
 */
export function renderDataBlock(
  doc: Document,
  lines: readonly string[],
  tone: 'ink' | 'fallback',
  ident = false,
): HTMLElement {
  const block = doc.createElement('div');
  block.className = `atc-apt-block is-${tone}`;
  for (const line of lines) {
    const span = doc.createElement('span');
    if (ident && lines.length === 1) span.className = 'is-ident';
    span.textContent = line;
    block.append(span);
  }
  return block;
}
