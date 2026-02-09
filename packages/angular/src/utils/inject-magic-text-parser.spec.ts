import { signal } from '@angular/core';
import { type MagicTextAstNode } from '@hashbrownai/core';
import { injectMagicTextParser } from './inject-magic-text-parser.fn';

function findByType(
  nodes: MagicTextAstNode[],
  type: MagicTextAstNode['type'],
): MagicTextAstNode[] {
  return nodes.filter((node) => node.type === type);
}

test('injectMagicTextParser parses growing markdown signals', () => {
  const text = signal('streaming para');
  const parser = injectMagicTextParser(text);

  const firstState = parser.parserState();

  expect(firstState.isComplete).toBe(false);
  expect(findByType(firstState.nodes, 'paragraph').length).toBeGreaterThan(0);

  text.set('streaming paragraph');

  const nextState = parser.parserState();
  const textNodes = findByType(nextState.nodes, 'text') as Array<
    Extract<MagicTextAstNode, { type: 'text' }>
  >;

  expect(
    textNodes.some((node) => node.text.includes('streaming paragraph')),
  ).toBe(true);
  expect(nextState.isComplete).toBe(false);
});

test('injectMagicTextParser resets when markdown updates are not prefix-compatible', () => {
  const text = signal('hello world');
  const parser = injectMagicTextParser(text);
  const firstTextNodes = findByType(
    parser.parserState().nodes,
    'text',
  ) as Array<Extract<MagicTextAstNode, { type: 'text' }>>;

  expect(firstTextNodes.some((node) => node.text.includes('hello'))).toBe(true);

  text.set('goodbye');

  const textNodes = findByType(parser.parserState().nodes, 'text') as Array<
    Extract<MagicTextAstNode, { type: 'text' }>
  >;

  expect(textNodes.some((node) => node.text.includes('goodbye'))).toBe(true);
  expect(textNodes.some((node) => node.text.includes('hello'))).toBe(false);
});

test('injectMagicTextParser re-parses when options change', () => {
  const text = signal('ab');
  const options = signal<{ segmenter: false | { granularity: 'grapheme' } }>({
    segmenter: false,
  });
  const parser = injectMagicTextParser(text, undefined, options);

  const before = findByType(parser.parserState().nodes, 'text')[0] as
    | Extract<MagicTextAstNode, { type: 'text' }>
    | undefined;

  expect(before?.segments ?? []).toHaveLength(0);

  options.set({ segmenter: { granularity: 'grapheme' } });

  const after = findByType(parser.parserState().nodes, 'text')[0] as
    | Extract<MagicTextAstNode, { type: 'text' }>
    | undefined;

  expect((after?.segments ?? []).length).toBeGreaterThan(0);
});

test('injectMagicTextParser preserves completed state when completion toggles without text changes', () => {
  const text = signal('```ts\nconst x = 1;');
  const isComplete = signal(false);
  const parser = injectMagicTextParser(text, isComplete);

  expect(parser.parserState().isComplete).toBe(false);

  isComplete.set(true);

  expect(parser.parserState().isComplete).toBe(true);

  isComplete.set(false);

  expect(parser.parserState().isComplete).toBe(true);
});

test('injectMagicTextParser resets parser state when text changes after completion', () => {
  const text = signal('```ts\nconst x = 1;');
  const isComplete = signal(false);
  const parser = injectMagicTextParser(text, isComplete);

  isComplete.set(true);

  expect(parser.parserState().isComplete).toBe(true);

  text.set('next stream');
  isComplete.set(false);

  const nextState = parser.parserState();
  const textNodes = findByType(nextState.nodes, 'text') as Array<
    Extract<MagicTextAstNode, { type: 'text' }>
  >;

  expect(nextState.isComplete).toBe(false);
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

  expect(parser.rootNode()?.type).toBe('document');
  expect(parser.openNode()).toBeNull();
});

test('injectMagicTextParser finalizes prefix updates when completion is already true', () => {
  const text = signal('hello');
  const isComplete = signal(true);
  const parser = injectMagicTextParser(text, isComplete);

  expect(parser.parserState().isComplete).toBe(true);

  text.set('hello world');

  expect(parser.parserState().isComplete).toBe(true);
});
