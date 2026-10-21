/**
 * Browser-safe website metadata shared by the collector and the server's
 * content catalog. Keep this file free of server-only imports.
 */

/** A coarse website content topic; mirrors the collection contract. */
export type WebsiteTopic =
  | 'getting_started'
  | 'concepts'
  | 'react'
  | 'angular'
  | 'platform'
  | 'reference'
  | 'blog'
  | 'other';

/**
 * Maps a site path to its coarse topic. The single source of truth for both
 * the browser collector and the server catalog.
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

/**
 * The content id a collector reports for a pathname: the pathname without its
 * leading slash and trailing slash, lowercased, `home` for `/`.
 *
 * @param pathname - A URL pathname.
 * @returns The id, or `undefined` when the pathname cannot be a valid id.
 */
export function contentIdFor(pathname: string): string | undefined {
  if (pathname === '/') return 'home';
  const id = pathname.replace(/^\/+/u, '').replace(/\/+$/u, '').toLowerCase();
  return /^[a-z0-9][a-z0-9_/-]{0,119}$/u.test(id) ? id : undefined;
}

/**
 * Acquisition properties for `website.session_started`.
 *
 * @param search - `location.search`.
 * @param referrer - `document.referrer`.
 * @returns Lowercased, validated `campaign*` tokens and `referrerHost`.
 */
export function acquisitionProperties(
  search: string,
  referrer: string,
): Record<string, string> {
  const properties: Record<string, string> = {};
  const params = new URLSearchParams(search.slice(0, 4096));
  for (const [parameter, key] of [
    ['utm_source', 'campaignSource'],
    ['utm_medium', 'campaignMedium'],
    ['utm_campaign', 'campaignName'],
  ] as const) {
    const token = params.get(parameter)?.trim().toLowerCase();
    if (token && /^[a-z0-9][a-z0-9_-]{0,119}$/u.test(token))
      properties[key] = token;
  }
  try {
    const url = new URL(referrer);
    const host = url.hostname.toLowerCase();
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      host.length <= 253 &&
      /^[a-z0-9.-]+$/u.test(host)
    )
      properties['referrerHost'] = host;
  } catch {
    // An absent or invalid referrer contributes nothing.
  }
  return properties;
}
