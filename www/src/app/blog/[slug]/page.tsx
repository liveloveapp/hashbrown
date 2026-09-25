import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlogPostView } from '../../../components/blog/BlogPostView';
import { renderDocsMarkdown } from '../../../components/docs-markdown';
import { listBlogPosts, readBlogPost } from '../../../lib/content';
import { pageMetadata } from '../../../lib/site-metadata';

type Params = { slug: string };

/** Pre-render every blog post. */
export function generateStaticParams(): Params[] {
  return listBlogPosts().map(({ slug }) => ({ slug }));
}

export const dynamicParams = false;

/** Title, description, Open Graph image and publish date from the post. */
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const post = readBlogPost((await params).slug);
  return post
    ? pageMetadata({
        title: post.title,
        description: post.description,
        image: post.ogImage,
        publishedTime: post.date,
      })
    : {};
}

/** One blog post. Blog markdown uses the same element map as the React docs. */
export default async function BlogPostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const post = readBlogPost((await params).slug);
  if (!post) {
    notFound();
  }
  const { body, ...summary } = post;
  return (
    <BlogPostView post={summary}>
      {(await renderDocsMarkdown(body, 'react')).content}
    </BlogPostView>
  );
}
