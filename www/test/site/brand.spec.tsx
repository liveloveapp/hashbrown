import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { BrandKit } from '../../src/components/brand/BrandKit';
import { BRAND_CARDS, BRAND_COLORS, BRAND_LOGOS } from '../../src/lib/brand';
import { repoRoot } from '../../src/lib/repo-root';

test('every logo download is a file in public', () => {
  const files = BRAND_LOGOS.map((logo) => logo.href);

  const missing = files.filter(
    (href) => !existsSync(join(repoRoot(), 'www/public', href)),
  );

  expect(missing).toEqual([]);
});

test('every card download is a static card route', () => {
  const hrefs = BRAND_CARDS.map((card) => card.href);

  expect(hrefs).toEqual(['/opengraph-image', '/github-card', '/square-card']);
});

test('every card states its own pixel size', () => {
  const formats = BRAND_CARDS.map((card) => card.format);

  const sizes = BRAND_CARDS.map((card) => `PNG · ${card.width}×${card.height}`);

  expect(formats).toEqual(sizes);
});

test('the light wordmark is the wordmark in vanilla ivory', () => {
  const read = (file: string) =>
    readFileSync(join(repoRoot(), 'www/public/image/logo', file), 'utf8');

  const light = read('word-mark-light.svg');

  expect(light).toBe(read('word-mark.svg').replaceAll('#784726', '#FAF9F0'));
});

test('every brand colour matches its site token', () => {
  const css = readFileSync(join(repoRoot(), 'www/src/app/globals.css'), 'utf8');
  const tokenHex = (token: string) => {
    const match = css.match(
      new RegExp(`--${token}: rgba\\((\\d+), (\\d+), (\\d+), 1\\);`),
    );
    return match
      ? `#${match
          .slice(1)
          .map((part) => Number(part).toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase()}`
      : undefined;
  };

  const actual = BRAND_COLORS.map((color) => [
    color.token,
    tokenHex(color.token),
  ]);

  expect(actual).toEqual(BRAND_COLORS.map((color) => [color.token, color.hex]));
});

test('the brand kit links every download', () => {
  const html = renderToStaticMarkup(<BrandKit />);

  const hrefs = [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*download/g)].map(
    (match) => match[1],
  );

  expect(hrefs).toEqual([
    ...BRAND_LOGOS.map((logo) => logo.href),
    ...BRAND_CARDS.map((card) => card.href),
  ]);
});
