/** The tag's horizontal padding and border, in pixels. */
const TAG_CHROME = 2 * 7 + 2;
/**
 * Slack for tabular digits: the tag sets `tabular-nums`, which a canvas
 * cannot, so a measured label can come out a little narrow.
 */
const TAG_SLACK = 2;
/**
 * The gap before the altitude (`.atc-plane-alt` margin), in pixels. Counted
 * without an altitude too: the empty span stays and still takes its margin.
 */
const ALT_GAP = 4;
/** Character advances used when text cannot be measured (tests). */
const FALLBACK_LABEL_ADVANCE = 7.5;
const FALLBACK_MONO_ADVANCE = 6.6;

/**
 * Measures tag text without layout reads: the label in the tag's sans font
 * and the altitude in the mono font, on a canvas, each label once. Without a
 * canvas (jsdom) it estimates from the character count.
 */
export function createTextMeasure(element: HTMLElement) {
  const win = element.ownerDocument.defaultView;
  const context =
    win && typeof win.CanvasRenderingContext2D === 'function'
      ? element.ownerDocument.createElement('canvas').getContext('2d')
      : null;
  let fonts: { label: string; mono: string } | null = null;
  let monoAdvance: number | null = null;
  const labels = new Map<string, number>();
  const clear = () => {
    labels.clear();
    monoAdvance = null;
  };
  element.ownerDocument.fonts?.addEventListener?.('loadingdone', clear);
  const fontsOf = () => {
    if (fonts === null && win) {
      const style = win.getComputedStyle(element);
      fonts = {
        label: `600 11px ${style.getPropertyValue('--atc-font') || 'sans-serif'}`,
        mono: `400 11px ${style.getPropertyValue('--atc-mono') || 'monospace'}`,
      };
    }

    return fonts;
  };
  const measure = (text: string, font: 'label' | 'mono') => {
    const stack = fontsOf();
    if (context === null || stack === null) {
      return null;
    }
    context.font = stack[font];

    return context.measureText(text).width;
  };

  return {
    /**
     * The tag's width for `label` and the altitude `alt` (without its leading
     * space). A non-empty altitude also counts the space before it, which the
     * span draws in the mono font.
     */
    width(label: string, alt: string): number {
      let labelWidth = labels.get(label);
      if (labelWidth === undefined) {
        labelWidth =
          measure(label, 'label') ?? label.length * FALLBACK_LABEL_ADVANCE;
        labels.set(label, labelWidth);
      }
      monoAdvance ??= measure('0', 'mono') ?? FALLBACK_MONO_ADVANCE;

      return Math.ceil(
        labelWidth +
          ALT_GAP +
          (alt === '' ? 0 : 1 + alt.length) * monoAdvance +
          TAG_CHROME +
          TAG_SLACK,
      );
    },
    destroy() {
      element.ownerDocument.fonts?.removeEventListener?.('loadingdone', clear);
    },
  };
}
