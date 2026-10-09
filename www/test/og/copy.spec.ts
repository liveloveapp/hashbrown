import { expect, test } from 'vitest';
import { docsCardTitle, truncateAtWord } from '../../src/lib/og/copy';
import { titleSize } from '../../src/lib/og/tokens';

test('titles up to 60 characters set at 64px', () => {
  const title = 'x'.repeat(60);

  const size = titleSize(title);

  expect(size).toEqual({ fontSize: 64, lineHeight: 1.08 });
});

test('longer titles step down to 52px', () => {
  const title = 'x'.repeat(61);

  const size = titleSize(title);

  expect(size).toEqual({ fontSize: 52, lineHeight: 1.1 });
});

test('drops the SDK suffix from docs titles', () => {
  const titles = [
    'Structured Output: Hashbrown React Docs',
    'Structured Output: Hashbrown Angular Docs',
    'Magic Text in React: Streaming Markdown',
  ];

  const cardTitles = titles.map(docsCardTitle);

  expect(cardTitles).toEqual([
    'Structured Output',
    'Structured Output',
    'Magic Text in React: Streaming Markdown',
  ]);
});

test('truncates long text at a word boundary with an ellipsis', () => {
  const text = 'one two three four five';

  const short = truncateAtWord(text, 12);

  expect(short).toBe('one two…');
  expect(truncateAtWord('short', 12)).toBe('short');
});
