import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import DocsPage from '../../src/app/docs/[sdk]/[...slug]/page';
import BlogPostPage from '../../src/app/blog/[slug]/page';
import { renderDocsMarkdown } from '../../src/components/docs-markdown';

// The real popover only mounts its content on hover. Rendering the content
// inline shows exactly which payload each trigger carries to the client.
vi.mock('../../src/components/api/SymbolPopover', () => ({
  SymbolPopover: ({
    reference,
    content,
    children,
  }: {
    reference: string;
    content: ReactNode;
    children: ReactNode;
  }) => (
    <span data-symbol-popover={reference}>
      {children}
      <span data-popover-content={reference}>{content}</span>
    </span>
  ),
}));

const payloads = (html: string) => [
  ...new Set(
    [...html.matchAll(/data-popover-content="([^"]+)"/g)].map(([, r]) => r),
  ),
];

test('a docs page wraps its symbol links in popover triggers', async () => {
  const params = Promise.resolve({ sdk: 'react', slug: ['start', 'quick'] });

  const html = renderToStaticMarkup(await DocsPage({ params }));

  expect(html).toMatch(
    /data-symbol-popover="@hashbrownai\/react!useChat:function"><a[^>]*href="\/api\/react\/useChat"/,
  );
});

test('a docs page ships popover content only for the symbols it references', async () => {
  const params = Promise.resolve({ sdk: 'react', slug: ['start', 'quick'] });

  const html = renderToStaticMarkup(await DocsPage({ params }));

  expect(payloads(html).sort()).toEqual([
    '@hashbrownai/react!HashbrownProvider:function',
    '@hashbrownai/react!UseChatResult:interface',
    '@hashbrownai/react!useChat:function',
  ]);
  expect(html).toContain('This React hook creates a chat instance');
});

test('popover content renders the symbol without nested popovers', async () => {
  const md = 'Use @hashbrownai/react!useChat:function here.';

  const html = renderToStaticMarkup(
    (await renderDocsMarkdown(md, 'react')).content,
  );

  expect(html).toMatch(/<h1[^>]*>useChat<\/h1>/);
  expect(html.match(/data-symbol-popover=/g)).toHaveLength(1);
});

test('private, external and unknown references get no popover', async () => {
  const md = [
    'Private @hashbrownai/core!~internal:function,',
    'external @angular/core!signal:function,',
    'unknown @hashbrownai/react!doesNotExist:function.',
  ].join(' ');

  const html = renderToStaticMarkup(
    (await renderDocsMarkdown(md, 'angular')).content,
  );

  expect(html).not.toContain('data-symbol-popover');
  expect(html).toContain('href="https://angular.dev/api/core/signal"');
  expect(html).toContain('href="/api/react/doesNotExist"');
  expect(html).toContain('Private ~internal,');
});

test('a blog post gets popovers for its symbol links', async () => {
  const params = Promise.resolve({ slug: '2025-09-05-hashbrown-v-0-3-0' });

  const html = renderToStaticMarkup(await BlogPostPage({ params }));

  expect(payloads(html).sort()).toEqual([
    '@hashbrownai/react!useStructuredChat:function',
    '@hashbrownai/react!useUiChat:function',
  ]);
});
