import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { docsComponents } from '../../../components/docs-components';
import { listBlogPosts, readBlogPost } from '../../../lib/content';
import { renderMarkdown } from '../../../lib/markdown';
import { pageMetadata } from '../../../lib/site-metadata';
import styles from '../../docs/docs.module.css';

type Params = { slug: string };

/** Pre-render every blog post. */
export function generateStaticParams(): Params[] {
  return listBlogPosts().map(({ slug }) => ({ slug }));
}

export const dynamicParams = false;

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
  return (
    <article className={styles.prose}>
      <h1>{post.title}</h1>
      <p>
        <small>{post.date}</small>
      </p>
      {(await renderMarkdown(post.body, docsComponents('react'))).content}
    </article>
  );
}
