/**
 * Pure classification helpers for AI crawler traffic and AI-answer-engine
 * referrals, used by the Edge middleware. Free of Next.js and Node imports so
 * it runs unchanged on the Edge runtime and in unit tests.
 *
 * AI crawlers never run JavaScript, so the client PostHog snippet cannot see
 * them; middleware is the only place to observe either signal. All dedupe and
 * budget state is held in module memory, so it is per Edge isolate and
 * best-effort: it trims duplicates and bounds abuse, it is not a global quota.
 */
import {
  type AnalyticsEventName,
  analyticsEvents,
  type AnalyticsProperties,
} from './events';

/**
 * User-agent tokens published by AI crawlers, matched case-insensitively as
 * substrings. Plain `Googlebot` and `Applebot` are search crawlers and are not
 * classified; only their AI variants are.
 */
const AI_CRAWLER_TOKENS = [
  // OpenAI
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  // Anthropic
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Google (AI-specific variants only)
  'Google-Extended',
  'Google-CloudVertexBot',
  // Apple (AI-training variant only)
  'Applebot-Extended',
  // ByteDance / Meta / Common Crawl
  'Bytespider',
  'Meta-ExternalAgent',
  'CCBot',
] as const;

/** Longest token first so a shorter token never shadows a more specific one. */
const CRAWLER_MATCHERS: ReadonlyArray<{ needle: string; slug: string }> = [
  ...AI_CRAWLER_TOKENS,
]
  .sort((a, b) => b.length - a.length)
  .map((token) => ({ needle: token.toLowerCase(), slug: token.toLowerCase() }));

/**
 * Hostnames of AI answer engines, matched on the parsed hostname exactly or as
 * a subdomain, never as a substring.
 */
const AI_REFERRER_HOSTS: ReadonlyArray<{ host: string; slug: string }> = [
  { host: 'chatgpt.com', slug: 'chatgpt' },
  { host: 'chat.openai.com', slug: 'chatgpt' },
  { host: 'perplexity.ai', slug: 'perplexity' },
  { host: 'claude.ai', slug: 'claude' },
  { host: 'gemini.google.com', slug: 'gemini' },
  { host: 'copilot.microsoft.com', slug: 'copilot' },
  { host: 'you.com', slug: 'you' },
];

/**
 * Identifies an AI crawler from a raw User-Agent header.
 *
 * @param userAgent - The `user-agent` header value.
 * @returns A stable slug, or `null` for anything else.
 */
export function classifyAiCrawler(
  userAgent: string | null | undefined,
): string | null {
  if (typeof userAgent !== 'string') return null;
  const ua = userAgent.trim().toLowerCase();
  if (!ua) return null;

  for (const { needle, slug } of CRAWLER_MATCHERS) {
    if (ua.includes(needle)) return slug;
  }
  return null;
}

/**
 * Identifies an AI answer engine from a raw Referer header.
 *
 * @param referrer - The `referer` header value.
 * @returns A stable slug, or `null` for anything else.
 */
export function classifyAiReferrer(
  referrer: string | null | undefined,
): string | null {
  if (typeof referrer !== 'string') return null;
  const value = referrer.trim();
  if (!value) return null;

  let hostname: string;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
  if (!hostname) return null;

  for (const { host, slug } of AI_REFERRER_HOSTS) {
    if (hostname === host || hostname.endsWith(`.${host}`)) return slug;
  }
  return null;
}

const CRAWLER_BUCKET_MS = 60 * 60 * 1000;
const CRAWLER_SEEN_MAX = 2000;

/**
 * Per-instance dedupe: one event per crawler, path and wall-clock hour. The
 * `seen` set is capped at 2000 keys; when full the oldest key is evicted.
 * Per Edge isolate and best-effort.
 *
 * @param input - The crawler slug, pathname, current time and the `seen` set,
 *   which is mutated.
 * @returns Whether an event should be emitted.
 */
