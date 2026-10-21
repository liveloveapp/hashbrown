import type { WEBSITE_TOPICS } from '@hashbrownai-internal/growth';

import { listBlogPosts } from '../content';
import { listApiReferenceEntries, listSitemapEntries } from '../search-index';

/** A coarse website content topic from the collection contract. */
export type WebsiteTopic = (typeof WEBSITE_TOPICS)[number];

/** One known page: the id a collector reports for it and its topic. */
export interface WebsiteContent {
  contentId: string;
  topic: WebsiteTopic;
}

/** Known pages keyed by their site path. */
export type WebsiteCatalog = Readonly<Record<string, WebsiteContent>>;

/**
 * Maps a site path to its coarse topic.
 *
 * @param path - A site path such as `/docs/react/concept/components`.
 * @returns The topic a `website.content_viewed` event must report.
 */
export function websiteTopic(path: string): WebsiteTopic {
  if (path === '/' || path === '/docs') return 'getting_started';
  const docs = /^\/docs\/(react|angular)\/([^/]+)\//u.exec(path);
  if (docs) {
    const [, sdk, section] = docs;
    if (section === 'start') return 'getting_started';
    if (section === 'concept') return 'concepts';
    if (section === 'platform') return 'platform';
    return sdk === 'react' ? 'react' : 'angular';
  }
  if (path === '/api' || path.startsWith('/api/')) return 'reference';
  if (path === '/blog' || path.startsWith('/blog/')) return 'blog';
  return 'other';
}

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
