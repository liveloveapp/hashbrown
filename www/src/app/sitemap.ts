import type { MetadataRoute } from 'next';
import { listSymbolPages } from '../lib/api-reference';
import { listBlogPosts, listDocs, SDKS } from '../lib/content';
import { SITE_URL } from '../lib/site-metadata';

/**
 * `/sitemap.xml`: the home page, blog, privacy page, every docs page for both
 * SDKs, every blog post (dated by its publish date) and the API reference.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, lastModified?: string) => ({
    url: `${SITE_URL}${path}`,
    ...(lastModified ? { lastModified } : {}),
  });
  return [
    page('/'),
    page('/blog'),
    page('/privacy'),
    page('/api'),
    ...listBlogPosts().map((post) => page(`/blog/${post.slug}`, post.date)),
    ...SDKS.flatMap((sdk) =>
      listDocs(sdk).map((slug) => page(`/docs/${sdk}/${slug.join('/')}`)),
    ),
    ...listSymbolPages().map(({ pkg, symbol }) =>
      page(`/api/${pkg}/${symbol}`),
    ),
  ];
}
