/**
 * Route report (the site's `e2e` target): every custom element the docs and
 * blog markdown use has a component, and every public URL (docs from
 * `llms.txt`, API symbols from the API report, blog posts, and the other
 * pages the Analog site served) is prerendered. Exits non-zero on a gap.
 * Run after a build: `npx nx e2e www`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listBlogPosts, listDocs, readDoc, SDKS } from '../lib/content';
import { customElementsIn } from '../lib/element-inventory';
import { repoRoot } from '../lib/repo-root';

const root = repoRoot();
const appDir = join(root, 'www/.next/server/app');

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
let failed = false;
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
  failed ||= unported.has(name);
  console.log(`  ${status}  ${name.padEnd(26)} ${n}`);
}

// 2. Route parity against sources independent of the Next loaders.
const manifest = JSON.parse(
  readFileSync(join(root, 'www/.next/prerender-manifest.json'), 'utf-8'),
) as { routes: Record<string, unknown> };
const built = new Set(Object.keys(manifest.routes));

const llms = readFileSync(join(root, 'www/public/llms.txt'), 'utf-8');
const llmsDocs = [
  ...new Set(
    [...llms.matchAll(/https:\/\/hashbrown\.dev(\/docs\/[^)\s]+)/g)].map((m) =>
      m[1].replace(/\.md$/, ''),
    ),
  ),
];
const report = JSON.parse(
  readFileSync(
    join(root, 'www/content/reference/api-report.min.json'),
    'utf-8',
  ),
) as { packages: Record<string, { symbols: Record<string, unknown> }> };
const apiRoutes = Object.entries(report.packages).flatMap(([pkg, api]) =>
  Object.keys(api.symbols).map(
    (symbol) => `/api/${pkg.replace('@hashbrownai/', '')}/${symbol}`,
  ),
);
const blogDir = join(root, 'www/content/blog');
const blogRoutes = [
  '/blog',
  ...readdirSync(blogDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => `/blog/${f.replace(/\.md$/, '')}`),
];

// The Analog site's other routes; its page files are gone since the cutover.
// The /samples pages were retired for a redirect to the example app docs.
const otherRoutes = ['/', '/api'];

// Share cards: the default, one per blog post, one per docs page, and the
// GitHub preview. All prerender at build time.
const cardRoutes = [
  '/opengraph-image',
  '/github-card',
  ...blogRoutes
    .filter((route) => route !== '/blog')
    .map((route) => `${route}/opengraph-image`),
  ...llmsDocs.map((route) => route.replace(/^\/docs\//, '/og/docs/')),
];

console.log('\nRoute parity (source → prerendered by Next):');
for (const [label, routes] of [
  ['docs (llms.txt)', llmsDocs],
  ['api (api-report.min.json)', apiRoutes],
  ['blog (content files)', blogRoutes],
  ['home, api index', otherRoutes],
  ['share cards', cardRoutes],
] as const) {
  const missing = routes.filter((route) => !built.has(route));
  console.log(
    `  ${label.padEnd(28)} ${routes.length - missing.length}/${routes.length}`,
  );
  missing.forEach((route) => console.log(`    missing ${route}`));
  failed ||= missing.length > 0;
}

// 3. Every prerendered page ships an og:image. In Next 16 a segment that sets
//    `openGraph` without `images`, and has no `opengraph-image` in its own
//    folder, ships none.
const pages = htmlFiles(appDir).filter(
  (file) =>
    !/(^|\/)(_not-found|_global-error)(\.html|\/)/.test(
      file.slice(appDir.length),
    ),
);
const noImage = pages.filter(
  (file) => !readFileSync(file, 'utf-8').includes('<meta property="og:image"'),
);
console.log(
  `\nPages with og:image: ${pages.length - noImage.length}/${pages.length}`,
);
noImage.forEach((file) =>
  console.log(`    missing og:image ${file.slice(appDir.length)}`),
);
failed ||= noImage.length > 0;

const docsBuilt = [...built].filter((r) => r.startsWith('/docs/'));
const extra = docsBuilt.filter((r) => !llmsDocs.includes(r));
if (extra.length) {
  console.log(`  docs prerendered but not in llms.txt: ${extra.join(', ')}`);
}

if (failed) {
  console.error(
    '\nRoute report failed: see MISSING and missing entries above.',
  );
  process.exitCode = 1;
}
