import { expect, test } from 'vitest';
import {
  analyticsEvents,
  docsFrameworkFromPath,
  threadplaneSurfaceForPath,
} from '../../src/lib/analytics/events';
import { PRE_ANALYTICS_EVENT } from '../../src/lib/analytics/pre-analytics-beacon';

test('every event name matches ^(\\$pageview|(marketing|docs):[a-z_]+)$', () => {
  const names = Object.values(analyticsEvents);

  const invalid = names.filter(
    (name) => !/^(\$pageview|(marketing|docs):[a-z_]+)$/.test(name),
  );

  expect(invalid).toEqual([]);
  expect(names).toHaveLength(11);
});

test('the event names are the closed set in the plan', () => {
  const events = analyticsEvents;

  const result = { ...events };

  expect(result).toEqual({
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
  });
});

test('the pre-analytics beacon sends the declared event name', () => {
  const declared = analyticsEvents.marketingPreAnalyticsExit;

  const beacon = PRE_ANALYTICS_EVENT;

  expect(beacon).toBe(declared);
});

test('docs framework comes only from /docs/<sdk>/ paths', () => {
  const paths = [
    '/docs/react/start/intro',
    '/docs/angular',
    '/api/react/useChat',
    '/blog/angular-and-react',
    '/docs/vue/start',
  ];

  const result = paths.map(docsFrameworkFromPath);

  expect(result).toEqual(['react', 'angular', undefined, undefined, undefined]);
});

test('threadplane surface follows the page the link is on', () => {
  const paths = [
    '/docs/react/start/platforms',
    '/docs/angular/start/platforms',
    '/docs/react/start/intro',
    '/blog/2026-10-08-hashbrown-v-0-7-0',
    '/',
  ];

  const result = paths.map(threadplaneSurfaceForPath);

  expect(result).toEqual([
    'docs_platforms',
    'docs_platforms',
    'footer',
    'blog',
    'homepage_banner',
  ]);
});
