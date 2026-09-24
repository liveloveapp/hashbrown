import Link from 'next/link';
import type { BlogPost } from '../../lib/content';
import { formatPostDate } from './post-date';
import styles from './PostPreview.module.css';
import { TeamAvatars } from './TeamAvatars';

/** The post fields a preview card shows (everything but the body). */
export type PostSummary = Omit<BlogPost, 'body'>;

/**
 * Drop a post's markdown body so only the preview fields reach the client.
 *
 * @param post - A full blog post.
 */
export function toPostSummary(post: BlogPost): PostSummary {
  const { slug, title, description, date, tags, ogImage, team, youtube } = post;
  return { slug, title, description, date, tags, ogImage, team, youtube };
}

/** Tabler "brand-youtube" icon, from the Angular `www-brand-youtube`. */
function BrandYoutubeIcon() {
  return (
    <span className={styles.youtube} data-icon="brand-youtube">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ height: '24px', width: '24px' }}
        aria-label="Video"
        role="img"
      >
        <path d="M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4v-8z" />
        <path d="M10 9l5 3l-5 3z" />
      </svg>
    </span>
  );
}

/**
 * A blog post card: title, date, description, team and a video marker.
 * Ports the Angular `www-post-preview`.
 *
 * @param props.post - The post to preview.
 * @param props.size - `lg` for the featured (first) post, `sm` otherwise.
 */
export function PostPreview({
  post,
  size = 'sm',
}: {
  post: PostSummary;
  size?: 'sm' | 'lg';
}) {
  return (
    <div className={styles.host} data-size={size}>
      <Link className={styles.link} href={`/blog/${post.slug}`}>
        <div className={styles.title}>
          <h2>{post.title}</h2>
          <time dateTime={post.date}>{formatPostDate(post.date)}</time>
        </div>
        <div className={styles.description}>
          <p>{post.description}</p>
          <div className={styles.spacer}></div>
          <div className={styles.footer}>
            <TeamAvatars team={post.team} />
            <div>{post.youtube ? <BrandYoutubeIcon /> : null}</div>
          </div>
        </div>
      </Link>
    </div>
  );
}
