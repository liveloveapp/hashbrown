/**
 * Card literals: LiveLoveApp's flat house style in hashbrown's colours, the
 * same values as the site tokens in `app/globals.css`. Satori cannot read CSS
 * variables, so they are copied here.
 */
export const CARD_COLORS = {
  ground: '#ffffff',
  ink: '#1c1917',
  muted: '#57524d',
  highlight: '#fde4ba',
} as const;

/** The height of the striped hashbrown band along a card's bottom edge. */
export const CARD_STRIPE_HEIGHT = 12;

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

/**
 * The pixel size of a card.
 *
 * @param size - `og` (default) or `github`.
 */
export function cardSize(size: 'og' | 'github' = 'og'): {
  width: number;
  height: number;
} {
  return size === 'github' ? GITHUB_SIZE : OG_SIZE;
}
