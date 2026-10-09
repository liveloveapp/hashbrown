/**
 * Card literals from LiveLoveApp's house style (its `src/lib/og.tsx` and
 * `globals.css`). Satori cannot read CSS variables, so they are copied here.
 */
export const CARD_COLORS = {
  ground: '#ffffff',
  ink: '#0d0d0d',
  muted: '#5d5d5d',
  surface: '#f7f7f8',
  rule: '#e8e8e8',
} as const;

/** The 1.905:1 Open Graph card most platforms unfurl. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** GitHub's documented social preview size. */
export const GITHUB_SIZE = { width: 1280, height: 640 } as const;

/**
 * The title's type size: 64px up to 60 characters, 52px beyond, so the
 * longest titles still fit in three lines.
 *
 * @param title - The card title.
 */
export function titleSize(title: string): {
  fontSize: number;
  lineHeight: number;
} {
  return title.length <= 60
    ? { fontSize: 64, lineHeight: 1.08 }
    : { fontSize: 52, lineHeight: 1.1 };
}
