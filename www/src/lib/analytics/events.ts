/**
 * The website's closed analytics vocabulary: event names, the surfaces they
 * come from, and the properties they may carry. Names are
 * `namespace:snake_case` and properties are snake_case. Properties never carry
 * query strings, emails or code text.
 */

/** Every custom event the website sends to PostHog. */
export const analyticsEvents = {
  marketingCtaClick: 'marketing:cta_click',
  marketingThreadplaneCtaClick: 'marketing:threadplane_cta_click',
  marketingEngagedTime: 'marketing:engaged_time',
  marketingAiCrawlerVisit: 'marketing:ai_crawler_visit',
  marketingAiReferralVisit: 'marketing:ai_referral_visit',
  marketingPreAnalyticsExit: 'marketing:pre_analytics_exit',
  marketingUnstuckFormSubmit: 'marketing:unstuck_form_submit',
  marketingUnstuckFormSuccess: 'marketing:unstuck_form_success',
  marketingUnstuckFormFail: 'marketing:unstuck_form_fail',
  docsPageViewed: 'docs:page_viewed',
  docsCodeCopied: 'docs:code_copied',
} as const;

/** One of the event names in {@link analyticsEvents}. */
export type AnalyticsEventName =
  (typeof analyticsEvents)[keyof typeof analyticsEvents];

/** Where on the site a `marketing:cta_click` happened. */
export type AnalyticsSurface =
  'home' | 'nav' | 'footer' | 'docs' | 'blog' | 'unstuck';

/** Where a `marketing:threadplane_cta_click` hand-off link lives. */
export const threadplaneSurfaces = [
  'homepage_banner',
  'footer',
  'docs_platforms',
  'blog',
  'email',
] as const;

/** One of {@link threadplaneSurfaces}. */
export type ThreadplaneSurface = (typeof threadplaneSurfaces)[number];

/**
 * Stable identifiers for marketing CTAs. New CTAs are added here so a typo is
 * a build error rather than a new series in PostHog. The template members
 * cover ids derived at runtime.
 */
export type CtaId =
  | 'hero_quick_start'
  | 'closing_quick_start'
  | 'closing_github'
  | 'install_copy'
  | 'sdk_switch_react'
  | 'sdk_switch_angular'
  | 'copy_prompt'
  | `copy_${string}`
  | `nav_${string}`;

/** The framework a docs page belongs to. */
export type DocsFramework = 'react' | 'angular';

/** Properties an analytics event may carry. All snake_case. */
export type AnalyticsProperties = {
  /** Pathname of the page the event fired on; added by `track`. */
  source_page?: string;
  source_section?: string;
  /** Link target without query string or hash. */
  destination_url?: string;
  cta_id?: CtaId;
  surface?: AnalyticsSurface | ThreadplaneSurface;
  /** Visible seconds on a page (`marketing:engaged_time`): 10 or 30. */
  engaged_seconds?: number;
  /** Docs pathname (`docs:page_viewed`, `docs:code_copied`). */
  pathname?: string;
  framework?: DocsFramework;
  /** The code block's fence language, or `unknown`. */
  language?: string;
  error_reason?: string;
};

/**
 * The docs framework of a pathname, read only from `/docs/<sdk>/…`.
 *
 * @param pathname - A URL pathname.
 * @returns `react` or `angular`, or `undefined` outside the framework docs.
 */
export function docsFrameworkFromPath(
  pathname: string,
): DocsFramework | undefined {
  const match = /^\/docs\/(react|angular)(\/|$)/.exec(pathname);
  return match ? (match[1] as DocsFramework) : undefined;
}

/**
 * The threadplane hand-off surface for a link on `pathname` that carries no
 * explicit `data-surface`.
 *
 * @param pathname - The pathname of the page the link is on.
 * @returns The surface the link's `utm_medium` corresponds to.
 */
export function threadplaneSurfaceForPath(
  pathname: string,
): ThreadplaneSurface {
  if (/^\/docs\/(react|angular)\/start\/platforms\/?$/.test(pathname)) {
    return 'docs_platforms';
  }
  if (pathname === '/blog' || pathname.startsWith('/blog/')) {
    return 'blog';
  }
  if (pathname === '/') {
    return 'homepage_banner';
  }
  return 'footer';
}
