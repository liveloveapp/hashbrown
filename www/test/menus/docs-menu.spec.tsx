import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { DocsMenu } from '../../src/components/menus/DocsMenu';
import {
  docsMenuSections,
  NON_DOCS_LINKS,
} from '../../src/components/menus/docs-menu.data';
import { isLinkActive } from '../../src/components/menus/is-link-active';
import {
  openSearchOverlay,
  SearchButton,
} from '../../src/components/menus/SearchButton';
import { SEARCH_OVERLAY_OPEN_EVENT } from '../../src/components/site/links';
import { sdkSwitchHref } from '../../src/components/menus/sdk-switch';
import { listDocs, type Sdk, SDKS } from '../../src/lib/content';

const docPaths = (sdk: Sdk) => listDocs(sdk).map((slug) => slug.join('/'));

test.each(SDKS)(
  'every %s docs-menu link resolves to an existing docs page',
  (sdk) => {
    const pages = new Set(docPaths(sdk).map((path) => `/docs/${sdk}/${path}`));
    const hrefs = docsMenuSections(sdk).flatMap((section) =>
      section.links.map((link) => link.href),
    );

    const broken = hrefs.filter(
      (href) => !pages.has(href) && !NON_DOCS_LINKS.includes(href),
    );

    expect(hrefs.length).toBeGreaterThanOrEqual(30);
    expect(broken).toEqual([]);
  },
);

test('keeps the Angular menu section order', () => {
  const sections = docsMenuSections('react');

  const titles = sections.map((section) => section.title);

  expect(titles).toEqual([
    'Getting Started',
    'Migrations',
    'Guide',
    'Recipes',
    'Platforms',
  ]);
});

test('shows the CopilotKit recipe only in the React menu', () => {
  const texts = (sdk: Sdk) =>
    docsMenuSections(sdk).flatMap((s) => s.links.map((l) => l.text));

  const react = texts('react');
  const angular = texts('angular');

  expect(react).toContain('CopilotKit');
  expect(angular).not.toContain('CopilotKit');
});

test('the SDK switcher links to the same page in the other SDK', () => {
  const angularDocs = docPaths('angular');

  const href = sdkSwitchHref(
    '/docs/react/concept/components',
    'angular',
    angularDocs,
  );

  expect(href).toBe('/docs/angular/concept/components');
});

test('the SDK switcher falls back to the intro when the other SDK has no counterpart', () => {
  const angularDocs = docPaths('angular');

  const href = sdkSwitchHref(
    '/docs/react/recipes/copilotkit',
    'angular',
    angularDocs,
  );

  expect(href).toBe('/docs/angular/start/intro');
});

test('the SDK switcher falls back to the intro outside the docs', () => {
  const reactDocs = docPaths('react');

  const hrefs = [
    sdkSwitchHref('/api/react/useChat', 'react', reactDocs),
    sdkSwitchHref('/docs/angular', 'react', reactDocs),
    sdkSwitchHref(null, 'react', reactDocs),
  ];

  expect(hrefs).toEqual([
    '/docs/react/start/intro',
    '/docs/react/start/intro',
    '/docs/react/start/intro',
  ]);
});

test('a menu link is active on its page and below it', () => {
  const href = '/docs/react/start/intro';

  const results = [
    isLinkActive('/docs/react/start/intro', href),
    isLinkActive('/docs/react/start/intro/more', href),
    isLinkActive('/docs/react/start/introduction', href),
    isLinkActive(null, href),
  ];

  expect(results).toEqual([true, true, false, false]);
});

test('renders every docs-menu link, the SDK switcher and the search trigger', () => {
  const sections = docsMenuSections('angular');

  const html = renderToStaticMarkup(<DocsMenu sdk="angular" />);

  for (const link of sections.flatMap((s) => s.links)) {
    expect(html).toContain(`href="${link.href}"`);
  }
  expect(html).toContain('aria-haspopup="menu"');
  expect(html).toContain('href="/docs/react/start/intro"');
  expect(html).toContain('Search');
});

test('the search trigger opens the search overlay', () => {
  const target = new EventTarget();
  const listener = vi.fn();
  target.addEventListener(SEARCH_OVERLAY_OPEN_EVENT, listener);
  vi.stubGlobal('window', target);
  const button = SearchButton();

  button.props.onClick();
  vi.unstubAllGlobals();

  expect(SEARCH_OVERLAY_OPEN_EVENT).toBe('hashbrown:search-overlay:open');
  expect(button.props.onClick).toBe(openSearchOverlay);
  expect(listener).toHaveBeenCalledOnce();
  expect(listener.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
});
