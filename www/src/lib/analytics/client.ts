'use client';

import posthog from 'posthog-js';
import {
  type AnalyticsEventName,
  analyticsEvents,
  type AnalyticsProperties,
  type AnalyticsSurface,
  type CtaId,
  type DocsFramework,
  type ThreadplaneSurface,
} from './events';

/**
 * The pathname of `href`, never its query string or hash, which can carry
 * anything a link put there.
 *
 * @param href - An absolute URL.
 * @returns The pathname, or `/` when `href` does not parse.
 */
export function getSourcePage(href: string): string {
  try {
    return new URL(href).pathname;
  } catch {
    return '/';
  }
}

/** `url` without its query string or hash; `undefined` when it does not parse. */
function withoutQuery(url: string): string | undefined {
  try {
    const parsed = new URL(url, 'https://hashbrown.dev');
    const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(url);
    return isRelative ? parsed.pathname : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return undefined;
  }
}

/**
 * Send an analytics event with `source_page` added. A no-op on the server;
 * capture failures are logged and never thrown.
 *
 * @param event - One of the declared event names.
 * @param properties - The event's properties.
 */
export function track(
  event: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): void {
  if (typeof window === 'undefined') return;

  try {
    posthog.capture(event, {
      source_page: getSourcePage(window.location.href),
      ...properties,
    });
  } catch (err) {
    console.error('[posthog] client capture failed:', err);
  }
}

/**
 * Track a `marketing:cta_click`.
 *
 * @param props.cta_id - The CTA's stable id.
 * @param props.surface - Where the CTA is.
 * @param props.destination_url - Where it leads; query and hash are dropped.
 */
export function trackCtaClick({
  cta_id,
  surface,
  destination_url,
}: {
  cta_id: CtaId;
  surface: AnalyticsSurface;
  destination_url?: string;
}): void {
  const destination = destination_url && withoutQuery(destination_url);
  track(analyticsEvents.marketingCtaClick, {
    cta_id,
    surface,
    ...(destination ? { destination_url: destination } : {}),
  });
}

/**
 * Track a `marketing:threadplane_cta_click` hand-off.
 *
 * @param props.surface - Where the threadplane link is.
 * @param props.destination_url - The link target; query and hash are dropped.
 */
export function trackThreadplaneCtaClick({
  surface,
  destination_url,
}: {
  surface: ThreadplaneSurface;
  destination_url: string;
}): void {
  const destination = withoutQuery(destination_url);
  track(analyticsEvents.marketingThreadplaneCtaClick, {
    surface,
    ...(destination ? { destination_url: destination } : {}),
  });
}

/**
 * Track `marketing:engaged_time`. `engaged_seconds` is visible time only.
 *
 * @param engaged_seconds - The threshold crossed, in seconds.
 */
export function trackEngagedTime(engaged_seconds: number): void {
  track(analyticsEvents.marketingEngagedTime, { engaged_seconds });
}

/**
 * Track `docs:page_viewed`.
 *
 * @param props.pathname - The docs pathname.
 * @param props.framework - The docs framework.
 */
export function trackDocsPageViewed({
  pathname,
  framework,
}: {
  pathname: string;
  framework: DocsFramework;
}): void {
  track(analyticsEvents.docsPageViewed, { pathname, framework });
}

/**
 * Track `docs:code_copied`. The copied code itself is never sent.
 *
 * @param props.pathname - The docs pathname.
 * @param props.framework - The docs framework.
 * @param props.language - The code block's language, or `unknown`.
 */
export function trackDocsCodeCopied({
  pathname,
  framework,
  language,
}: {
  pathname: string;
  framework: DocsFramework;
  language: string;
}): void {
  track(analyticsEvents.docsCodeCopied, { pathname, framework, language });
}
