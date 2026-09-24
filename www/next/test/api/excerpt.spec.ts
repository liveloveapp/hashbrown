import { expect, test } from 'vitest';
import {
  excerptFromFormattedContent,
  excerptFromTokens,
  segmentLines,
} from '../../src/components/api/excerpt';
import type { ApiExcerptToken } from '../../src/lib/api-reference';

const tokens: ApiExcerptToken[] = [
  { kind: 'Content', text: 'export declare function useChat<Tools extends ' },
  {
    kind: 'Reference',
    text: 'Chat.AnyTool',
    canonicalReference: '@hashbrownai/react!~AnyTool:type',
  },
  { kind: 'Content', text: '>(options: ' },
  {
    kind: 'Reference',
    text: 'UseChatOptions',
    canonicalReference: '@hashbrownai/react!UseChatOptions:interface',
  },
  { kind: 'Content', text: '): void;' },
];

test('joins excerpt tokens without export keywords and records reference ranges', () => {
  const excerpt = excerptFromTokens(tokens);

  expect(excerpt.code).toBe(
    'function useChat<Tools extends Chat.AnyTool>(options: UseChatOptions): void;',
  );
  expect(excerpt.ranges.map((r) => excerpt.code.slice(r.start, r.end))).toEqual(
    ['Chat.AnyTool', 'UseChatOptions'],
  );
  expect(excerpt.ranges[1].reference).toBe(
    '@hashbrownai/react!UseChatOptions:interface',
  );
});

test('rewrites export type and export interface like the Angular excerpt', () => {
  const excerpt = excerptFromTokens([
    { kind: 'Content', text: 'export type A = 1; ' },
    { kind: 'Content', text: 'export interface B' },
  ]);

  expect(excerpt.code).toBe('type A = 1; interface B');
});

test('maps overlay tokens onto the formatted content, trimming padded references', () => {
  const formatted = 'function f(\n  options:  UseChatOptions <T>,\n): void;';

  const excerpt = excerptFromFormattedContent(formatted, [
    { kind: 'Content', text: 'function f(\n  options: ' },
    {
      kind: 'Reference',
      text: ' UseChatOptions',
      canonicalReference: '@hashbrownai/react!UseChatOptions:interface',
    },
    { kind: 'Content', text: ' <T>,\n): void;' },
  ]);

  expect(excerpt.code).toBe(formatted);
  expect(excerpt.ranges.map((r) => excerpt.code.slice(r.start, r.end))).toEqual(
    ['UseChatOptions'],
  );
});

test('ignores overlay tokens that do not spell the formatted content', () => {
  const excerpt = excerptFromFormattedContent('const a: B;', [
    { kind: 'Content', text: 'something else' },
  ]);

  expect(excerpt).toEqual({ code: 'const a: B;', ranges: [] });
});

test('splits highlighted tokens at reference boundaries', () => {
  const lines = [
    [
      { content: 'x: ', offset: 0, color: '#fff' },
      { content: 'Chat', offset: 3, color: '#f00' },
      { content: '.AnyTool;', offset: 7, color: '#0f0' },
    ],
  ];

  const segmented = segmentLines(lines, [
    { start: 3, end: 15, reference: 'ref' },
  ]);

  expect(segmented).toEqual([
    [
      {
        text: 'x: ',
        color: '#fff',
        fontStyle: undefined,
        reference: undefined,
      },
      { text: 'Chat', color: '#f00', fontStyle: undefined, reference: 'ref' },
      {
        text: '.AnyTool',
        color: '#0f0',
        fontStyle: undefined,
        reference: 'ref',
      },
      { text: ';', color: '#0f0', fontStyle: undefined, reference: undefined },
    ],
  ]);
});
