import { renderCard, type CardContent } from '../../../../../lib/og/card';
import { docsCardTitle, truncateAtWord } from '../../../../../lib/og/copy';
import { listDocs, readDoc, SDKS, type Sdk } from '../../../../../lib/content';

type Params = { sdk: string; slug: string[] };

export const dynamic = 'force-static';
export const dynamicParams = false;

const SDK_LABEL: Record<Sdk, string> = { react: 'React', angular: 'Angular' };

/** One card per docs page, prerendered. */
export function generateStaticParams(): Params[] {
  return SDKS.flatMap((sdk) => listDocs(sdk).map((slug) => ({ sdk, slug })));
}

/**
 * A docs page's card: its heading, its description (cut to 120 characters),
 * and which SDK the page is for.
 *
 * @param params - The page's SDK and slug.
 */
export function docsCardContent({ sdk, slug }: Params): CardContent {
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

/** The docs page's share card. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<Params> },
) {
  return renderCard(docsCardContent(await params));
}
