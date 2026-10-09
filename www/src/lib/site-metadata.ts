import type { Metadata } from 'next';

/** Site-wide Open Graph fields from the Analog `index.html`. */
export const SITE_OPEN_GRAPH = {
  siteName: 'Hashbrown: The TypeScript Framework for Generative UI',
  locale: 'en_US',
} as const;

/** Inputs for {@link pageMetadata}. */
export interface PageMetadataInput {
  title: string;
  description?: string;
  /** Open Graph image URL (absolute, or relative to `metadataBase`); omitted, Next uses the route's opengraph-image. */
  image?: string;
  /** ISO date for articles (blog posts). */
  publishedTime?: string;
}

/**
 * Build a page's metadata so the document title, description and Open Graph
 * fields come from one source, as each Analog `routeMeta` did. Next replaces
 * a parent's `openGraph` wholesale, so the site-wide fields are repeated here.
 *
 * @param input - The page's title, description and optional image and date.
 */
export function pageMetadata(input: PageMetadataInput): Metadata {
  const images = input.image ? { images: [input.image] } : {};
  return {
    title: input.title,
    description: input.description,
    openGraph: input.publishedTime
      ? {
          ...SITE_OPEN_GRAPH,
          type: 'article',
          title: input.title,
          description: input.description,
          ...images,
          publishedTime: input.publishedTime,
        }
      : {
          ...SITE_OPEN_GRAPH,
          type: 'website',
          title: input.title,
          description: input.description,
          ...images,
        },
  };
}
