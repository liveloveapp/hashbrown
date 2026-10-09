import { expect, test } from 'vitest';
import { loadCardFonts, svgDataUri } from '../../src/lib/og/assets';

/** Table tags from a TrueType table directory. */
function tableTags(data: ArrayBuffer): string[] {
  const view = new DataView(data);
  const numTables = view.getUint16(4);
  return Array.from({ length: numTables }, (_, i) =>
    String.fromCharCode(...new Uint8Array(data, 12 + i * 16, 4)),
  );
}

test('loads the three card faces as static fonts', async () => {
  const fonts = await loadCardFonts();

  expect(fonts.map(({ name, weight }) => `${name} ${weight}`)).toEqual([
    'Hanken Grotesk 400',
    'Hanken Grotesk 600',
    'JetBrains Mono 400',
  ]);
  for (const font of fonts) {
    expect(tableTags(font.data)).not.toContain('fvar');
  }
});

test('embeds the logos as SVG data URIs', () => {
  const uri = svgDataUri('lla-mark');

  expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
  expect(Buffer.from(uri.split(',')[1], 'base64').toString()).toContain(
    'viewBox="0 0 320 120"',
  );
});
