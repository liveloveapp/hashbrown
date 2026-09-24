import type { Root } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { expect, test } from 'vitest';
import {
  parseCanonicalReference,
  symbolHref,
} from '../src/lib/canonical-reference';
import { remarkCanonicalReference } from '../src/lib/remark-canonical-reference';

const parse = (md: string) => {
  const processor = unified().use(remarkParse).use(remarkCanonicalReference);
  return processor.runSync(processor.parse(md)) as Root;
};

test('parses a canonical reference', () => {
  const parsed = parseCanonicalReference('@hashbrownai/react!useChat:function');

  expect(parsed).toEqual({
    package: '@hashbrownai/react',
    name: 'useChat',
    kind: 'function',
    isPrivate: false,
  });
});

test('links hashbrown symbols to the API reference', () => {
  const parsed = parseCanonicalReference('@hashbrownai/react!useChat:function');

  const href = parsed && symbolHref(parsed);

  expect(href).toBe('/api/react/useChat');
});

test('links Angular symbols to angular.dev and private symbols nowhere', () => {
  const angular = parseCanonicalReference('@angular/core!Signal:interface');
  const hidden = parseCanonicalReference('@hashbrownai/react!~AnyTool:type');

  const angularHref = angular && symbolHref(angular);
  const hiddenHref = hidden && symbolHref(hidden);

  expect(angularHref).toBe('https://angular.dev/api/core/Signal');
  expect(hiddenHref).toBeUndefined();
});

test('turns a reference in prose into a symbol-link element', () => {
  const tree = parse(
    'Import the @hashbrownai/react!HashbrownProvider:function component.',
  );

  const paragraph = tree.children[0] as unknown as {
    children: { type: string; data?: unknown }[];
  };
  expect(paragraph.children.map((c) => c.type)).toEqual([
    'text',
    'symbolLink',
    'text',
  ]);
  expect(paragraph.children[1].data).toEqual({
    hName: 'hb-symbol-link',
    hProperties: { reference: '@hashbrownai/react!HashbrownProvider:function' },
  });
});

test('finds references nested inside emphasis and list items', () => {
  const tree = parse('1. The *@hashbrownai/react!useChat:function* hook');

  expect(JSON.stringify(tree)).toContain('"hName":"hb-symbol-link"');
});

test('leaves references inside inline code and code blocks alone', () => {
  const tree = parse(
    '`@hashbrownai/react!useChat:function`\n\n```ts\n@hashbrownai/react!useChat:function\n```',
  );

  expect(JSON.stringify(tree)).not.toContain('symbolLink');
});
