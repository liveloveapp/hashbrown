import { expect, test } from 'vitest';

import { escapeLittleText } from './little.ts';

test('escapeLittleText leaves plain text alone', () => {
  expect(escapeLittleText("It's simple → AG-UI.\n\nNew line.")).toBe(
    "It's simple → AG-UI.\n\nNew line.",
  );
});

test('escapeLittleText escapes every reserved character', () => {
  expect(escapeLittleText('|{}@[]()<>\\*_~')).toBe(
    '\\|\\{\\}\\@\\[\\]\\(\\)\\<\\>\\\\\\*\\_\\~',
  );
});

test('escapeLittleText escapes parentheses that would otherwise truncate a post', () => {
  expect(
    escapeLittleText('streams work (text, tool calls, and state) live'),
  ).toBe('streams work \\(text, tool calls, and state\\) live');
});

test('escapeLittleText keeps hashtags live and escapes a stray #', () => {
  expect(escapeLittleText('#Angular and item # 2')).toBe(
    '#Angular and item \\# 2',
  );
});

test('escapeLittleText escapes underscores in URLs', () => {
  expect(escapeLittleText('https://hashbrown.dev/?utm_source=x')).toBe(
    'https://hashbrown.dev/?utm\\_source=x',
  );
});
