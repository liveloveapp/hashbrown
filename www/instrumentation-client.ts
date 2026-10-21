import posthog, {
  type BeforeSendFn,
  type CaptureResult,
  type PostHogConfig,
} from 'posthog-js';
import { shouldCaptureAnalytics } from './src/lib/analytics/capture-gate';
// Type-only: brings in the `window.__hashbrownPreAnalytics` declaration without
// bundling the beacon, which app/layout.tsx already inlines into the HTML.
import type {} from './src/lib/analytics/pre-analytics-beacon';

const token = process.env.NEXT_PUBLIC_POSTHOG_TOKEN;
const captureLocal = process.env.NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL === 'true';
const browserHost =
  typeof window === 'undefined' ? undefined : window.location.host;

const URL_PROPERTIES = [
  '$current_url',
  '$referrer',
  '$initial_current_url',
  '$initial_referrer',
] as const;

function stripUrl(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const end = value.search(/[?#]/);
  return end === -1 ? value : value.slice(0, end);
}

function stripBag<T extends Record<string, unknown> | undefined>(bag: T): T {
  if (!bag) return bag;
  const next: Record<string, unknown> = { ...bag };
  for (const key of URL_PROPERTIES) {
    if (key in next) next[key] = stripUrl(next[key]);
  }
  return next as T;
}

/**
 * posthog-js `before_send` hook: removes the query string and hash from the
 * URL properties (`$current_url`, `$referrer`, and their `$initial_*`
 * counterparts under `$set_once`) so a link's parameters never reach PostHog.
 * Everything else is left untouched and the input is not mutated.
 *
 * @param event - The event about to be sent, or `null` if already dropped.
 * @returns The event with URL properties reduced to origin and path.
 */
export const stripUrlQuery: BeforeSendFn = (
  event: CaptureResult | null,
): CaptureResult | null => {
  if (!event) return event;
  return {
    ...event,
    properties: stripBag(event.properties),
    ...(event.$set_once ? { $set_once: stripBag(event.$set_once) } : {}),
  };
};

/**
 * Every option is stated, including ones that match a posthog-js default.
 *
 * PostHog decides a bounce with
 *   NOT (page_screen_count >= 2 OR has_autocapture OR session_duration >= 10s)
 * and `capture_pageview: true` stops the History API monitor from starting, so
 * soft navigations would emit no $pageview. `'history_change'` is the literal
 * posthog-js compares against.
 *
 * `defaults` is a version pin whose meaning changes when it is bumped. Writing
 * the values it implies down next to it turns the next bump into a decision
 * instead of a silent behaviour change. The spec asserts this whole object with
 * `toEqual`, so a changed, removed, or added key fails the suite.
 *
 * `disable_surveys` is set because posthog-js downloads the surveys extension
 * whenever the remote config arrives, whatever its value; only this client flag
 * is checked before that load.
 */
export const POSTHOG_INIT_OPTIONS = {
  api_host: '/_/ingest',
  ui_host: 'https://us.posthog.com',
  defaults: '2026-01-30',
  capture_pageview: 'history_change',
  capture_pageleave: 'if_capture_pageview',
  autocapture: true,
  capture_performance: { web_vitals: true },
  person_profiles: 'always',
  disable_surveys: true,
  before_send: stripUrlQuery,
} satisfies Partial<PostHogConfig>;

if (
  token &&
  shouldCaptureAnalytics({ token, captureLocal, host: browserHost })
) {
  posthog.init(token, POSTHOG_INIT_OPTIONS);
}

// Stand down the pre-analytics exit beacon inlined by app/layout.tsx. After
// init, posthog-js owns the session and flushes its own events on unload; when
// the gate above declines, PostHog never runs here and neither should the
// beacon. Either way the two must never both report one visit.
if (typeof window !== 'undefined') window.__hashbrownPreAnalytics?.disarm();
