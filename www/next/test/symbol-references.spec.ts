import type { Root } from 'hast';
import { expect, test } from 'vitest';
import { parseMarkdown } from '../src/lib/markdown';
import { collectSymbolReferences } from '../src/lib/symbol-references';

const symbolLink = (reference: string) => ({
  type: 'element' as const,
  tagName: 'hb-symbol-link',
  properties: { reference },
  children: [],
});

test('collects each symbol-link reference once, in document order', () => {
  const tree: Root = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'p',
        properties: {},
        children: [
          symbolLink('@hashbrownai/react!useChat:function'),
          { type: 'text', value: ' and ' },
          symbolLink('@hashbrownai/core!prompt:function'),
        ],
      },
      symbolLink('@hashbrownai/react!useChat:function'),
    ],
  };

  const references = collectSymbolReferences(tree);

  expect(references).toEqual([
    '@hashbrownai/react!useChat:function',
    '@hashbrownai/core!prompt:function',
  ]);
});

test('ignores other elements and symbol links without a reference', () => {
  const tree: Root = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'a',
        properties: { reference: '@hashbrownai/react!useChat:function' },
        children: [],
      },
      {
        type: 'element',
        tagName: 'hb-symbol-link',
        properties: {},
        children: [],
      },
    ],
  };

  const references = collectSymbolReferences(tree);

  expect(references).toEqual([]);
});

test('finds references in prose and raw HTML but not in code', async () => {
  const md = [
    'Call @hashbrownai/react!useChat:function first.',
    '',
    '<hb-symbol-link reference="@hashbrownai/core!prompt:function"></hb-symbol-link>',
    '',
    '`@hashbrownai/react!useTool:function`',
    '',
    '```ts',
    '@hashbrownai/react!useUiChat:function',
    '```',
  ].join('\n');
  const { tree } = await parseMarkdown(md);

  const references = collectSymbolReferences(tree);

  expect(references).toEqual([
    '@hashbrownai/react!useChat:function',
    '@hashbrownai/core!prompt:function',
  ]);
});
