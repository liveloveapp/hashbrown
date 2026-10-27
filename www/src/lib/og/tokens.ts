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

/** The 1:1 card for LinkedIn, Instagram and other square feeds. */
export const SQUARE_SIZE = { width: 1080, height: 1080 } as const;

/** Which card to render: `og` (default), `github` or `square`. */
export type CardSize = 'og' | 'github' | 'square';

/**
 * The title's type size: 64px up to 60 characters, 52px beyond, so the
 * longest titles still fit in three lines. The square card has the height for
 * two steps larger: 96px, then 76px.
 *
 * @param title - The card title.
 * @param size - The card being rendered.
 */
export function titleSize(
  title: string,
  size: CardSize = 'og',
): {
  fontSize: number;
  lineHeight: number;
} {
  const short = title.length <= 60;
  if (size === 'square') {
    return short
      ? { fontSize: 96, lineHeight: 1.04 }
      : { fontSize: 76, lineHeight: 1.06 };
  }
  return short
    ? { fontSize: 64, lineHeight: 1.08 }
    : { fontSize: 52, lineHeight: 1.1 };
}

const CARD_SIZES = {
  og: OG_SIZE,
  github: GITHUB_SIZE,
  square: SQUARE_SIZE,
} as const;

/**
 * The pixel size of a card.
 *
 * @param size - `og` (default), `github` or `square`.
 */
export function cardSize(size: CardSize = 'og'): {
  width: number;
  height: number;
} {
  return CARD_SIZES[size];
}
