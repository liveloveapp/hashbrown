import { signal } from '@angular/core';
import type { MarkdownNode } from '@cacheplane/partial-markdown';
import { injectMagicTextParser } from './inject-magic-text-parser.fn';

function findByType(
  nodes: Iterable<MarkdownNode>,
  type: MarkdownNode['type'],
): MarkdownNode[] {
  return [...nodes].filter((node) => node.type === type);
}

test('injectMagicTextParser parses growing markdown signals', () => {
  const text = signal('streaming para');
  const parser = injectMagicTextParser(text);

  expect(parser.isComplete()).toBe(false);
  expect(findByType(parser.nodeById().values(), 'paragraph')).toHaveLength(1);

  text.set('streaming paragraph');

  const textNodes = findByType(parser.nodeById().values(), 'text') as Array<
    Extract<MarkdownNode, { type: 'text' }>
  >;

  expect(
    textNodes.some((node) => node.text.includes('streaming paragraph')),
  ).toBe(true);
  expect(parser.isComplete()).toBe(false);
});

test('injectMagicTextParser refreshes derived maps when prefix growth adds nodes', () => {
  const text = signal('first');
  const parser = injectMagicTextParser(text);

  const nodeIdsBefore = new Set(parser.nodeById().keys());

  text.set('first\n\nsecond');

  const secondParagraph = parser.rootNode()?.children[1];

  expect(secondParagraph?.type).toBe('paragraph');
  expect(secondParagraph).toBeDefined();
  expect(nodeIdsBefore.has(secondParagraph?.id ?? -1)).toBe(false);
  expect(parser.nodeById().get(secondParagraph?.id ?? -1)).toBe(secondParagraph);
  expect(parser.openNode()?.id).toBe(secondParagraph?.children[0]?.id);
});

test('injectMagicTextParser preserves resolved node identity across prefix updates', () => {
  const text = signal('first\n\nsecond');
  const parser = injectMagicTextParser(text);
  const firstParagraphBefore = parser.rootNode()?.children[0];

  text.set('first\n\nsecond line');

  const firstParagraphAfter = parser.rootNode()?.children[0];

  expect(firstParagraphBefore).toBeDefined();
  expect(firstParagraphAfter).toBe(firstParagraphBefore);
});

test('injectMagicTextParser resets when markdown updates are not prefix-compatible', () => {
  const text = signal('hello world');
  const parser = injectMagicTextParser(text);
  const firstTextNodes = findByType(
    parser.nodeById().values(),
    'text',
  ) as Array<Extract<MarkdownNode, { type: 'text' }>>;

  expect(firstTextNodes.some((node) => node.text.includes('hello'))).toBe(true);

  text.set('goodbye');

  const textNodes = findByType(parser.nodeById().values(), 'text') as Array<
    Extract<MarkdownNode, { type: 'text' }>
  >;

  expect(textNodes.some((node) => node.text.includes('goodbye'))).toBe(true);
  expect(textNodes.some((node) => node.text.includes('hello'))).toBe(false);
});

test('injectMagicTextParser re-parses when Cacheplane options change', () => {
  const text = signal('$x$');
  const options = signal({ math: { dollar: false } });
  const parser = injectMagicTextParser(text, undefined, options);

  const before = findByType(parser.nodeById().values(), 'math-inline');

  expect(before).toHaveLength(0);

  options.set({ math: { dollar: true } });

  const after = findByType(parser.nodeById().values(), 'math-inline');

  expect(after).toHaveLength(1);
});

test('injectMagicTextParser preserves completed state when completion toggles without text changes', () => {
  const text = signal('```ts\nconst x = 1;');
  const isComplete = signal(false);
  const parser = injectMagicTextParser(text, isComplete);

  expect(parser.isComplete()).toBe(false);

  isComplete.set(true);

  expect(parser.isComplete()).toBe(true);

  isComplete.set(false);

  expect(parser.isComplete()).toBe(true);
});

test('injectMagicTextParser resets parser state when text changes after completion', () => {
  const text = signal('```ts\nconst x = 1;');
  const isComplete = signal(false);
  const parser = injectMagicTextParser(text, isComplete);

  isComplete.set(true);

  expect(parser.isComplete()).toBe(true);

  text.set('next stream');
  isComplete.set(false);

  const textNodes = findByType(parser.nodeById().values(), 'text') as Array<
    Extract<MarkdownNode, { type: 'text' }>
  >;

  expect(parser.isComplete()).toBe(false);
  expect(textNodes.some((node) => node.text.includes('next stream'))).toBe(
    true,
  );
});

test('injectMagicTextParser exposes nodeById/rootNode/openNode derived signals', () => {
  const text = signal('# Title');
  const parser = injectMagicTextParser(text);

  const root = parser.rootNode();
  const open = parser.openNode();

  expect(root?.type).toBe('document');
  expect(open).not.toBeNull();
  if (!root) {
    throw new Error('Expected root node to exist');
  }
  expect(parser.nodeById().get(root.id)).toBe(root);
});

test('injectMagicTextParser handles empty text with no open/root node', () => {
  const text = signal('');
  const isComplete = signal(true);
  const parser = injectMagicTextParser(text, isComplete);

  expect(parser.rootNode()).toBeNull();
  expect(parser.openNode()).toBeNull();
});

test('injectMagicTextParser finalizes prefix updates when completion is already true', () => {
  const text = signal('hello');
  const isComplete = signal(true);
  const parser = injectMagicTextParser(text, isComplete);

  expect(parser.isComplete()).toBe(true);

  text.set('hello world');

  expect(parser.isComplete()).toBe(true);
});

test('injectMagicTextParser preserves list item ids across newline prefix growth', () => {
  const text = signal('1. one\n');
  const parser = injectMagicTextParser(text);

  const beforeList = findByType(parser.nodeById().values(), 'list')[0] as
    Extract<MarkdownNode, { type: 'list' }> | undefined;
  const beforeFirstItemId = beforeList?.children[0]?.id;

  text.set('1. one\n2. two');

  const afterList = findByType(parser.nodeById().values(), 'list')[0] as
    Extract<MarkdownNode, { type: 'list' }> | undefined;

  expect(beforeList).toBeDefined();
  expect(beforeFirstItemId).toBeDefined();
  expect(parser.isComplete()).toBe(false);
  expect(afterList?.children).toHaveLength(2);
  expect(afterList?.children[0]?.id).toBe(beforeFirstItemId);
});
