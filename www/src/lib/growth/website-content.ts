import { listBlogPosts } from '../content';
import { listApiReferenceEntries, listSitemapEntries } from '../search-index';
import { type WebsiteTopic, websiteTopic } from './website-metadata';

export type { WebsiteTopic };

/** One known page: the id a collector reports for it and its topic. */
export interface WebsiteContent {
  contentId: string;
  topic: WebsiteTopic;
}

/** Known pages keyed by their site path. */
export type WebsiteCatalog = Readonly<Record<string, WebsiteContent>>;

let cached: WebsiteCatalog | undefined;

/**
 * The pages a website collector may report: the home page, the docs, API
 * reference, and blog index pages, every docs page, every API reference page,
 * and every blog post. Built once and memoized.
 */
export function websiteContentCatalog(): WebsiteCatalog {
  if (cached) return cached;
  const catalog: Record<string, WebsiteContent> = {};
  const add = (path: string) => {
    const contentId = path === '/' ? 'home' : path.slice(1).toLowerCase();
    if (/^[a-z0-9][a-z0-9_/-]{0,119}$/u.test(contentId))
      catalog[path] = { contentId, topic: websiteTopic(path) };
  };
  add('/');
  add('/docs');
  add('/api');
  add('/blog');
  for (const entry of listSitemapEntries()) add(entry.url);
  for (const entry of listApiReferenceEntries()) add(entry.url);
  for (const post of listBlogPosts()) add(`/blog/${post.slug}`);
  cached = Object.freeze(catalog);
  return cached;
}

/**
 * Whether a reported content id names a known page with that page's topic.
 *
 * @param contentId - The id the collector reported.
 * @param topic - The topic the collector reported.
 */
export function isKnownWebsiteContent(
  contentId: string,
  topic: string,
): boolean {
  return Object.values(websiteContentCatalog()).some(
    (content) => content.contentId === contentId && content.topic === topic,
  );
}
