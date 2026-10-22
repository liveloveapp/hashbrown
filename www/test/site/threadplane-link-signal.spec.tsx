// @vitest-environment jsdom
import posthog from 'posthog-js';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { ThreadplaneBanner } from '../../src/components/home/ThreadplaneBanner';
import { Footer } from '../../src/components/site/Footer';
import { ThreadplaneLinkSignal } from '../../src/components/site/ThreadplaneLinkSignal';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), init: vi.fn() } }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Put server-rendered `html` on the page at `path` with the signal mounted,
 * from a clean slate. Call `unmount` in a `finally`.
 */
function page(
  path: string,
  html: string,
): { content: HTMLElement; unmount: () => void } {
  vi.mocked(posthog.capture).mockReset();
  window.history.replaceState(null, '', path);
  const content = document.createElement('div');
  content.innerHTML = html;
  // jsdom cannot navigate; stop link clicks after the signal has seen them.
  content.addEventListener('click', (event) => event.preventDefault());
  const signal = document.createElement('div');
  document.body.replaceChildren(content, signal);
  const root: Root = createRoot(signal);
  act(() => root.render(<ThreadplaneLinkSignal />));
  return {
    content,
    unmount: () => {
      act(() => root.unmount());
      document.body.replaceChildren();
    },
  };
}

function threadplaneClicks() {
  return vi
    .mocked(posthog.capture)
    .mock.calls.filter(([event]) => event === 'marketing:threadplane_cta_click')
    .map(([, props]) => props);
}

/** Dispatch a bubbling mouse event of `type` with `button` on `element`. */
function mouse(element: Element | null, type: string, button: number) {
  element?.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, button }),
  );
}

test('ThreadplaneBanner click tracks marketing:threadplane_cta_click with homepage_banner', () => {
  const { content, unmount } = page(
    '/',
    renderToStaticMarkup(<ThreadplaneBanner />),
  );
  try {
    content.querySelector<HTMLElement>('h2')?.click();

    expect(threadplaneClicks()).toEqual([
      {
        source_page: '/',
        surface: 'homepage_banner',
        destination_url: 'https://threadplane.ai/',
      },
    ]);
  } finally {
    unmount();
  }
});

test('Footer threadplane link tracks with footer', () => {
  const { content, unmount } = page('/', renderToStaticMarkup(<Footer />));
  try {
    content
      .querySelector<HTMLAnchorElement>('a[href*="threadplane.ai"]')
      ?.click();

    expect(threadplaneClicks()).toEqual([
      {
        source_page: '/',
        surface: 'footer',
        destination_url: 'https://threadplane.ai/',
      },
    ]);
  } finally {
    unmount();
  }
});

test('docs platforms page links track with docs_platforms', () => {
  const { content, unmount } = page(
    '/docs/react/start/platforms',
    '<p><a href="https://threadplane.ai/?utm_source=hashbrown&amp;utm_medium=docs">threadplane</a></p>',
  );
  try {
    content.querySelector<HTMLAnchorElement>('a')?.click();

    expect(threadplaneClicks()).toEqual([
      {
        source_page: '/docs/react/start/platforms',
        surface: 'docs_platforms',
        destination_url: 'https://threadplane.ai/',
      },
    ]);
  } finally {
    unmount();
  }
});

test('blog threadplane links track with blog, including www and deep links', () => {
  const { content, unmount } = page(
    '/blog/2026-10-08-hashbrown-v-0-7-0',
    '<a href="https://www.threadplane.ai/blog/threadplane-0-3-0">post</a>',
  );
  try {
    content.querySelector<HTMLAnchorElement>('a')?.click();

    expect(threadplaneClicks()).toEqual([
      {
        source_page: '/blog/2026-10-08-hashbrown-v-0-7-0',
        surface: 'blog',
        destination_url: 'https://www.threadplane.ai/blog/threadplane-0-3-0',
      },
    ]);
  } finally {
    unmount();
  }
});

test('a middle-click on the footer threadplane link tracks; a right-click does not', () => {
  const { content, unmount } = page('/', renderToStaticMarkup(<Footer />));
  try {
    const anchor = content.querySelector('a[href*="threadplane.ai"]');

    mouse(anchor, 'auxclick', 2);
    const afterRightClick = threadplaneClicks();
    mouse(anchor, 'auxclick', 1);

    expect(afterRightClick).toEqual([]);
    expect(threadplaneClicks()).toEqual([
      {
        source_page: '/',
        surface: 'footer',
        destination_url: 'https://threadplane.ai/',
      },
    ]);
  } finally {
    unmount();
  }
});

test('other links are not threadplane hand-offs', () => {
  const { content, unmount } = page(
    '/blog/post',
    '<a href="https://b4.run">b4</a><a href="https://threadplane.ai.evil.example">x</a><a href="/docs">docs</a>',
  );
  try {
    content.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => a.click());

    expect(threadplaneClicks()).toEqual([]);
  } finally {
    unmount();
  }
});
