import { render, renderHook } from '@testing-library/react';
import { type MarkdownNode } from '@cacheplane/partial-markdown';
import { Suspense } from 'react';
import { useProseParser } from './use-prose-parser';

function findByType(
  root: MarkdownNode | null,
  type: MarkdownNode['type'],
): MarkdownNode[] {
  if (!root) {
    return [];
  }

  const descendants =
    'children' in root
      ? root.children.flatMap((child) => findByType(child, type))
      : [];
  return root.type === type ? [root, ...descendants] : descendants;
}

test('useProseParser parses prefix updates incrementally', () => {
  const { result, rerender } = renderHook(
    ({ text }) => useProseParser(text),
    {
      initialProps: {
        text: 'first\n\nsecond',
      },
    },
  );

  const firstParagraphBefore = result.current.rootNode?.children[0];

  rerender({
    text: 'first\n\nsecond line',
  });

  const firstParagraphAfter = result.current.rootNode?.children[0];

  expect(firstParagraphBefore).toBeDefined();
  expect(firstParagraphAfter).toBe(firstParagraphBefore);
});

test('useProseParser preserves resolved node identity across prefix updates', () => {
  const { result, rerender } = renderHook(
    ({ text }) => useProseParser(text),
    {
      initialProps: {
        text: 'first\n\nsecond',
      },
    },
  );
  const firstParagraphBefore = result.current.rootNode?.children[0];

  rerender({
    text: 'first\n\nsecond line',
  });

  const firstParagraphAfter = result.current.rootNode?.children[0];

  expect(firstParagraphBefore).toBeDefined();
  expect(firstParagraphAfter).toBe(firstParagraphBefore);
});

test('useProseParser recognizes autolinks across prefix updates', () => {
  const { result, rerender } = renderHook(
    ({ text }) => useProseParser(text),
    {
      initialProps: {
        text: 'https',
      },
    },
  );

  rerender({
    text: 'https://example.com',
  });

  const autolink = findByType(result.current.rootNode, 'autolink')[0] as
    | Extract<MarkdownNode, { type: 'autolink' }>
    | undefined;

  expect(autolink?.text).toBe('https://example.com');
  expect(autolink?.url).toBe('https://example.com');
});

test('useProseParser does not mutate committed nodes during a suspended render', () => {
  const pending = new Promise<never>(() => undefined);
  let committedRoot: MarkdownNode | null = null;

  function Probe({ text, suspend }: { text: string; suspend: boolean }) {
    const result = useProseParser(text);
    if (suspend) {
      throw pending;
    }

    committedRoot = result.rootNode;
    return null;
  }

  const view = render(
    <Suspense fallback={null}>
      <Probe text="first" suspend={false} />
    </Suspense>,
  );
  const rootBefore = committedRoot;

  view.rerender(
    <Suspense fallback={null}>
      <Probe text={'first\n\nsecond'} suspend={true} />
    </Suspense>,
  );

  const paragraphs = findByType(rootBefore, 'paragraph');

  expect(paragraphs).toHaveLength(1);
});

test('useProseParser resets when text is not a prefix update', () => {
  const { result, rerender } = renderHook(
    ({ text }) => useProseParser(text),
    {
      initialProps: {
        text: 'hello',
      },
    },
  );

  const firstRoot = result.current.rootNode;

  expect(
    findByType(firstRoot, 'text').some(
      (node) => node.type === 'text' && node.text === 'hello',
    ),
  ).toBe(true);

  rerender({
    text: 'yo',
  });

  const nextRoot = result.current.rootNode;

  expect(
    findByType(nextRoot, 'text').some(
      (node) => node.type === 'text' && node.text === 'yo',
    ),
  ).toBe(true);
});

test('useProseParser finalizes when complete flag is enabled', () => {
  const { result, rerender } = renderHook(
    ({ isComplete }) =>
      useProseParser('```ts\nconst a = 1;', undefined, isComplete),
    {
      initialProps: {
        isComplete: false,
      },
    },
  );

  const openFenceBefore = findByType(result.current.rootNode, 'code-block')[0];
  const statusBefore = openFenceBefore?.status;

  rerender({ isComplete: true });

  const openFenceAfter = findByType(result.current.rootNode, 'code-block')[0];

  expect(statusBefore).not.toBe('complete');
  expect(openFenceAfter?.status).toBe('complete');
  expect(result.current.isComplete).toBe(true);
});

test('useProseParser preserves unchanged node identity when complete flag toggles', () => {
  const { result, rerender } = renderHook(
    ({ isComplete }) =>
      useProseParser('first\n\nsecond', undefined, isComplete),
    {
      initialProps: {
        isComplete: false,
      },
    },
  );

  const firstParagraphBefore = result.current.rootNode?.children[0];

  rerender({ isComplete: true });

  const firstParagraphAfter = result.current.rootNode?.children[0];

  expect(firstParagraphBefore).toBeDefined();
  expect(firstParagraphAfter).toBe(firstParagraphBefore);
});
