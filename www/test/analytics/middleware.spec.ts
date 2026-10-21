import { expect, test, vi } from 'vitest';
import {
  config,
  matchesMiddlewarePath,
  sendToPostHog,
} from '../../src/middleware';

const matchers = config.matcher.map((m) => new RegExp(`^${m}$`));
const staticMatch = (path: string) => matchers.some((re) => re.test(path));

const included = [
  '/',
  '/blog/x',
  '/docs/react/start/quick',
  '/llms.txt',
  '/llms-full.txt',
  '/sitemap.xml',
  '/robots.txt',
  '/my-opengraph-image-guide',
  '/blog/twitter-image-tips',
];
const excluded = [
  '/_/ingest/e',
  '/_/growth/events',
  '/api/leads',
  '/_next/static/chunk.js',
  '/_next/image',
  '/favicon.ico',
  '/opengraph-image',
  '/blog/my-post/opengraph-image',
  '/twitter-image',
  '/whitepapers/overview.pdf',
  '/some/script.js',
];

test('matcher excludes /_ paths, /api, _next and files with extensions', () => {
  const paths = [...included, ...excluded];

  const fn = paths.map((p) => matchesMiddlewarePath(p));
  const stat = paths.map((p) => staticMatch(p));

  expect(fn).toEqual(paths.map((p) => included.includes(p)));
  expect(stat).toEqual(fn);
});

test('sendToPostHog posts the payload with a timeout signal and swallows failures', async () => {
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_TOKEN', 'phc_test');
  const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetchMock);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  await sendToPostHog({
    event: 'marketing:ai_crawler_visit',
    distinctId: 'ai_crawler:gptbot',
    properties: { ai_crawler: 'gptbot', source_page: '/' },
  });

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://us.i.posthog.com/i/v0/e/');
  expect(init.method).toBe('POST');
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(init.body).api_key).toBe('phc_test');
  expect(warn).toHaveBeenCalledTimes(1);
});
