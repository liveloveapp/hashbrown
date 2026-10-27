/**
 * Rules for the mobile layout report (`npx nx e2e www`). A browser collects a
 * {@link LayoutSnapshot} for each page and viewport; {@link layoutIssues}
 * turns it into the problems a phone or tablet reader would hit.
 */

/** A viewport the report renders every page at. */
export interface LayoutViewport {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/** Phone portrait (small and common), tablet portrait, and phone landscape. */
export const LAYOUT_VIEWPORTS: readonly LayoutViewport[] = [
  { name: 'phone-320', width: 320, height: 568 },
  { name: 'phone-375', width: 375, height: 812 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'landscape-812', width: 812, height: 375 },
];

/** Below this width the page is laid out for a phone held upright. */
export const PHONE_MAX_WIDTH = 767;

/** Touch target minimum on phones (Apple HIG 44pt). */
export const PHONE_TARGET = 44;

/** Touch target minimum elsewhere (WCAG 2.2 target size, minimum). */
export const TARGET = 24;

/** Smallest legible text, code included. */
export const MIN_TEXT = 12;

/** iOS Safari zooms into a focused field set smaller than this. */
export const MIN_INPUT_TEXT = 16;

/** What a browser measured on one page at one viewport. */
export interface LayoutSnapshot {
  readonly page: string;
  readonly viewport: LayoutViewport;
  /** The document's scroll width; wider than the viewport means sideways scroll. */
  readonly scrollWidth: number;
  /** Elements that run past the right edge of an ancestor that hides overflow. */
  readonly clipped: readonly { label: string; right: number; edge: number }[];
  /** Interactive elements, excluding links inside running text. */
  readonly targets: readonly { label: string; width: number; height: number }[];
  /** Visible text, keyed by its element. */
  readonly texts: readonly { label: string; fontSize: number }[];
  /** Text fields and selects a reader can focus. */
  readonly inputs: readonly { label: string; fontSize: number }[];
  /** Controls in an open overlay that something else is drawn over. */
  readonly covered: readonly { label: string; by: string }[];
}

/** One problem found in a snapshot. */
export interface LayoutIssue {
  readonly rule:
    | 'page-scroll'
    | 'clipped'
    | 'small-target'
    | 'small-text'
    | 'input-zoom'
    | 'covered';
  readonly page: string;
  readonly viewport: string;
  readonly detail: string;
}

/**
 * Applies the mobile layout rules to one snapshot.
 *
 * @param snapshot - What the browser measured.
 * @returns Every problem found, in rule order.
 */
export function layoutIssues(snapshot: LayoutSnapshot): LayoutIssue[] {
  const { page, viewport } = snapshot;
  const issue = (rule: LayoutIssue['rule'], detail: string): LayoutIssue => ({
    rule,
    page,
    viewport: viewport.name,
    detail,
  });
  const minTarget = viewport.width <= PHONE_MAX_WIDTH ? PHONE_TARGET : TARGET;

  return [
    ...(snapshot.scrollWidth > viewport.width
      ? [issue('page-scroll', `scrolls to ${snapshot.scrollWidth}px`)]
      : []),
    ...snapshot.clipped
      .filter(({ right, edge }) => right > edge + 1)
      .map(({ label, right, edge }) =>
        issue('clipped', `${label} ends at ${right}px, cut at ${edge}px`),
      ),
    ...snapshot.targets
      .filter(
        ({ width, height }) =>
          Math.round(width) < minTarget || Math.round(height) < minTarget,
      )
      .map(({ label, width, height }) =>
        issue(
          'small-target',
          `${label} is ${Math.round(width)}x${Math.round(height)}, under ${minTarget}px`,
        ),
      ),
    ...snapshot.texts
      .filter(({ fontSize }) => fontSize < MIN_TEXT)
      .map(({ label, fontSize }) =>
        issue('small-text', `${label} is ${fontSize}px`),
      ),
    ...snapshot.inputs
      .filter(({ fontSize }) => fontSize < MIN_INPUT_TEXT)
      .map(({ label, fontSize }) =>
        issue('input-zoom', `${label} is ${fontSize}px`),
      ),
    ...snapshot.covered.map(({ label, by }) =>
      issue('covered', `${label} is under ${by}`),
    ),
  ];
}
