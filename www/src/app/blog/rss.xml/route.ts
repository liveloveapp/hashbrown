import { listBlogPosts } from '../../../lib/content';
import { SITE_URL } from '../../../lib/site-metadata';

export const dynamic = 'force-static';

const CHANNEL_DESCRIPTION = 'Posts from the Hashbrown team.';

/** Escape the five XML special characters; nothing is wrapped in CDATA. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * `/blog/rss.xml`: an RSS 2.0 feed of every blog post, newest first, for
 * readers and syndication (for example the LiveLoveApp writing sync).
 */
export function GET(): Response {
  const items = listBlogPosts()
    .map((post) => {
      const url = `${SITE_URL}/blog/${post.slug}`;
      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid>${escapeXml(url)}</guid>`,
        `      <pubDate>${new Date(post.date + 'T00:00:00Z').toUTCString()}</pubDate>`,
        `      <description>${escapeXml(post.description)}</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Hashbrown blog</title>
    <link>${SITE_URL}/blog</link>
    <description>${CHANNEL_DESCRIPTION}</description>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}
