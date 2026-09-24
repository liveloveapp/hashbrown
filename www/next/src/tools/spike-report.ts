/**
 * Spike report: which custom elements the Next.js site renders, and whether
 * every public URL of the Analog site was prerendered. Run after a build:
 * `npx nx build www-next && npx nx run www-next:spike-report`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listBlogPosts, listDocs, readDoc, SDKS } from '../lib/content';
import { customElementsIn } from '../lib/element-inventory';
import { repoRoot } from '../lib/repo-root';

const root = repoRoot();
const appDir = join(root, 'www/next/.next/server/app');

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? htmlFiles(join(dir, entry.name))
      : entry.name.endsWith('.html')
        ? [join(dir, entry.name)]
        : [],
  );
}

// 1. Custom elements used by docs and blog markdown, and whether the build
//    rendered them with a component or as an unported placeholder.
const used: Record<string, number> = {};
const add = (counts: Record<string, number>) => {
  for (const [name, n] of Object.entries(counts)) {
    used[name] = (used[name] ?? 0) + n;
  }
};
for (const sdk of SDKS) {
  for (const slug of listDocs(sdk)) {
    add(customElementsIn(readDoc(sdk, slug)?.body ?? ''));
  }
}
for (const post of listBlogPosts()) {
  add(customElementsIn(post.body));
}
const unported = new Set<string>();
for (const file of htmlFiles(appDir)) {
  for (const match of readFileSync(file, 'utf-8').matchAll(
    /data-unported="([a-z-]+)"/g,
  )) {
    unported.add(match[1]);
  }
}
console.log('Custom elements in docs + blog markdown:');
for (const [name, n] of Object.entries(used).sort((a, b) => b[1] - a[1])) {
  const status = unported.has(name) ? 'MISSING' : 'ported ';
  console.log(`  ${status}  ${name.padEnd(26)} ${n}`);
}

// 2. Route parity against sources independent of the Next loaders.
const manifest = JSON.parse(
  readFileSync(join(root, 'www/next/.next/prerender-manifest.json'), 'utf-8'),
) as { routes: Record<string, unknown> };
const built = new Set(Object.keys(manifest.routes));

const llms = readFileSync(join(root, 'www/analog/public/llms.txt'), 'utf-8');
const llmsDocs = [
  ...new Set(
    [...llms.matchAll(/https:\/\/hashbrown\.dev(\/docs\/[^)\s]+)/g)].map((m) =>
      m[1].replace(/\.md$/, ''),
    ),
  ),
];
const report = JSON.parse(
  readFileSync(
    join(root, 'www/analog/src/app/reference/api-report.min.json'),
    'utf-8',
  ),
) as { packages: Record<string, { symbols: Record<string, unknown> }> };
const apiRoutes = Object.entries(report.packages).flatMap(([pkg, api]) =>
  Object.keys(api.symbols).map(
    (symbol) => `/api/${pkg.replace('@hashbrownai/', '')}/${symbol}`,
  ),
);
const blogDir = join(root, 'www/analog/src/content/blog');
const blogRoutes = [
  '/blog',
  ...readdirSync(blogDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => `/blog/${f.replace(/\.md$/, '')}`),
];

const pagesDir = join(root, 'www/analog/src/app/pages');
const otherRoutes = [
  '/',
  '/api',
  ...readdirSync(join(pagesDir, 'samples'))
    .filter((f) => f.endsWith('.page.ts'))
    .map((f) => f.replace(/\.page\.ts$/, ''))
    .map((name) => (name === 'index' ? '/samples' : `/samples/${name}`)),
];

console.log('\nRoute parity (source → prerendered by Next):');
for (const [label, routes] of [
  ['docs (llms.txt)', llmsDocs],
  ['api (api-report.min.json)', apiRoutes],
  ['blog (content files)', blogRoutes],
  ['home, api index, samples', otherRoutes],
] as const) {
  const missing = routes.filter((route) => !built.has(route));
  console.log(
    `  ${label.padEnd(28)} ${routes.length - missing.length}/${routes.length}`,
  );
  missing.forEach((route) => console.log(`    missing ${route}`));
}
const docsBuilt = [...built].filter((r) => r.startsWith('/docs/'));
const extra = docsBuilt.filter((r) => !llmsDocs.includes(r));
if (extra.length) {
  console.log(`  docs prerendered but not in llms.txt: ${extra.join(', ')}`);
}
