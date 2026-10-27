import { renderCard } from '../../lib/og/card';
import {
  CARD_DEFAULT_SUBTITLE,
  CARD_INSTALL,
  CARD_TAGLINE,
} from '../../lib/og/copy';

export const dynamic = 'force-static';

/**
 * The site card at 1080x1080, for square feeds such as LinkedIn and
 * Instagram. The brand page links it as a download.
 */
export function GET() {
  return renderCard({
    title: CARD_TAGLINE,
    subtitle: [CARD_DEFAULT_SUBTITLE],
    code: CARD_INSTALL,
    size: 'square',
  });
}
