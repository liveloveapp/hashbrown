import type { Root } from 'hast';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { expect, test } from 'vitest';
import { rehypeShiki } from '../src/lib/rehype-shiki';

const toHast = async (md: string) => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeShiki);
  return JSON.stringify((await processor.run(processor.parse(md))) as Root);
};

test('highlights fenced code with the hashbrown theme', async () => {
  const tree = await toHast('```ts\nconst a = 1;\n```');

  expect(tree).toContain('"class":"shiki hashbrown"');
  expect(tree).toContain('color:');
});

test('highlights the languages the docs use through their aliases', async () => {
  const tree = await toHast(
    '```sh\nnpm install\n```\n\n```json\n{"a": 1}\n```',
  );

  expect(tree).not.toContain('language-sh');
  expect(tree.match(/"class":"shiki hashbrown"/g)?.length).toBe(2);
});

test('falls back to plain text for unknown languages instead of failing', async () => {
  const tree = await toHast('```nope\nhello\n```');

  expect(tree).toContain('"class":"shiki hashbrown"');
  expect(tree).toContain('hello');
});

test('keeps angle brackets inside code as text nodes', async () => {
  const tree = await toHast(
    '```html\n<hb-render-message [message]="m" />\n```',
  );

  expect(tree).not.toContain('"tagName":"hb-render-message"');
  expect(tree).toContain('hb-render-message');
});
