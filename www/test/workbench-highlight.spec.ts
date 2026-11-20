// @vitest-environment jsdom
import { expect, test } from 'vitest';
import {
  renderWorkbenchCode,
  renderWorkbenchFreshJson,
  tokenizeJson,
  tokenizeMarkdown,
  workbenchCodeLanguage,
} from '../examples/quickstart/runtime/workbench-highlight';

const kinds = (tokens: readonly { kind: string; text: string }[]) =>
  tokens
    .filter((token) => token.kind !== 'plain')
    .map((token) => [token.kind, token.text]);

test('tokenizes JSON keys, values and punctuation', () => {
  const source =
    '{"title": "Plan", "steps": [1, -2.5e3], "done": true, "x": null}';

  const tokens = tokenizeJson(source);

  expect(kinds(tokens)).toEqual([
    ['punct', '{'],
    ['key', '"title"'],
    ['punct', ':'],
    ['string', '"Plan"'],
    ['punct', ','],
    ['key', '"steps"'],
    ['punct', ':'],
    ['punct', '['],
    ['number', '1'],
    ['punct', ','],
    ['number', '-2.5e3'],
    ['punct', ']'],
    ['punct', ','],
    ['key', '"done"'],
    ['punct', ':'],
    ['literal', 'true'],
    ['punct', ','],
    ['key', '"x"'],
    ['punct', ':'],
    ['literal', 'null'],
    ['punct', '}'],
  ]);
});

test('keeps escaped quotes inside one string token', () => {
  const tokens = tokenizeJson('["say \\"hi\\"", "a\\\\"]');

  expect(kinds(tokens)).toEqual([
    ['punct', '['],
    ['string', '"say \\"hi\\""'],
    ['punct', ','],
    ['string', '"a\\\\"'],
    ['punct', ']'],
  ]);
});

test('tokenizes partial streaming JSON without losing text', () => {
  const partial = '{"ui":[{"SummaryCard":{"props":{"title":"Show mod';

  const tokens = tokenizeJson(partial);

  expect(tokens.map((token) => token.text).join('')).toBe(partial);
  expect(tokens.at(-1)).toEqual({ kind: 'string', text: '"Show mod' });
  expect(kinds(tokenizeJson('{"done": tru'))).toEqual([
    ['punct', '{'],
    ['key', '"done"'],
    ['punct', ':'],
    ['literal', 'tru'],
  ]);
});

test('round-trips any input exactly', () => {
  for (const source of [
    '',
    'not json at all',
    '{"a": [1, 2,',
    '  {\n  "nested": {"k": "v"}\n}\n',
    '{"a": @}',
  ]) {
    expect(
      tokenizeJson(source)
        .map((token) => token.text)
        .join(''),
    ).toBe(source);
    expect(
      tokenizeMarkdown(source)
        .map((token) => token.text)
        .join(''),
    ).toBe(source);
  }
});

test('tokenizes Markdown structure and inline marks', () => {
  const source =
    '# Plan\n\n*The plan* has **two** steps:\n\n1. Outline `demo`.\n- Read [docs](https://hashbrown.dev)[^1].\n\n[^1]: https://hashbrown.dev';

  const tokens = tokenizeMarkdown(source);

  expect(tokens.map((token) => token.text).join('')).toBe(source);
  expect(kinds(tokens)).toEqual([
    ['heading', '# Plan'],
    ['emphasis', '*The plan*'],
    ['emphasis', '**two**'],
    ['marker', '1.'],
    ['code', '`demo`'],
    ['marker', '-'],
    ['link', '[docs](https://hashbrown.dev)'],
    ['link', '[^1]'],
    ['link', '[^1]:'],
  ]);
});

test('chooses a language from the value and tab', () => {
  expect(workbenchCodeLanguage({ a: 1 }, 'JSON')).toBe('json');
  expect(workbenchCodeLanguage('{"ui": [', 'JSON')).toBe('json');
  expect(workbenchCodeLanguage('  [1, 2]', 'Requests')).toBe('json');
  expect(workbenchCodeLanguage('# Heading', 'Markdown')).toBe('markdown');
  expect(workbenchCodeLanguage('Waiting for model output', 'JSON')).toBe(
    'text',
  );
  expect(workbenchCodeLanguage('Plain assistant reply', 'Text')).toBe('text');
});

test('renders tokens as spans that keep the exact text', () => {
  const source = '{"title": "Plan", "count": 2}';

  const fragment = renderWorkbenchCode(source, 'json');
  const host = document.createElement('pre');
  host.append(fragment);

  expect(host.textContent).toBe(source);
  expect(host.querySelector('.wb-tok-key')?.textContent).toBe('"title"');
  expect(host.querySelector('.wb-tok-string')?.textContent).toBe('"Plan"');
  expect(host.querySelector('.wb-tok-number')?.textContent).toBe('2');
  expect(host.querySelectorAll('span:not([class^="wb-tok-"])')).toHaveLength(0);
  expect(renderWorkbenchCode('plain words', 'text').childNodes).toHaveLength(1);
});

test('the fresh suffix is marked and the text is unchanged', () => {
  const value = { steps: ['Outline', 'Record the'] };

  const fragment = renderWorkbenchFreshJson(value, {
    path: 'steps.1',
    text: 'ord the',
  });

  expect(fragment.textContent).toBe(JSON.stringify(value, null, 2));
  expect(fragment.querySelector('mark.wb-fresh')!.textContent).toBe('ord the');
});

test('no fresh text renders no mark', () => {
  const value = { a: 'b' };

  const fragment = renderWorkbenchFreshJson(value, null);

  expect(fragment.querySelector('mark')).toBeNull();
  expect(fragment.textContent).toBe(JSON.stringify(value, null, 2));
});

test('empty fresh text or an unknown path renders no mark', () => {
  const value = { a: 'b' };

  const empty = renderWorkbenchFreshJson(value, { path: 'a', text: '' });
  const missing = renderWorkbenchFreshJson(value, { path: 'z', text: 'b' });

  expect(empty.querySelector('mark')).toBeNull();
  expect(missing.querySelector('mark')).toBeNull();
});

test('text with quotes and escapes is marked correctly', () => {
  const value = { note: 'a say "hi"\n' };

  const fragment = renderWorkbenchFreshJson(value, {
    path: 'note',
    text: 'say "hi"\n',
  });

  expect(fragment.textContent).toBe(JSON.stringify(value, null, 2));
  expect(fragment.querySelector('mark.wb-fresh')!.textContent).toBe(
    'say \\"hi\\"\\n',
  );
});

test('a settling mark carries the settle class', () => {
  const value = { a: 'Hello' };

  const fragment = renderWorkbenchFreshJson(
    value,
    { path: 'a', text: 'llo' },
    { settle: true },
  );

  const mark = fragment.querySelector('mark')!;
  expect(mark.className).toBe('wb-fresh wb-fresh-settle');
  expect(mark.textContent).toBe('llo');
});
