import Link from 'next/link';
import { listBlogPosts } from '../../lib/content';
import { formatPostDate, selectLatestPosts } from './latest-posts';
import styles from './LatestPosts.module.css';

/** "From the blog": the three newest posts, read at build time. */
export function LatestPosts() {
  const posts = selectLatestPosts(listBlogPosts(), 3);

  return (
    <div className={styles.section}>
      <h2>From the blog</h2>
      <div className={styles.posts}>
        {posts.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`}>
            <small>{formatPostDate(post.date)}</small>
            <h3>{post.title}</h3>
          </Link>
        ))}
      </div>
    </div>
  );
}
