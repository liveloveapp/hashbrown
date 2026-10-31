import { expect, test } from 'vitest';

import { toDevtoMarkdown } from './devto-markdown.ts';

const POST_URL = 'https://hashbrown.dev/blog/2026-10-27-example';

function convert(markdown: string): string {
  return toDevtoMarkdown(markdown, POST_URL);
}

test('removes the frontmatter', () => {
  const out = convert('---\ntitle: Hi\ntags:\n  - a\n---\n\nBody text.\n');
  expect(out).toBe('Body text.\n');
});

test('leaves a document without frontmatter alone', () => {
  expect(convert('Body.\n\n---\n\nMore.\n')).toBe('Body.\n\n---\n\nMore.\n');
});

test('makes root-relative links absolute', () => {
  expect(convert('See the [docs](/docs/react) now.')).toBe(
    'See the [docs](https://hashbrown.dev/docs/react) now.',
  );
});

test('makes root-relative images absolute', () => {
  expect(convert('![x](/blog/image/a.png)')).toBe(
    '![x](https://hashbrown.dev/blog/image/a.png)',
  );
});

test('keeps a link title', () => {
  expect(convert('[docs](/docs "The docs")')).toBe(
    '[docs](https://hashbrown.dev/docs "The docs")',
  );
});

test('resolves page-relative links against the post URL', () => {
  expect(convert('![a](./a.png) [b](b.png) [c](../x)')).toBe(
    '![a](https://hashbrown.dev/blog/2026-10-27-example/a.png) ' +
      '[b](https://hashbrown.dev/blog/2026-10-27-example/b.png) ' +
      '[c](https://hashbrown.dev/blog/x)',
  );
});

test('resolves against a post URL that ends in a slash', () => {
  expect(toDevtoMarkdown('![a](./a.png)', `${POST_URL}/`)).toBe(
    '![a](https://hashbrown.dev/blog/2026-10-27-example/a.png)',
  );
});

test('leaves anchors, mailto and absolute URLs alone', () => {
  const md =
    '[a](#intro) [b](mailto:hi@example.com) [c](https://example.com/x) [d](http://example.com)';
  expect(convert(md)).toBe(md);
});

test('rewrites reference definitions', () => {
  expect(convert('[docs]: /docs/react\n[ext]: https://x.dev')).toBe(
    '[docs]: https://hashbrown.dev/docs/react\n[ext]: https://x.dev',
  );
});

test('rewrites src and href attributes in raw HTML', () => {
  expect(convert('<img src="/blog/image/a.avif" width="10" alt="a" />')).toBe(
    '<img src="https://hashbrown.dev/blog/image/a.avif" width="10" alt="a" />',
  );
  expect(convert("<a href='./x'>x</a>")).toBe(
    "<a href='https://hashbrown.dev/blog/2026-10-27-example/x'>x</a>",
  );
});

test('leaves a backtick fenced code block untouched', () => {
  const md = '```md\n[docs](/docs)\n<img src="/a.png" />\n```';
  expect(convert(md)).toBe(md);
});

test('leaves a tilde fenced code block untouched', () => {
  const md = '~~~\n[docs](/docs)\n~~~\n\n[docs](/docs)';
  expect(convert(md)).toBe(
    '~~~\n[docs](/docs)\n~~~\n\n[docs](https://hashbrown.dev/docs)',
  );
});

test('a longer fence is only closed by a matching fence', () => {
  const md = '````md\n```\n[a](/docs)\n```\n[b](/docs)\n````\n[c](/docs)';
  expect(convert(md)).toBe(
    '````md\n```\n[a](/docs)\n```\n[b](/docs)\n````\n[c](https://hashbrown.dev/docs)',
  );
});

test('a tilde fence is not closed by backticks', () => {
  const md = '~~~\n```\n[a](/docs)\n~~~';
  expect(convert(md)).toBe(md);
});

test('leaves inline code spans untouched', () => {
  expect(convert('Use `[a](/docs)` or [b](/docs).')).toBe(
    'Use `[a](/docs)` or [b](https://hashbrown.dev/docs).',
  );
});

test('converts hb-code-example into a bold label above the code', () => {
  const md = [
    'Before.',
    '',
    '<hb-code-example header="schema.ts">',
    '',
    '```ts',
    'const a = 1;',
    '```',
    '',
    '</hb-code-example>',
    '',
    'After.',
  ].join('\n');
  expect(convert(md)).toBe(
    [
      'Before.',
      '',
      '**schema.ts**',
      '',
      '```ts',
      'const a = 1;',
      '```',
      '',
      'After.',
    ].join('\n'),
  );
});

test('does not touch hb tags inside a code fence', () => {
  const md =
    '```html\n<hb-code-example header="x">\n<hb-render-message />\n```';
  expect(convert(md)).toBe(md);
});

test('unwraps hb-carousel and keeps its images, made absolute', () => {
  const md = [
    '<hb-carousel columns="1">',
    '',
    '  <img src="/blog/image/a.avif" alt="A" />',
    '  <img src="/blog/image/b.avif" alt="B" />',
    '',
    '</hb-carousel>',
    '',
    'Text.',
  ].join('\n');
  expect(convert(md)).toBe(
    [
      '<img src="https://hashbrown.dev/blog/image/a.avif" alt="A" />',
      '<img src="https://hashbrown.dev/blog/image/b.avif" alt="B" />',
      '',
      'Text.',
    ].join('\n'),
  );
});

test('replaces hb-prose-demo with a link to the post', () => {
  const md =
    "Use the slider below to simulate streaming Markdown through Hashbrown's Prose parser:\n\n<hb-prose-demo></hb-prose-demo>\n\nWe have a full recipe.";
  expect(convert(md)).toBe(
    `Use the slider below to simulate streaming Markdown through Hashbrown's Prose parser:\n\n[See the interactive demo on hashbrown.dev](${POST_URL})\n\nWe have a full recipe.`,
  );
});

test('replaces a multi-line www-atc-demo-video with a link to the post', () => {
  const md =
    "Here's the whole thing in about a minute:\n\n<www-atc-demo-video>\n</www-atc-demo-video>\n\nThis post is long.";
  expect(convert(md)).toBe(
    `Here's the whole thing in about a minute:\n\n[Watch the demo on hashbrown.dev](${POST_URL})\n\nThis post is long.`,
  );
});

test('replaces a single-line www-atc-demo-video with a link to the post', () => {
  expect(convert('<www-atc-demo-video></www-atc-demo-video>')).toBe(
    `[Watch the demo on hashbrown.dev](${POST_URL})`,
  );
});

test('leaves demo tags inside a code fence untouched', () => {
  const md = '```html\n<www-atc-demo-video>\n</www-atc-demo-video>\n```';
  expect(convert(md)).toBe(md);
});

test('replaces the Loom iframe wrapper with a link', () => {
  const md =
    '<div style="position: relative; padding-bottom: 64.9%; height: 0;"><iframe src="https://www.loom.com/embed/318817ba886e41f89fb174c350c1905b?sid=abc" frameborder="0" allowfullscreen></iframe></div>';
  expect(convert(md)).toBe(
    '[Watch the video](https://www.loom.com/share/318817ba886e41f89fb174c350c1905b)',
  );
});

test('turns the frontmatter youtube URL into a dev.to embed', () => {
  const md =
    '---\ntitle: Talk\nyoutube: https://www.youtube.com/watch?v=abc123\n---\n\nBody.\n';
  expect(convert(md)).toBe(
    '{% embed https://www.youtube.com/watch?v=abc123 %}\n\nBody.\n',
  );
});
