import type { CardContent } from '../../../../../lib/og/card';
import { docsCardTitle, truncateAtWord } from '../../../../../lib/og/copy';
import { readDoc, type Sdk, SDKS } from '../../../../../lib/content';

/** The SDK and documentation slug used to generate a share card. */
export type DocsCardParams = { sdk: string; slug: string[] };

const SDK_LABEL: Record<Sdk, string> = { react: 'React', angular: 'Angular' };

/**
 * A docs page's card: its heading, its description (cut to 120 characters),
 * and which SDK the page is for.
 *
 * @param params - The page's SDK and slug.
 */
export function docsCardContent({ sdk, slug }: DocsCardParams): CardContent {
  const doc = (SDKS as readonly string[]).includes(sdk)
    ? readDoc(sdk as Sdk, slug)
    : undefined;
  if (!doc) {
    throw new Error(`No docs page ${sdk}/${slug.join('/')}`);
  }
  const footer = `${SDK_LABEL[sdk as Sdk]} docs · hashbrown.dev`;
  return {
    title: docsCardTitle(doc.title),
    subtitle: doc.description
      ? [truncateAtWord(doc.description, 120), footer]
      : [footer],
  };
}
