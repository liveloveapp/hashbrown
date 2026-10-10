import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { docsComponents } from '../../src/components/docs-components';
import { renderMarkdown } from '../../src/lib/markdown';

test.each(['react', 'angular'])(
  'the %s example app page describes atc and has no walkthrough video',
  async (sdk) => {
    const source = readFileSync(
      join(__dirname, `../../content/docs/${sdk}/start/sample.md`),
      'utf8',
    ).replace(/^---[\s\S]*?---\n/, '');

    const rendered = await renderMarkdown(source, docsComponents(sdk));
    const html = renderToStaticMarkup(rendered.content);

    expect(html).toMatch(/^<h1[^>]*>atc Example<\/h1>/);
    expect(html).not.toContain('<video');
  },
);
