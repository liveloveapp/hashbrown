/** The chart colours as computed CSS values, for canvas or SVG strokes. */
export interface ChartColours {
  readonly pavement: string;
  readonly hotspot: string;
  readonly ink: string;
}

/**
 * Reads the chart colours from the custom properties `chart.css` defines, so
 * the hexes live only in the stylesheet. An unset property falls back to
 * `currentColor`.
 */
export function chartColours(element: HTMLElement): ChartColours {
  const style = getComputedStyle(element);
  const read = (name: string) =>
    style.getPropertyValue(name).trim() || 'currentColor';

  return {
    pavement: read('--atc-diagram-pavement'),
    hotspot: read('--atc-diagram-hotspot'),
    ink: read('--atc-ink'),
  };
}
