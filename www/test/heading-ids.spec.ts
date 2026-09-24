import type { Root } from 'hast';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { expect, test } from 'vitest';
import {
  type Heading,
  rehypeHeadingIds,
  slugifyHeading,
} from '../src/lib/rehype-heading-ids';

const collect = (md: string) => {
  const headings: Heading[] = [];
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeHeadingIds, { onHeadings: (found) => headings.push(...found) });
  const tree = processor.runSync(processor.parse(md)) as Root;
  return { tree, headings };
};

test('slugifies like the Angular MarkdownPage: lowercase, spaces to dashes', () => {
  const id = slugifyHeading('Node Adapters');

  expect(id).toBe('node-adapters');
});

test('keeps periods and drops colons and at-signs', () => {
  const version = slugifyHeading('Hashbrown v0.6');
  const scoped = slugifyHeading('@hashbrownai/react: Setup');

  expect(version).toBe('hashbrown-v0.6');
  expect(scoped).toBe('hashbrownai-react-setup');
});

test('sets ids on h1 to h3 and reports them in order', () => {
  const { tree, headings } = collect(
    '# Quick Start\n\n## Install\n\n### The `useChat` hook\n\n#### Not collected',
  );

  expect(headings).toEqual([
    { level: 1, text: 'Quick Start', id: 'quick-start' },
    { level: 2, text: 'Install', id: 'install' },
    { level: 3, text: 'The useChat hook', id: 'the-usechat-hook' },
  ]);
  expect(JSON.stringify(tree)).toContain('"id":"install"');
  expect(JSON.stringify(tree)).not.toContain('"id":"not-collected"');
});
