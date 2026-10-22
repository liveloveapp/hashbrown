import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { docsComponents } from '../../src/components/docs-components';
import { ATC_DEMO_VIDEO } from '../../src/components/elements/atc-media';
import { renderMarkdown } from '../../src/lib/markdown';

/** The example app page for `sdk`, rendered without its front matter. */
async function renderSamplePage(sdk: string): Promise<string> {
  const source = readFileSync(
    join(__dirname, `../../content/docs/${sdk}/start/sample.md`),
    'utf8',
  ).replace(/^---[\s\S]*?---\n/, '');
  const rendered = await renderMarkdown(source, docsComponents(sdk));

  return renderToStaticMarkup(rendered.content);
}

test.each(['react', 'angular'])(
  'the %s example app page describes atc and opens with its demo video',
  async (sdk) => {
    const html = await renderSamplePage(sdk);

    expect(html).toMatch(/^<h1[^>]*>atc Example<\/h1>/);
    expect(html.match(/<video/g)).toHaveLength(1);
    expect(html).toContain(ATC_DEMO_VIDEO.mp4);
  },
);

test.each(['react', 'angular'])(
  'the %s example app page shows atc screenshots that exist in public',
  async (sdk) => {
    const html = await renderSamplePage(sdk);

    const images = [...html.matchAll(/<img[^>]* src="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(images.length).toBeGreaterThan(0);
    for (const src of images) {
      expect(() =>
        readFileSync(join(__dirname, '../../public', src)),
      ).not.toThrow();
    }
  },
);
