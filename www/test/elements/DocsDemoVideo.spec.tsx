import { expectConceptFirstWorkbench } from '../docs/concept-first-workbench';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DOCS_DEMOS,
  type DocsDemoMedia,
} from '../../src/components/elements/docs-demo-media';
import { DocsDemoVideo } from '../../src/components/elements/DocsDemoVideo';
import { expect, test } from 'vitest';
import { docsComponents } from '../../src/components/docs-components';
import { listDocs, readDoc, SDKS } from '../../src/lib/content';
import { renderMarkdown } from '../../src/lib/markdown';

const conceptPages = [
  'components',
  'streaming',
  'structured-output',
  'functions',
  'schema',
  'decisions',
] as const;

const recordings = [
  'canonical-workbench-first-plan-react',
  'canonical-workbench-conversation-angular',
  'canonical-workbench-ui-react',
  'canonical-workbench-interrupts-angular',
  'canonical-workbench-threadplane-react',
] as const;

test.each(recordings)(
  'renders the %s recording at its captured aspect ratio',
  async (demo) => {
    const markdown = `<hb-docs-demo demo="${demo}">\n</hb-docs-demo>`;

    const result = await renderMarkdown(markdown, docsComponents('react'));
    const html = renderToStaticMarkup(result.content);
    const video = html.match(/<video\b[^>]*>/)?.[0] ?? '';

    expect(video).toContain('width="1600"');
    expect(video).toContain('height="1000"');
    expect(video).toContain('style="aspect-ratio:1600 / 1000"');
  },
);

test.each(recordings)(
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
    expect(video).not.toMatch(/autoplay/i);
    expect(html).toContain(`/video/docs/${demo}.webm`);
    expect(html).toContain(`/video/docs/${demo}.mp4`);
    expect(html).toContain('kind="captions"');
    expect(html).toContain(`/video/docs/${demo}.vtt`);
    expect(html).toContain(`/video/docs/${demo}-transcript.txt`);
    expect(html).toContain(DOCS_DEMOS[demo].recording);
    expect(html).not.toContain('data-unported');
    expect(html).not.toMatch(/<p>\s*<figure/);
  },
);

test('every docs demo declares its recording disclosure and captured dimensions', () => {
  const demos: Readonly<Record<string, DocsDemoMedia>> = DOCS_DEMOS;

  const incomplete = Object.entries(demos)
    .filter(
      ([, media]) =>
        media.recording.trim() === '' ||
        !(media.dimensions.width > 0 && media.dimensions.height > 0),
    )
    .map(([id]) => id);

  expect(incomplete).toEqual([]);
});

test.each(Object.keys(DOCS_DEMOS))(
  'ships complete local media for the %s demo',
  (demo) => {
    const publicDir = resolve(import.meta.dirname, '../../public/video/docs');
    const files = [
      `${demo}.mp4`,
      `${demo}.webm`,
      `${demo}-poster.png`,
      `${demo}.vtt`,
      `${demo}-transcript.txt`,
    ];

    const present = files.filter((file) =>
      existsSync(resolve(publicDir, file)),
    );

    expect(present).toEqual(files);
    expect(readFileSync(resolve(publicDir, `${demo}.vtt`), 'utf8')).toMatch(
      /^WEBVTT/,
    );
  },
);

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
      (body) => [...body.matchAll(/<hb-workbench\b/g)].length,
    );

    expect(counts).toEqual([1, 1, 1]);
    expect(structured).toContain(`<hb-workbench lesson="structured-output">`);
    expect(quick).toContain(`<hb-workbench lesson="first-plan">`);
    expect(readDoc(sdk, ['concept', 'debugging'])?.body).toContain(
      `<hb-workbench lesson="debugging">`,
    );
  },
);

test.each(SDKS)(
  'opens matching %s guides with teaching before their inline workbench',
  (sdk) => {
    const lessons: Record<(typeof conceptPages)[number], string> = {
      components: 'generative-ui',
      functions: 'tools',
      'structured-output': 'structured-output',
      streaming: 'streaming',
      schema: 'schemas',
      decisions: 'decisions',
    };
    const pages = conceptPages.map((slug) => ({
      demo: lessons[slug],
      body: readDoc(sdk, ['concept', slug])?.body ?? '',
    }));

    for (const { demo, body } of pages) {
      expectConceptFirstWorkbench(body, sdk, demo);
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

test('associates each recorded video with its own concise visible description', () => {
  const html = renderToStaticMarkup(
    <>
      <DocsDemoVideo demo="canonical-workbench-ui-react" />
      <DocsDemoVideo demo="canonical-workbench-ui-react" />
    </>,
  );

  const descriptions = [
    ...html.matchAll(/<video[^>]*aria-describedby="([^"]+)"/g),
  ].map((match) => match[1]);

  expect(descriptions).toHaveLength(2);
  expect(new Set(descriptions).size).toBe(2);
  for (const id of descriptions) {
    expect(html).toContain(
      `<p id="${id}">${DOCS_DEMOS['canonical-workbench-ui-react'].caption}</p>`,
    );
  }
});

test('names text walkthrough links by the recording they explain', () => {
  const html = renderToStaticMarkup(
    <DocsDemoVideo demo="canonical-workbench-threadplane-react" />,
  );

  const link =
    html.match(/<a[^>]+href="[^"]+-transcript.txt"[^>]*>/)?.[0] ?? '';

  expect(link).toContain(
    'aria-label="Read the text walkthrough: Give the plan a React chat screen."',
  );
  expect(html).toContain('>Read the text walkthrough</a>');
});
