import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { docsComponents } from '../src/components/docs-components';
import { readDoc } from '../src/lib/content';
import { renderMarkdown } from '../src/lib/markdown';

const render = async (md: string) =>
  renderToStaticMarkup(
    (await renderMarkdown(md, docsComponents('react'))).content,
  );

test('renders hb-code-example as the CodeExample component around highlighted code', async () => {
  const md =
    '<hb-code-example header="terminal">\n\n```sh\nnpm i\n```\n\n</hb-code-example>';

  const html = await render(md);

  expect(html).toContain('data-component="code-example"');
  expect(html).toContain('terminal');
  expect(html).toContain('class="shiki hashbrown"');
});

test('resolves relative next-step links against the SDK', async () => {
  const md =
    '<hb-next-steps>\n  <hb-next-step link="concept/components">\n    <div><h4>Components</h4></div>\n  </hb-next-step>\n</hb-next-steps>';

  const html = await render(md);

  expect(html).toContain('href="/docs/react/concept/components"');
});

test('keeps absolute next-step links as they are', async () => {
  const md =
    '<hb-next-steps>\n  <hb-next-step link="/api/react/UseChatResult">\n    <div>x</div>\n  </hb-next-step>\n</hb-next-steps>';

  const html = await render(md);

  expect(html).toContain('href="/api/react/UseChatResult"');
});

test('renders canonical references as API links', async () => {
  const html = await render('Use @hashbrownai/react!useChat:function here.');

  expect(html).toContain('href="/api/react/useChat"');
  expect(html).toContain('>useChat</a>');
});

test('renders icon elements as SVGs', async () => {
  const html = await render('<hb-components></hb-components>');

  expect(html).toContain('<svg');
});

test('keeps HTML attributes such as class on plain elements', async () => {
  const html = await render('<p class="subtitle">Hello</p>');

  expect(html).toContain('<p class="subtitle">Hello</p>');
});

test('marks custom elements the spike has not ported', async () => {
  const html = await render('<hb-not-ported title="x">hi</hb-not-ported>');

  expect(html).toContain('data-unported="hb-not-ported"');
  expect(html).toContain('hi');
});

test('renders the full React quick start page without unported elements', async () => {
  const doc = readDoc('react', ['start', 'quick']);

  const html = renderToStaticMarkup(
    (await renderMarkdown(doc?.body ?? '', docsComponents('react'))).content,
  );

  expect(html).toContain('<h1');
  expect(html).not.toContain('data-unported');
  expect(html.match(/data-component="code-example"/g)?.length).toBe(7);
});

test('returns the page headings for the table of contents', async () => {
  const doc = readDoc('react', ['start', 'quick']);

  const { headings } = await renderMarkdown(
    doc?.body ?? '',
    docsComponents('react'),
  );

  expect(headings[0]).toEqual({ level: 1, text: 'React Quick Start', id: 'react-quick-start' });
  expect(headings.map((h) => h.id)).toContain('install');
});
