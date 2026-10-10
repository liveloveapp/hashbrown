import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Header } from '../../src/components/site/Header';
import { MobileMenuPanel } from '../../src/components/site/MobileMenu';
import {
  docsUrl,
  isActivePath,
  quickStartUrl,
  SEARCH_OVERLAY_OPEN_EVENT,
} from '../../src/components/site/links';

const hrefs = (html: string) =>
  [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((match) => match[1]);

test('header links match the Angular header for react', () => {
  const html = renderToStaticMarkup(<Header sdk="react" />);

  expect(hrefs(html)).toEqual([
    '/',
    '/docs/react/start/intro',
    '/api',
    'https://atc.hashbrown.dev',
    '/blog',
    'https://github.com/liveloveapp/hashbrown',
    '/docs/react/start/quick',
  ]);
});

test('the docs and quick start links follow the sdk prop', () => {
  const html = renderToStaticMarkup(<Header sdk="angular" />);

  expect(html).toContain('href="/docs/angular/start/intro"');
  expect(html).toContain('href="/docs/angular/start/quick"');
  expect(html).not.toContain('/docs/react/');
});

test('the header defaults to the angular sdk like ConfigService', () => {
  const html = renderToStaticMarkup(<Header />);

  expect(html).toContain('href="/docs/angular/start/intro"');
});

test('the header renders the nav labels and logo', () => {
  const html = renderToStaticMarkup(<Header sdk="react" />);

  expect(html).toContain('src="/image/logo/word-mark.svg"');
  expect(html).toContain('alt="hashbrown"');
  for (const label of ['docs', 'api', 'blog', 'Quick start']) {
    expect(html).toContain(`>${label}</a>`);
  }
  expect(html).not.toContain('>example</a>');
  expect(html).toContain('on GitHub');
});

test('the demo link opens the atc app in a new tab and says so', () => {
  const html = renderToStaticMarkup(<Header sdk="react" />);

  const demo =
    html.match(
      /<a [^>]*href="https:\/\/atc\.hashbrown\.dev"[^>]*>demo<\/a>/,
    )?.[0] ?? '';

  expect(demo).toContain('target="_blank"');
  expect(demo).toContain('rel="noopener"');
  expect(demo).toContain('aria-label="demo (opens in a new tab)"');
});

test('the search button has a name and keeps the shortcut hint', () => {
  const html = renderToStaticMarkup(<Header sdk="react" />);

  expect(html).toMatch(/<button[^>]*aria-label="Search"/);
  expect(html).toContain('<kbd');
  expect(html).toContain('>k</kbd>');
});

test('the search event name matches SearchOverlay', () => {
  const name = SEARCH_OVERLAY_OPEN_EVENT;

  expect(name).toBe('hashbrown:search-overlay:open');
});

test('the mobile menu button has an accessible name and starts closed', () => {
  const html = renderToStaticMarkup(<Header sdk="react" />);

  expect(html).toMatch(/<button[^>]*aria-label="Open menu"/);
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('role="dialog"');
});

test('the mobile menu panel links to the demo, blog and quick start', () => {
  const html = renderToStaticMarkup(
    <MobileMenuPanel
      id="menu"
      sdk="react"
      tab="docs"
      onTabChange={() => undefined}
      onClose={() => undefined}
      docsMenu={<p>docs menu</p>}
      apiMenu={<p>api menu</p>}
    />,
  );

  expect(html).toContain('role="dialog"');
  expect(html).toMatch(/<button[^>]*aria-label="Close menu"/);
  expect(html).not.toContain('href="/samples"');
  expect(html).toMatch(
    /<a [^>]*href="https:\/\/atc\.hashbrown\.dev"[^>]*target="_blank"[^>]*>demo<\/a>/,
  );
  expect(html).toContain('href="/blog"');
  expect(html).toContain('href="/docs/react/start/quick"');
  expect(html).toContain('docs menu');
  expect(html).toContain('aria-pressed="true"');
});

test('url helpers match the Angular ones', () => {
  const sdk = 'react' as const;

  const urls = [docsUrl(sdk), quickStartUrl(sdk)];

  expect(urls).toEqual(['/docs/react/start/intro', '/docs/react/start/quick']);
});

test('isActivePath matches the link and its children, like routerLinkActive', () => {
  const href = '/blog';

  const results = [
    isActivePath('/blog', href),
    isActivePath('/blog/post', href),
    isActivePath('/blogs', href),
    isActivePath(null, href),
  ];

  expect(results).toEqual([true, true, false, false]);
});
