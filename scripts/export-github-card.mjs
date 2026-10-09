/**
 * Save the GitHub social preview from the site's /github-card route.
 *
 *   node scripts/export-github-card.mjs [--origin http://localhost:3000]
 *
 * Defaults to production. Then upload the file at
 * github.com/liveloveapp/hashbrown → Settings → General → Social preview.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const flag = process.argv.indexOf('--origin');
const origin = flag === -1 ? 'https://hashbrown.dev' : process.argv[flag + 1];
const out = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../docs/brand/github-social-preview.png',
);

const response = await fetch(`${origin}/github-card`);
if (!response.ok || response.headers.get('content-type') !== 'image/png') {
  console.error(
    `${origin}/github-card: ${response.status} ${response.headers.get('content-type')}`,
  );
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(await response.arrayBuffer()));
console.log(`Wrote ${out}`);
console.log(
  'Upload it at https://github.com/liveloveapp/hashbrown/settings → Social preview → Edit.',
);
