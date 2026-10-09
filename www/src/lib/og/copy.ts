/** The site's tagline, the default card's title. */
export const CARD_TAGLINE = 'AI chat and agents for React and Angular.';

/** The default card's subtitle. */
export const CARD_DEFAULT_SUBTITLE =
  'Open source generative UI framework · hashbrown.dev';

/** The GitHub card's subtitle. */
export const CARD_GITHUB_SUBTITLE =
  'Generative UI, client-side tools and streaming structured output, from any model.';

/** The install command on the GitHub card. */
export const CARD_INSTALL = 'npm install @hashbrownai/react';

/**
 * A docs page's card title: its front matter title without the
 * `: Hashbrown React Docs` / `: Hashbrown Angular Docs` suffix.
 *
 * @param title - The page's front matter title.
 */
export function docsCardTitle(title: string): string {
  return title.replace(/: Hashbrown (React|Angular) Docs$/, '');
}

/**
 * Shorten text to at most `max` characters, cutting at a word boundary and
 * ending with an ellipsis. Text that already fits is returned unchanged.
 *
 * @param text - The text to shorten.
 * @param max - The longest result allowed, ellipsis included.
 */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max - 1);
  const atWordEnd = text[max - 1] === ' ';
  const lastSpace = cut.lastIndexOf(' ');
  const kept = atWordEnd || lastSpace <= 0 ? cut : cut.slice(0, lastSpace);
  return `${kept.replace(/[\s,.;:]+$/, '')}…`;
}
