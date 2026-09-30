import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { docsComponents } from '../../src/components/docs-components';
import { WalkthroughVideo } from '../../src/components/elements/WalkthroughVideo';
import { renderMarkdown } from '../../src/lib/markdown';

test('the walkthrough plays on demand from Vercel Blob, with a poster and caption', () => {
  const html = renderToStaticMarkup(<WalkthroughVideo />);

  const video = html.match(/<video [^>]*>/)?.[0] ?? '';

  expect(video).toMatch(
    /src="https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/video\/invoicing-walkthrough-[0-9a-f]{12}\.mp4"/,
  );
  expect(video).toContain(
    'poster="/image/landing-page/invoicing-walkthrough.webp"',
  );
  expect(video).toContain('controls=""');
  expect(video).toContain('preload="none"');
  expect(video).toContain('muted=""');
  expect(video).toContain('playsInline=""');
  expect(video).not.toContain('autoPlay');
  expect(html).toContain('<figcaption');
});

test.each(['react', 'angular'])(
  'the %s example app page opens with the walkthrough, not wrapped in a paragraph',
  async (sdk) => {
    const source = readFileSync(
      join(__dirname, `../../content/docs/${sdk}/start/sample.md`),
      'utf8',
    ).replace(/^---[\s\S]*?---\n/, '');

    const rendered = await renderMarkdown(source, docsComponents(sdk));
    const html = renderToStaticMarkup(rendered.content);

    expect(html).toMatch(
      /^<h1[^>]*>Invoicing Example<\/h1>\s*<figure[^>]*><video [^>]*invoicing-walkthrough-[0-9a-f]{12}\.mp4/,
    );
    expect(html).not.toMatch(/<p>\s*<figure/);
  },
);
