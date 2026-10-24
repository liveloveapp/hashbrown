import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { docsComponents } from '../../src/components/docs-components';
import { listDocs, readDoc, SDKS } from '../../src/lib/content';
import { renderMarkdown } from '../../src/lib/markdown';

const demos = [
  ['generative-ui', 'components'],
  ['streaming-data', 'streaming'],
  ['structured-form', 'structured-output'],
  ['browser-tools', 'functions'],
  ['schemas', 'schema'],
  ['decisions', 'decisions'],
] as const;

test.each([
  ...demos,
  ['debugging', 'debugging'],
  ['welcome-card', 'quick'],
  ['conversation', 'ai-basics'],
  ['persistence', 'message-history'],
  ['interrupts', 'interrupt-and-resume'],
  ['shared-state', 'shared-agent-state'],
  ['activities', 'activities'],
  ['ui-kits', 'ui-kits'],
] as const)(
  'renders the %s Markdown demo with accessible on-demand playback',
  async (demo) => {
    const markdown = `<hb-docs-demo demo="${demo}">\n</hb-docs-demo>`;

    const result = await renderMarkdown(markdown, docsComponents('react'));
    const html = renderToStaticMarkup(result.content);
    const video = html.match(/<video\b[^>]*>/)?.[0] ?? '';

    expect(video).toContain('controls=""');
    expect(video).toContain('preload="none"');
    expect(video).toContain('playsInline=""');
    expect(video).toContain('aria-label=');
    expect(video).toContain('width="1440"');
    expect(video).toContain('height="810"');
    expect(video).not.toMatch(/autoplay/i);
    expect(html).toContain(`/video/docs/${demo}.webm`);
    expect(html).toContain(`/video/docs/${demo}.mp4`);
    expect(html).toContain('kind="captions"');
    expect(html).toContain(`/video/docs/${demo}.vtt`);
    expect(html).toContain(`/video/docs/${demo}-transcript.txt`);
    expect(html).toContain('scripted');
    expect(html).not.toContain('data-unported');
    expect(html).not.toMatch(/<p>\s*<figure/);
  },
);

test.each([
  ...demos,
  ['debugging', 'debugging'],
  ['welcome-card', 'quick'],
  ['conversation', 'ai-basics'],
  ['persistence', 'message-history'],
  ['interrupts', 'interrupt-and-resume'],
  ['shared-state', 'shared-agent-state'],
  ['activities', 'activities'],
  ['ui-kits', 'ui-kits'],
] as const)('ships complete local media for the %s demo', (demo) => {
  const publicDir = resolve(import.meta.dirname, '../../public/video/docs');
  const files = [
    `${demo}.mp4`,
    `${demo}.webm`,
    `${demo}-poster.png`,
    `${demo}.vtt`,
    `${demo}-transcript.txt`,
  ];

  const present = files.filter((file) => existsSync(resolve(publicDir, file)));

  expect(present).toEqual(files);
  expect(readFileSync(resolve(publicDir, `${demo}.vtt`), 'utf8')).toMatch(
    /^WEBVTT/,
  );
});

test.each(SDKS)(
  '%s documentation has no legacy Vimeo embeds or links',
  (sdk) => {
    const pages = listDocs(sdk).map((slug) => ({
      slug: slug.join('/'),
      body: readDoc(sdk, slug)?.body ?? '',
    }));

    const legacy = pages.filter((page) => /vimeo\.com/i.test(page.body));

    expect(legacy.map((page) => page.slug)).toEqual([]);
  },
);

test.each(SDKS)(
  'replaces %s structured output and debugging videos without duplicating streaming',
  (sdk) => {
    const structured =
      readDoc(sdk, ['concept', 'structured-output'])?.body ?? '';
    const streaming = readDoc(sdk, ['concept', 'streaming'])?.body ?? '';
    const quick = readDoc(sdk, ['start', 'quick'])?.body ?? '';

    const counts = [structured, streaming, quick].map(
      (body) => [...body.matchAll(/<hb-docs-demo\b/g)].length,
    );

    expect(counts).toEqual([1, 1, 1]);
    expect(structured).toContain('<hb-docs-demo demo="structured-form">');
    expect(quick).toContain('<hb-docs-demo demo="welcome-card">');
    expect(readDoc(sdk, ['concept', 'debugging'])?.body).toContain(
      '<hb-docs-demo demo="debugging">',
    );
  },
);

test.each(SDKS)(
  'opens matching %s guides with the recorded demos before their first section',
  (sdk) => {
    const pages = demos.map(([demo, slug]) => ({
      demo,
      body: readDoc(sdk, ['concept', slug])?.body ?? '',
    }));

    const positions = pages.map(({ demo, body }) => ({
      demo,
      video: body.indexOf(`<hb-docs-demo demo="${demo}">`),
      section: body.indexOf('\n## '),
    }));

    for (const position of positions) {
      expect(position.video, position.demo).toBeGreaterThan(-1);
      expect(position.video, position.demo).toBeLessThan(position.section);
    }
  },
);

test('rejects an unknown recording identifier instead of generating broken media URLs', async () => {
  const result = await renderMarkdown(
    '<hb-docs-demo demo="missing">\n</hb-docs-demo>',
    docsComponents('react'),
  );

  const render = () => renderToStaticMarkup(result.content);

  expect(render).toThrow('Unknown documentation demo: missing');
});
