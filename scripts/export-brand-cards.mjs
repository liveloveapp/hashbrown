/**
 * Save the site's share cards to docs/brand for use outside the site.
 *
 *   node scripts/export-brand-cards.mjs [--origin http://localhost:3000]
 *
 * Defaults to production. The GitHub card then needs uploading by hand at
 * github.com/liveloveapp/hashbrown → Settings → General → Social preview.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const flag = process.argv.indexOf('--origin');
const origin = flag === -1 ? 'https://hashbrown.dev' : process.argv[flag + 1];
const outDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../docs/brand',
);

const CARDS = [
  { path: '/github-card', file: 'github-social-preview.png' },
  { path: '/opengraph-image', file: 'open-graph-card.png' },
  { path: '/square-card', file: 'square-card.png' },
];

mkdirSync(outDir, { recursive: true });
let failed = false;
for (const { path, file } of CARDS) {
  const response = await fetch(`${origin}${path}`);
  if (!response.ok || response.headers.get('content-type') !== 'image/png') {
    console.error(
      `${origin}${path}: ${response.status} ${response.headers.get('content-type')}`,
    );
    failed = true;
    continue;
  }
  const out = resolve(outDir, file);
  writeFileSync(out, Buffer.from(await response.arrayBuffer()));
  console.log(`Wrote ${out}`);
}
if (failed) {
  process.exit(1);
}
console.log(
  'Upload github-social-preview.png at https://github.com/liveloveapp/hashbrown/settings → Social preview → Edit.',
);
