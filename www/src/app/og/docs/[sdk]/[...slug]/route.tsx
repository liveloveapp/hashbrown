import { renderCard } from '../../../../../lib/og/card';
import { listDocs, SDKS } from '../../../../../lib/content';
import { docsCardContent, type DocsCardParams } from './content';

export const dynamic = 'force-static';
export const dynamicParams = false;

/** One card per docs page, prerendered. */
export function generateStaticParams(): DocsCardParams[] {
  return SDKS.flatMap((sdk) => listDocs(sdk).map((slug) => ({ sdk, slug })));
}

/** The docs page's share card. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<DocsCardParams> },
) {
  return renderCard(docsCardContent(await params));
}
