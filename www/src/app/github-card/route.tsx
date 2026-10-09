import { renderCard } from '../../lib/og/card';
import {
  CARD_GITHUB_SUBTITLE,
  CARD_INSTALL,
  CARD_TAGLINE,
} from '../../lib/og/copy';

export const dynamic = 'force-static';

/**
 * The repository's social preview at GitHub's 1280x640. GitHub has no API for
 * it: `scripts/export-github-card.mjs` saves this to
 * `docs/brand/github-social-preview.png` for a maintainer to upload.
 */
export function GET() {
  return renderCard({
    title: CARD_TAGLINE,
    subtitle: [CARD_GITHUB_SUBTITLE],
    code: CARD_INSTALL,
    size: 'github',
  });
}
