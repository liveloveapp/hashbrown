import type { Metadata } from 'next';
import { BlogIndex } from '../../components/blog/BlogIndex';
import { toPostSummary } from '../../components/blog/PostPreview';
import { listBlogPosts } from '../../lib/content';
import { pageMetadata } from '../../lib/site-metadata';

export const metadata: Metadata = pageMetadata({
  title: 'Home: Hashbrown Blog',
  description: 'Hashbrown Blog.',
});

/** Blog index, newest first. Post bodies stay on the server. */
export default function BlogIndexPage() {
  return <BlogIndex posts={listBlogPosts().map(toPostSummary)} />;
}
