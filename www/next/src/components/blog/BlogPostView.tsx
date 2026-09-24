import type { ReactNode } from 'react';
import { formatPostDate } from './post-date';
import type { PostSummary } from './PostPreview';
import styles from './BlogPostView.module.css';
import { TeamAvatars } from './TeamAvatars';
import { Youtube } from './Youtube';

/**
 * A blog post: title, date and team byline, the YouTube embed for posts that
 * have one, and the rendered markdown body with the blog's typography.
 * Ports `blog/[slug].page.ts`.
 *
 * @param props.post - The post's frontmatter fields.
 * @param props.children - The rendered markdown body.
 */
export function BlogPostView({
  post,
  children,
}: {
  post: PostSummary;
  children: ReactNode;
}) {
  return (
    <div className={styles.host}>
      <div className={styles.bleed}>
        <div className={styles.title}>
          <h1>{post.title}</h1>
          <time dateTime={post.date}>{formatPostDate(post.date)}</time>
          <TeamAvatars team={post.team} />
        </div>

        {post.youtube ? (
          <Youtube src={post.youtube} title={post.title} />
        ) : null}

        <article>
          <div className={styles.markdown}>{children}</div>
        </article>
      </div>
    </div>
  );
}
