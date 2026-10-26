import type { BlogPost } from './content';
import { SITE_URL } from './site-metadata';

/** Display names for the team ids blog posts list in `team` frontmatter. */
export const TEAM_NAMES: Readonly<Record<string, string>> = {
  brian: 'Brian Love',
  mike: 'Mike Ryan',
};

const PUBLISHER = {
  '@type': 'Organization',
  name: 'Hashbrown',
  url: SITE_URL,
} as const;

/** A schema.org `BlogPosting`, as JSON-LD. */
export interface BlogPostingJsonLd {
  '@context': 'https://schema.org';
  '@type': 'BlogPosting';
  headline: string;
  description: string;
  datePublished: string;
  url: string;
  mainEntityOfPage: string;
  image: string;
  author: readonly { '@type': string; name: string; url?: string }[];
  publisher: typeof PUBLISHER;
}

/**
 * Describe a blog post as a schema.org `BlogPosting`. The image is the post's
 * frontmatter `ogImage`, or else its `opengraph-image` card route, matching the
 * Open Graph image. Posts without a team are authored by the publisher.
 *
 * @param post - The post's metadata (the body is not needed).
 */
export function blogPostingJsonLd(
  post: Omit<BlogPost, 'body'>,
): BlogPostingJsonLd {
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    url,
    mainEntityOfPage: url,
    image: post.ogImage ?? `${url}/opengraph-image`,
    author:
      post.team.length > 0
        ? post.team.map((id) => ({
            '@type': 'Person',
            name: TEAM_NAMES[id] ?? id,
          }))
        : [PUBLISHER],
    publisher: PUBLISHER,
  };
}

/**
 * Serialize JSON-LD for an inline `<script type="application/ld+json">`,
 * escaping `<` so frontmatter text can't close the script element.
 *
 * @param data - The JSON-LD object.
 */
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