export function shouldEmitCrawlerEvent({
  crawler,
  path,
  now,
  seen,
}: {
  crawler: string;
  path: string;
  now: number;
  seen: Set<string>;
}): boolean {
  const bucket = Math.floor(now / CRAWLER_BUCKET_MS);
  // JSON, not concatenation: a path may contain any delimiter.
  const key = JSON.stringify([bucket, crawler, path]);
  if (seen.has(key)) return false;
  if (seen.size >= CRAWLER_SEEN_MAX) {
    const oldest = seen.values().next();
    if (!oldest.done) seen.delete(oldest.value);
  }
  seen.add(key);
  return true;
}

/** Ceiling on total events one isolate emits per hour, across all types. */
export const EMISSION_BUCKET_CAPACITY = 500;
const EMISSION_REFILL_PER_MS = EMISSION_BUCKET_CAPACITY / CRAWLER_BUCKET_MS;

/** Token bucket state. */
export type EmissionBudget = { tokens: number; updatedAt: number };

/**
 * Creates a full emission budget.
 *
 * @param now - Epoch milliseconds the bucket starts at.
 */
export function createEmissionBudget(now = 0): EmissionBudget {
  return { tokens: EMISSION_BUCKET_CAPACITY, updatedAt: now };
}

/**
 * Takes one token from the bucket with lazy refill, mutating `budget`. Both
 * the crawler UA and the Referer are attacker-controlled, so this bounds what
 * a flood can cost. Per isolate, best-effort.
 *
 * @returns `false` once the budget is spent; the caller must drop the event.
 */
export function takeEmissionToken(
  budget: EmissionBudget,
  now: number,
): boolean {
  const elapsed = Math.max(0, now - budget.updatedAt);
  budget.tokens = Math.min(
    EMISSION_BUCKET_CAPACITY,
    budget.tokens + elapsed * EMISSION_REFILL_PER_MS,
  );
  budget.updatedAt = now;
  if (budget.tokens < 1) return false;
  budget.tokens -= 1;
  return true;
}

/** An event waiting to be sent to PostHog. */
export type PendingCapture = {
  event: AnalyticsEventName;
  distinctId: string;
  properties: AnalyticsProperties;
};

/** Replaces every email-shaped substring with `[email]`. */
function redactEmails(value: string): string {
  return value.replace(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    '[email]',
  );
}

/**
 * Classifies a request. Cheap and synchronous.
 *
 * @returns The event to capture, or `null` for ordinary traffic or when the
 *   dedupe or the emission budget declines.
 */
export function classifyRequest({
  userAgent,
  referrer,
  path,
  now,
  seen,
  budget,
}: {
  userAgent: string | null;
  referrer: string | null;
  path: string;
  now: number;
  seen: Set<string>;
  budget: EmissionBudget;
}): PendingCapture | null {
  const crawler = classifyAiCrawler(userAgent);
  if (crawler) {
    if (!shouldEmitCrawlerEvent({ crawler, path, now, seen })) return null;
    if (!takeEmissionToken(budget, now)) return null;
    return {
      event: analyticsEvents.marketingAiCrawlerVisit,
      distinctId: `ai_crawler:${crawler}`,
      properties: {
        ai_crawler: crawler,
        source_page: path,
        user_agent: redactEmails((userAgent ?? '').trim()).slice(0, 200),
      },
    };
  }

  const source = classifyAiReferrer(referrer);
  if (source) {
    if (!takeEmissionToken(budget, now)) return null;
    return {
      event: analyticsEvents.marketingAiReferralVisit,
      distinctId: `ai_referral:${source}`,
      // A human: no user agent, referrer URL or query string.
      properties: { ai_source: source, source_page: path },
    };
  }

  return null;
}

/**
 * The exact PostHog wire payload: anonymous (no person profile), no GeoIP
 * (`$ip: null`), tagged `hashbrown-website-middleware`.
 *
 * @param capture - The pending event.
 * @param apiKey - The PostHog project token.
 * @param timestamp - ISO timestamp.
 */
export function buildCapturePayload(
  capture: PendingCapture,
  apiKey: string,
  timestamp: string,
) {
  return {
    api_key: apiKey,
    event: capture.event,
    distinct_id: capture.distinctId,
    timestamp,
    properties: {
      ...capture.properties,
      $process_person_profile: false,
      $ip: null,
      $lib: 'hashbrown-website-middleware',
    },
  };
}
