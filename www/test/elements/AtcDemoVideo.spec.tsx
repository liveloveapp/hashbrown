import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import BlogPostPage from '../../src/app/blog/[slug]/page';
import { AtcDemoVideo } from '../../src/components/elements/AtcDemoVideo';

/** Rendering a whole post runs the markdown pipeline, slow in a busy run. */
const POST_RENDER = { timeout: 10_000 };

const BLOB =
  /https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/video\/atc-demo-[0-9a-f]{12}/;

test('the atc demo plays on demand from Vercel Blob, WebM first, with a poster', () => {
  const html = renderToStaticMarkup(<AtcDemoVideo />);

  const video = html.match(/<video [^>]*>/)?.[0] ?? '';
  const sources = [...html.matchAll(/<source [^>]*>/g)].map((m) => m[0]);

  expect(video).toContain('poster="/image/landing-page/atc-demo-poster.webp"');
  expect(video).toContain('controls=""');
  expect(video).toContain('preload="none"');
  expect(video).toContain('muted=""');
  expect(video).toContain('playsInline=""');
  expect(video).not.toContain('autoPlay');
  expect(sources).toHaveLength(2);
  expect(sources[0]).toMatch(new RegExp(`${BLOB.source}\\.webm`));
  expect(sources[0]).toContain('type="video/webm"');
  expect(sources[1]).toMatch(new RegExp(`${BLOB.source}\\.mp4`));
  expect(html).toContain('<figcaption');
});

test(
  'the atc blog post opens its architecture with the demo video',
  async () => {
    const html = renderToStaticMarkup(
      await BlogPostPage({
        params: Promise.resolve({ slug: '2026-10-10-building-atc' }),
      }),
    );

    // The post's card image may repeat the diagram earlier on the page, so
    // compare against the diagram's own <img> in the body.
    const video = html.indexOf('atc-demo-poster.webp');
    const diagram = html.indexOf(
      '<img src="/blog/image/article/2026-10-10-atc-architecture.svg"',
    );

    expect(video).toBeGreaterThan(-1);
    expect(diagram).toBeGreaterThan(video);
    expect(html).not.toMatch(/<p>\s*<figure/);
  },
  POST_RENDER.timeout,
);
