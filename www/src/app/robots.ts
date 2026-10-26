import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/site-metadata';

/**
 * `/robots.txt`: crawl everything except the `/_/` route handlers (the
 * PostHog proxy, cron, forms and webhooks). `/api` is the HTML API reference,
 * not an API, so it stays crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/_/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
