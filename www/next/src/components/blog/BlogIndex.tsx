'use client';

import { useState } from 'react';
import { BLOG_FILTERS, filterPosts, toggleFilter } from './blog-filters';
import styles from './BlogIndex.module.css';
import { PostPreview, type PostSummary } from './PostPreview';

/**
 * The blog index: tag filters and the post grid, newest first, with the
 * first post featured. Ports `blog/index.page.ts`.
 *
 * @param props.posts - Every post, without bodies.
 */
export function BlogIndex({ posts }: { posts: readonly PostSummary[] }) {
  const [selected, setSelected] = useState(BLOG_FILTERS[0]);
  const visible = filterPosts(posts, selected);

  return (
    <div className={styles.host}>
      <div className={styles.bleed}>
        <div className={styles.filters}>
          {BLOG_FILTERS.map((filter) => (
            <button
              key={filter.query}
              type="button"
              className={filter === selected ? styles.selected : undefined}
              aria-pressed={filter === selected}
              onClick={() =>
                setSelected((current) => toggleFilter(current, filter))
              }
            >
              {filter.text}
            </button>
          ))}
        </div>
        <div className={styles.posts}>
          {visible.map((post, i) => (
            <PostPreview
              key={post.slug}
              post={post}
              size={i === 0 ? 'lg' : 'sm'}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
