import { expect, test } from 'vitest';
import {
  getSiteHighlighter,
  highlightSample,
  renderHomeCodeModule,
} from './highlight-code';

test('highlights a sample with the hashbrown theme', async () => {
  const highlighter = await getSiteHighlighter();

  const html = highlightSample(highlighter, {
    code: 'const a = 1;',
    lang: 'typescript',
  });

  expect(html.startsWith('<pre class="shiki hashbrown"')).toBe(true);
  expect(new Set(html.match(/color:#[0-9A-Fa-f]{6}/g)).size).toBeGreaterThan(1);
});

test('escapes markup inside code', async () => {
  const highlighter = await getSiteHighlighter();

  const html = highlightSample(highlighter, {
    code: '<b>hi</b>',
    lang: 'html',
  });

  expect(html).not.toContain('<b>hi</b>');
});

test('builds a module keyed by framework', () => {
  const fake = { codeToHtml: (code: string) => `<x>${code}</x>` };

  const source = renderHomeCodeModule(fake, {
    HERO_CODE: { react: { code: 'r' }, angular: { code: 'a' } },
    STEPS: { react: [{ code: 'r1' }], angular: [{ code: 'a1' }] },
  });

  expect(source).toBe(
    'export const HOME_CODE_HTML = {"hero":{"react":"<x>r</x>","angular":"<x>a</x>"},"steps":{"react":["<x>r1</x>"],"angular":["<x>a1</x>"]}};',
  );
});
