import { renderCard } from '../../../../lib/og/card';
import { blogCardContent, generateStaticParams } from '../opengraph-image';

type Params = { slug: string };

export const dynamic = 'force-static';
export const dynamicParams = false;
export { generateStaticParams };

/**
 * A post's card at 1080x1080, for sharing it in square feeds. Same title and
 * date as its Open Graph card.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<Params> },
) {
  const { slug } = await params;
  return renderCard({ ...blogCardContent(slug), size: 'square' });
}
