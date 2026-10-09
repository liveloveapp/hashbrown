import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { repoRoot } from '../repo-root';

/** A font face in the shape `ImageResponse` takes. */
export interface CardFont {
  name: 'Hanken Grotesk' | 'JetBrains Mono';
  data: ArrayBuffer;
  weight: 400 | 600;
  style: 'normal';
}

/** The logos a card can show. */
export type CardLogo = 'hashbrown-mark' | 'hashbrown-wordmark' | 'lla-mark';

const LOGO_FILES: Record<CardLogo, string> = {
  'hashbrown-mark': 'www/public/image/logo/brand-mark.svg',
  'hashbrown-wordmark': 'www/public/image/logo/word-mark.svg',
  'lla-mark': 'www/src/lib/og/lla-mark.svg',
};

async function readFont(file: string): Promise<ArrayBuffer> {
  const buf = await readFile(join(repoRoot(), 'www/src/lib/og/fonts', file));
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

/**
 * Read the card faces: Hanken Grotesk 400 and 600 for text, JetBrains Mono 400
 * for code. Cards are prerendered, so this runs at build time only.
 */
export async function loadCardFonts(): Promise<CardFont[]> {
  const [regular, semibold, mono] = await Promise.all([
    readFont('HankenGrotesk-Regular.ttf'),
    readFont('HankenGrotesk-SemiBold.ttf'),
    readFont('JetBrainsMono-Regular.ttf'),
  ]);
  return [
    { name: 'Hanken Grotesk', data: regular, weight: 400, style: 'normal' },
    { name: 'Hanken Grotesk', data: semibold, weight: 600, style: 'normal' },
    { name: 'JetBrains Mono', data: mono, weight: 400, style: 'normal' },
  ];
}

/**
 * A logo as a base64 SVG data URI, which Satori renders in an `<img>`.
 *
 * @param logo - Which logo to embed.
 */
export function svgDataUri(logo: CardLogo): string {
  const svg = readFileSync(join(repoRoot(), LOGO_FILES[logo]));
  return `data:image/svg+xml;base64,${svg.toString('base64')}`;
}
