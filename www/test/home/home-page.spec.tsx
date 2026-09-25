import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import HomePage, { metadata } from '../../src/app/page';
import { listBlogPosts } from '../../src/lib/content';
import { pageMetadata } from '../../src/lib/site-metadata';

const render = async () => renderToStaticMarkup(await HomePage());

const hrefs = (html: string) =>
  [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((match) => match[1]);

test('takes its metadata from the Angular routeMeta', () => {
  const expected = pageMetadata({
    title: 'Hashbrown: AI chat and agents for React and Angular',
    description:
      'Hashbrown is a headless TypeScript framework for AI chat and agents in React and Angular: generative UI from your own components, client-side tools, and streaming structured output from any model.',
  });

  const result = metadata;

  expect(result).toEqual(expected);
});

test('renders the hero copy and actions', async () => {
  const html = await render();

  expect(html).toContain(
    '<h1>AI chat and agents for your React or Angular app</h1>',
  );
  expect(html).toContain('Hashbrown is a headless TypeScript framework.');
  expect(html).toContain('Quick start →');
  expect(html).toContain('Copy agent prompt');
});

test('shows the Angular variant before a preference is read', async () => {
  const html = await render();

  expect(html).toContain('assistant.component.ts');
  expect(html).toContain('createUiKit');
  expect(html).not.toContain('useUiKit');
  expect(html).not.toContain('/docs/react/');
  expect(hrefs(html)).toContain('/docs/angular/start/quick');
});

test('renders build-time highlighted code in the hero and steps', async () => {
  const html = await render();

  const blocks = html.match(/class="shiki hashbrown"/g) ?? [];

  expect(blocks).toHaveLength(4);
});

test('renders the three how-it-works steps', async () => {
  const html = await render();

  expect(html).toContain('<h2>How it works</h2>');
  expect(html).toContain('Expose your components');
  expect(html).toContain('Give it tools');
  expect(html).toContain('Render the stream');
});

test('links each feature to the Angular docs', async () => {
  const html = await render();

  const links = hrefs(html).filter((href) =>
    /^\/docs\/angular\/(concept|platform)\//.test(href),
  );

  expect(links).toEqual([
    '/docs/angular/concept/components',
    '/docs/angular/concept/functions',
    '/docs/angular/concept/structured-output',
    '/docs/angular/concept/streaming',
    '/docs/angular/platform/openai',
    '/docs/angular/concept/runtime',
  ]);
  expect(html).toContain('aria-label="Read the docs: Generative UI"');
});

test('lists the model providers it works with', async () => {
  const html = await render();

  const providers = [
    ...html.matchAll(
      /<span class="[^"]*provider[^"]*">(.*?)<\/span>(?=<span class="[^"]*provider|<\/div>)/g,
    ),
  ].map((match) => match[1].replace(/<[^]*>/g, '').trim());

  expect(providers).toEqual([
    'OpenAI',
    'Anthropic',
    'Gemini',
    'Bedrock',
    'Azure',
    'Ollama',
    'Local models',
  ]);
});

test('links the invoicing showcase and threadplane', async () => {
  const html = await render();

  const links = hrefs(html);

  expect(links).toContain('https://invoicing.hashbrown.dev');
  expect(links).toContain(
    'https://github.com/liveloveapp/hashbrown/tree/main/examples/invoicing',
  );
  expect(links).toContain('https://b4.run');
  expect(links).toContain('https://pretable.ai');
  expect(links.some((href) => href.startsWith('https://threadplane.ai/'))).toBe(
    true,
  );
  expect(html).toContain('/image/landing-page/invoicing.webp');
  expect(html).toContain('/image/landing-page/invoicing-mobile.webp');
});

test('links the three newest blog posts', async () => {
  const newest = listBlogPosts().slice(0, 3);

  const html = await render();

  expect(html).toContain('<h2>From the blog</h2>');
  for (const post of newest) {
    expect(hrefs(html)).toContain(`/blog/${post.slug}`);
    expect(html).toContain(post.title);
  }
});

test('ends with the get started call to action', async () => {
  const html = await render();

  expect(html).toContain('<h2>Get started</h2>');
  expect(html).toContain('Star on GitHub');
  expect(html.match(/role="radiogroup"/g)).toHaveLength(2);
});
