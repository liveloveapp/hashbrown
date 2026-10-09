import { CARD_DEFAULT_SUBTITLE, CARD_TAGLINE } from '../lib/og/copy';
import { renderCard } from '../lib/og/card';
import { OG_SIZE } from '../lib/og/tokens';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = `hashbrown: ${CARD_TAGLINE} ${CARD_DEFAULT_SUBTITLE}. By LiveLoveApp.`;

/** The site-wide share card: every page without its own card uses it. */
export default function OpenGraphImage() {
  return renderCard({ title: CARD_TAGLINE, subtitle: [CARD_DEFAULT_SUBTITLE] });
}
