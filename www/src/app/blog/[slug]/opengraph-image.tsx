import { formatPostDate } from '../../../components/blog/post-date';
import { renderCard, type CardContent } from '../../../lib/og/card';
import { OG_SIZE } from '../../../lib/og/tokens';
import { listBlogPosts, readBlogPost } from '../../../lib/content';

type Params = { slug: string };

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'A hashbrown blog post';
export const dynamicParams = false;

/** One card per post, prerendered. */
export function generateStaticParams(): Params[] {
  return listBlogPosts().map(({ slug }) => ({ slug }));
}

/**
 * A post's card: its title, then its date.
 *
 * @param slug - The post's URL slug.
 */
export function blogCardContent(slug: string): CardContent {
  const post = readBlogPost(slug);
  if (!post) {
    throw new Error(`No blog post ${slug}`);
  }
  return {
    title: post.title,
    subtitle: [`${formatPostDate(post.date)} · hashbrown blog`],
  };
}

/** The post's share card. */
export default async function BlogCard({
  params,
}: {
  params: Promise<Params>;
}) {
  return renderCard(blogCardContent((await params).slug));
}
