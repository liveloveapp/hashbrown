// @vitest-environment jsdom
import posthog from 'posthog-js';
import { afterEach, expect, test, vi } from 'vitest';
import {
  getSourcePage,
  track,
  trackCtaClick,
  trackDocsCodeCopied,
  trackDocsPageViewed,
  trackEngagedTime,
  trackThreadplaneCtaClick,
} from '../../src/lib/analytics/client';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), init: vi.fn() } }));

afterEach(() => {
  vi.mocked(posthog.capture).mockReset();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

test('getSourcePage keeps the pathname only', () => {
  const href = 'https://hashbrown.dev/docs/react/start/intro?email=a@b.co#x';

  const result = getSourcePage(href);

  expect(result).toBe('/docs/react/start/intro');
});

test('track adds source_page as the pathname only and swallows capture errors', () => {
  window.history.replaceState(null, '', '/blog/post?utm_source=x#top');
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
    // Silence the expected log.
  });
  const failure = new Error('boom');
  vi.mocked(posthog.capture)
    .mockImplementationOnce(() => undefined)
    .mockImplementationOnce(() => {
      throw failure;
    });

  track('marketing:cta_click', { cta_id: 'hero_quick_start', surface: 'home' });
  const second = () => track('marketing:engaged_time', { engaged_seconds: 10 });

  expect(second).not.toThrow();
  expect(posthog.capture).toHaveBeenNthCalledWith(1, 'marketing:cta_click', {
    source_page: '/blog/post',
    cta_id: 'hero_quick_start',
    surface: 'home',
  });
  expect(consoleError).toHaveBeenCalledWith(
    '[posthog] client capture failed:',
    failure,
  );
});

test('trackCtaClick sends cta_click with the id and surface', () => {
  const props = { cta_id: 'install_copy', surface: 'home' } as const;

  trackCtaClick(props);

  expect(posthog.capture).toHaveBeenCalledWith('marketing:cta_click', {
    source_page: '/',
    ...props,
  });
});

test('trackThreadplaneCtaClick sends surface and destination_url', () => {
  const destination =
    'https://threadplane.ai/?utm_source=hashbrown&utm_medium=footer';

  trackThreadplaneCtaClick({ surface: 'footer', destination_url: destination });

  expect(posthog.capture).toHaveBeenCalledWith(
    'marketing:threadplane_cta_click',
    {
      source_page: '/',
      surface: 'footer',
      destination_url: 'https://threadplane.ai/',
    },
  );
});

test('engaged time, page viewed and code copied carry their properties', () => {
  window.history.replaceState(null, '', '/docs/angular/start/intro');

  trackEngagedTime(30);
  trackDocsPageViewed({
    pathname: '/docs/angular/start/intro',
    framework: 'angular',
  });
  trackDocsCodeCopied({
    pathname: '/docs/angular/start/intro',
    framework: 'angular',
    language: 'unknown',
  });

  const source_page = '/docs/angular/start/intro';
  expect(vi.mocked(posthog.capture).mock.calls).toEqual([
    ['marketing:engaged_time', { source_page, engaged_seconds: 30 }],
    [
      'docs:page_viewed',
      { source_page, pathname: source_page, framework: 'angular' },
    ],
    [
      'docs:code_copied',
      {
        source_page,
        pathname: source_page,
        framework: 'angular',
        language: 'unknown',
      },
    ],
  ]);
});
