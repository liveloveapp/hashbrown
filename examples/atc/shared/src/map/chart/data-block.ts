import type { ChartAirport } from '../../chart';

/**
 * The lines of an airport's sectional data block. At zoom 12 and above only
 * the name line shows; below that the block adds the communications line
 * and the elevation, lighting, runway and frequency line.
 */
export function dataBlockLines(airport: ChartAirport, zoom: number): string[] {
  const title = `${airport.name} (${airport.faa})`;
  if (zoom >= 12) return [title];

  const lines = [title];
  const { frequencies, weather } = airport;

  if (airport.towered) {
    if (frequencies.tower !== null) {
      const atis = frequencies.atis !== null ? ` ATIS ${frequencies.atis}` : '';
      lines.push(
        `CT ${frequencies.tower}${airport.towerPartTime ? '★' : ''}${atis}`,
      );
    }
  } else if (weather !== null) {
    lines.push(`${weather.kind} ${weather.frequency}`);
  }

  const parts: string[] = [String(airport.elevationFt)];
  if (airport.lighting === 'full') parts.push('L');
  if (airport.lighting === 'limited') parts.push('*L');
  if (airport.runways.length > 0) {
    const maxLengthFt = Math.max(...airport.runways.map((r) => r.lengthFt));
    parts.push(String(Math.floor((maxLengthFt + 30) / 100)));
  }
  const frequency = airport.towered
    ? frequencies.unicom
    : (frequencies.ctaf ?? frequencies.unicom);
  if (frequency !== null) parts.push(frequency);
  lines.push(parts.join(' '));

  return lines;
}

/**
 * Builds a data block element with one span per line. Text goes in through
 * `textContent` only, so upstream names cannot inject markup.
 */
export function renderDataBlock(
  doc: Document,
  lines: readonly string[],
  tone: 'towered' | 'nontowered' | 'fallback',
): HTMLElement {
  const block = doc.createElement('div');
  block.className = `atc-apt-block is-${tone}`;
  for (const line of lines) {
    const span = doc.createElement('span');
    span.textContent = line;
    block.append(span);
  }
  return block;
}
