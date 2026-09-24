import type { Metadata } from 'next';
import Link from 'next/link';
import { listBlogPosts } from '../../lib/content';
import styles from '../docs/docs.module.css';

export const metadata: Metadata = { title: 'Home: Hashbrown Blog' };

/** Blog index, newest first. */
export default function BlogIndex() {
  return (
    <main className={styles.prose}>
      <h1>Blog</h1>
      <ul>
        {listBlogPosts().map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`}>{post.title}</Link>{' '}
            <small>{post.date}</small>
            <p>{post.description}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
