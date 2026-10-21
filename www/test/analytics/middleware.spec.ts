import { NextResponse } from 'next/server';
import { expect, test, vi } from 'vitest';
import {
  config,
  matchesMiddlewarePath,
  middleware,
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
  '/api',
  '/api/core/chatResource',
  '/other',
  '/blog/og-images',
  '/docs/react/og',
];
const excluded = [
  '/_/ingest/e',
  '/_/growth/events',
  '/og/docs/react/start/quick',
  '/github-card',
  '/_next/static/chunk.js',
  '/_next/image',
  '/favicon.ico',
  '/opengraph-image',
  '/blog/my-post/opengraph-image',
  '/twitter-image',
  '/whitepapers/overview.pdf',
  '/some/script.js',
];

test('matcher excludes /_ paths, _next, image routes and files with extensions', () => {
  const paths = [...included, ...excluded];

  const fn = paths.map((p) => matchesMiddlewarePath(p));
  const stat = paths.map((p) => staticMatch(p));

  expect(fn).toEqual(paths.map((p) => included.includes(p)));
  expect(stat).toEqual(fn);
});

test('sendToPostHog posts the payload with a timeout signal and swallows failures', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_TOKEN', 'phc_test');
  vi.stubGlobal('fetch', fetchMock);

  try {
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
  } finally {
    warn.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

function requestFor(userAgent: string, path = '/docs') {
  return {
    headers: new Headers({ 'user-agent': userAgent }),
    nextUrl: { host: 'hashbrown.dev', pathname: path },
  } as never;
}

test('middleware without a token returns a response and never calls waitUntil', () => {
  const event = { waitUntil: vi.fn() };
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_TOKEN', '');

  try {
    const response = middleware(requestFor('GPTBot/1.2'), event as never);

    expect(response).toBeInstanceOf(NextResponse);
    expect(event.waitUntil).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});

test('middleware registers one waitUntil for a crawler and returns before it resolves', () => {
  const event = { waitUntil: vi.fn() };
  const fetchMock = vi.fn().mockReturnValue(new Promise(() => undefined));
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_TOKEN', 'phc_test');
  vi.stubGlobal('fetch', fetchMock);

  try {
    const response = middleware(
      requestFor('Mozilla/5.0 (compatible; ClaudeBot/1.0)', '/unique-path'),
      event as never,
    );

    expect(response).toBeInstanceOf(NextResponse);
    expect(event.waitUntil).toHaveBeenCalledTimes(1);
    expect(event.waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
