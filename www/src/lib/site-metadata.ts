import type { Metadata } from 'next';

/** The site's origin, used for absolute URLs outside `metadata`. */
export const SITE_URL = 'https://hashbrown.dev';

/**
 * Suffix for page titles that don't name Hashbrown themselves (blog posts),
 * in the `<page>: Hashbrown` form the branded titles already use.
 */
export const SITE_TITLE_TEMPLATE = '%s: Hashbrown';

/**
 * The root card route, for pages whose folder has no card of their own.
 * Resolved against `metadataBase`.
 */
export const DEFAULT_CARD_IMAGE = '/opengraph-image';

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
  /** Alt text for `image`. */
  imageAlt?: string;
  /** ISO date for articles (blog posts). */
  publishedTime?: string;
  /** The page's own path, e.g. `/blog/my-post`; becomes the canonical URL. */
  path?: string;
}

// "Tool Calling: Hashbrown React Docs", "Privacy: Hashbrown", or the home
// page's "Hashbrown: …" already carry the brand.
const BRANDED_TITLE = /(^Hashbrown:|: Hashbrown\b)/;

/**
 * Build a page's metadata so the document title, description and Open Graph
 * fields come from one source, as each Analog `routeMeta` did. Next replaces
 * a parent's `openGraph` wholesale, so the site-wide fields are repeated here.
 * Titles that already name Hashbrown skip {@link SITE_TITLE_TEMPLATE}.
 *
 * @param input - The page's title, description, path, and optional image,
 *   image alt text and date.
 */
export function pageMetadata(input: PageMetadataInput): Metadata {
  const image =
    input.image && input.imageAlt
      ? { url: input.image, alt: input.imageAlt }
      : input.image;
  const images = image ? { images: [image] } : {};
  const alternates = input.path
    ? { alternates: { canonical: input.path } }
    : {};
  return {
    title: BRANDED_TITLE.test(input.title)
      ? { absolute: input.title }
      : input.title,
    description: input.description,
    ...alternates,
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
