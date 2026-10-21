import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from 'next/server';
import {
  buildCapturePayload,
  classifyRequest,
  createEmissionBudget,
  type PendingCapture,
} from './lib/analytics/ai-traffic';
import { isLocalAnalyticsHost } from './lib/analytics/capture-gate';

/**
 * Observes AI crawlers and AI-answer-engine referrals on the Edge runtime.
 * Web-standard APIs only (`fetch`, `crypto`, `waitUntil`); no Node built-ins
 * and no posthog-js. Capture goes straight to PostHog, not through the
 * `/_/ingest` rewrite, which would make the deployment call itself.
 *
 * Dedupe and the emission budget live in module memory, so they are per Edge
 * isolate and best-effort.
 */
const seenCrawlerKeys = new Set<string>();
const emissionBudget = createEmissionBudget(Date.now());
const warned = new Set<string>();

function warnOnce(kind: string, error: unknown): void {
  if (warned.has(kind)) return;
  warned.add(kind);
  console.warn(`[middleware] ai-traffic capture failed (${kind})`, error);
}

/**
 * Sends one capture to PostHog with a 2 second timeout. Never throws; each
 * failure kind is warned about at most once.
 *
 * @param capture - The event to send.
 */
export async function sendToPostHog(capture: PendingCapture): Promise<void> {
  const token = process.env.NEXT_PUBLIC_POSTHOG_TOKEN?.trim();
  if (!token) return;

  try {
    const response = await fetch('https://us.i.posthog.com/i/v0/e/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        buildCapturePayload(capture, token, new Date().toISOString()),
      ),
      signal: AbortSignal.timeout(2000),
    });
    if (!response?.ok) warnOnce(`status-${response?.status}`, response?.status);
  } catch (error) {
    warnOnce(error instanceof Error ? error.name : 'unknown', error);
  }
}

/** Paths observed by the middleware, mirroring `config.matcher` below. */
const MATCHER_SOURCES = [
  '/((?!_|_next/static|_next/image|favicon\\.ico|og(?:/|$)|github-card(?:/|$)|.*opengraph-image(?:/|$)|.*twitter-image(?:/|$)|.*\\.[^/]*$).*)',
  '/llms.txt',
  '/llms-full.txt',
  '/sitemap.xml',
  '/robots.txt',
];
const MATCHERS = MATCHER_SOURCES.map((source) => new RegExp(`^${source}$`));

/**
 * Whether the middleware runs for `pathname`. A pure mirror of
 * `config.matcher`, which Next evaluates statically; a spec keeps them in
 * agreement.
 *
 * @param pathname - A URL pathname.
 */
export function matchesMiddlewarePath(pathname: string): boolean {
  return MATCHERS.some((matcher) => matcher.test(pathname));
}

/**
 * Classifies the request and, for AI crawlers and AI referrals, registers a
 * fire-and-forget capture with `event.waitUntil`. The response is never
 * delayed or altered.
 */
export function middleware(request: NextRequest, event: NextFetchEvent) {
  const response = NextResponse.next();

  try {
    if (
      process.env.NEXT_PUBLIC_POSTHOG_TOKEN &&
      (process.env.NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL === 'true' ||
        !isLocalAnalyticsHost(request.nextUrl.host))
    ) {
      const capture = classifyRequest({
        userAgent: request.headers.get('user-agent'),
        referrer: request.headers.get('referer'),
        // Pathname only: the query string can carry search terms.
        path: request.nextUrl.pathname,
        now: Date.now(),
        seen: seenCrawlerKeys,
        budget: emissionBudget,
      });
      if (capture) event.waitUntil(sendToPostHog(capture));
    }
  } catch {
    // Instrumentation must never break a page render.
  }

  return response;
}

/**
 * Routes observed: pages plus the files written for AI consumers. Excluded:
 * `/_` (PostHog proxy and growth routes, the only route handlers), `_next`
 * assets, `favicon.ico`, any path with a file extension, and the
 * extension-less image routes: `/og/*`, `/github-card`, and
 * `opengraph-image` / `twitter-image` (anchored to a segment boundary).
 * `/api` and `/api/[pkg]/[symbol]` are HTML API-reference pages and ARE seen.
 * Must stay literal: Next reads it statically.
 */
export const config = {
  matcher: [
    '/((?!_|_next/static|_next/image|favicon\\.ico|og(?:/|$)|github-card(?:/|$)|.*opengraph-image(?:/|$)|.*twitter-image(?:/|$)|.*\\.[^/]*$).*)',
    '/llms.txt',
    '/llms-full.txt',
    '/sitemap.xml',
    '/robots.txt',
  ],
};
