// @vitest-environment jsdom
import posthog from 'posthog-js';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ThreadplaneBanner } from '../../src/components/home/ThreadplaneBanner';
import { Footer } from '../../src/components/site/Footer';
import { ThreadplaneLinkSignal } from '../../src/components/site/ThreadplaneLinkSignal';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), init: vi.fn() } }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Root[] = [];

afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
  vi.mocked(posthog.capture).mockReset();
  window.history.replaceState(null, '', '/');
  document.body.replaceChildren();
});

/** Put server-rendered `html` on the page at `path` with the signal mounted. */
function page(path: string, html: string): HTMLElement {
  window.history.replaceState(null, '', path);
  const content = document.createElement('div');
  content.innerHTML = html;
  // jsdom cannot navigate; stop link clicks after the signal has seen them.
  content.addEventListener('click', (event) => event.preventDefault());
  const signal = document.createElement('div');
  document.body.replaceChildren(content, signal);
  const root = createRoot(signal);
  mounted.push(root);
  act(() => root.render(<ThreadplaneLinkSignal />));
  return content;
}

function threadplaneClicks() {
  return vi
    .mocked(posthog.capture)
    .mock.calls.filter(([event]) => event === 'marketing:threadplane_cta_click')
    .map(([, props]) => props);
}

test('ThreadplaneBanner click tracks marketing:threadplane_cta_click with homepage_banner', () => {
  const content = page('/', renderToStaticMarkup(<ThreadplaneBanner />));

  content.querySelector<HTMLElement>('h2')?.click();

  expect(threadplaneClicks()).toEqual([
    {
      source_page: '/',
      surface: 'homepage_banner',
      destination_url: 'https://threadplane.ai/',
    },
  ]);
});

test('Footer threadplane link tracks with footer; docs platforms page with docs_platforms', () => {
  const footer = page('/', renderToStaticMarkup(<Footer />));
  footer.querySelector<HTMLAnchorElement>('a[href*="threadplane.ai"]')?.click();
  const docs = page(
    '/docs/react/start/platforms',
    '<p><a href="https://threadplane.ai/?utm_source=hashbrown&amp;utm_medium=docs">threadplane</a></p>',
  );

  docs.querySelector<HTMLAnchorElement>('a')?.click();

  expect(threadplaneClicks()).toEqual([
    {
      source_page: '/',
      surface: 'footer',
      destination_url: 'https://threadplane.ai/',
    },
    {
      source_page: '/docs/react/start/platforms',
      surface: 'docs_platforms',
      destination_url: 'https://threadplane.ai/',
    },
  ]);
});

test('blog threadplane links track with blog, including www and deep links', () => {
  const content = page(
    '/blog/2026-10-08-hashbrown-v-0-7-0',
    '<a href="https://www.threadplane.ai/blog/threadplane-0-3-0">post</a>',
  );

  content.querySelector<HTMLAnchorElement>('a')?.click();

  expect(threadplaneClicks()).toEqual([
    {
      source_page: '/blog/2026-10-08-hashbrown-v-0-7-0',
      surface: 'blog',
      destination_url: 'https://www.threadplane.ai/blog/threadplane-0-3-0',
    },
  ]);
});

test('other links are not threadplane hand-offs', () => {
  const content = page(
    '/blog/post',
    '<a href="https://b4.run">b4</a><a href="https://threadplane.ai.evil.example">x</a><a href="/docs">docs</a>',
  );

  content.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => a.click());

  expect(threadplaneClicks()).toEqual([]);
});
