import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { documentedEvents, EVENT_NAME_PATTERN } from './telemetry-contract.ts';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const TAXONOMY_PATH = join(REPO_ROOT, 'docs', 'growth', 'taxonomy.md');
const EVENTS_MODULE = join(
  REPO_ROOT,
  'www',
  'src',
  'lib',
  'analytics',
  'events.ts',
);
const SCAN_ROOTS = [
  'www/src',
  'www/instrumentation-client.ts',
  'www/src/middleware.ts',
];

/** Literal event names passed to a capture call, an `event:` field, or an `*_EVENT` constant. */
const LITERAL_PATTERNS: RegExp[] = [
  /posthog\.capture\(\s*['"`]([^'"`]+)['"`]/g,
  /\btrack\(\s*['"`]([^'"`]+)['"`]/g,
  /\bevent:\s*['"`]([^'"`]+)['"`]/g,
  /\b[A-Z][A-Z0-9_]*_EVENT\s*=\s*['"`]([^'"`]+)['"`]/g,
];
const ANALYTICS_EVENTS_REFERENCE = /analyticsEvents\.([A-Za-z]+)/g;

async function sourceFiles(path: string): Promise<string[]> {
  const info = await stat(path);
  if (info.isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter(
        (entry) => !['node_modules', '.next', 'dist'].includes(entry.name),
      )
      .map(async (entry) => {
        const full = join(path, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.(ts|tsx)$/.test(entry.name) &&
          !/\.spec\.tsx?$/.test(entry.name)
          ? [full]
          : [];
      }),
  );
  return nested.flat();
}

async function analyticsEventAliases(): Promise<Map<string, string>> {
  const body = await readFile(EVENTS_MODULE, 'utf8');
  const block = /export const analyticsEvents = \{([\s\S]*?)\} as const;/.exec(
    body,
  );
  if (!block)
    throw new Error('analyticsEvents object not found in www events.ts');
  return new Map(
    [...block[1].matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]),
  );
}

async function eventsFiredInWww(): Promise<Set<string>> {
  const aliases = await analyticsEventAliases();
  const files = new Set(
    (
      await Promise.all(
        SCAN_ROOTS.map((root) => sourceFiles(join(REPO_ROOT, root))),
      )
    ).flat(),
  );
  const fired = new Set<string>();
  for (const file of files) {
    const body = await readFile(file, 'utf8');
    for (const pattern of LITERAL_PATTERNS) {
      for (const match of body.matchAll(pattern)) {
        if (EVENT_NAME_PATTERN.test(match[1])) fired.add(match[1]);
      }
    }
    for (const match of body.matchAll(ANALYTICS_EVENTS_REFERENCE)) {
      const resolved = aliases.get(match[1]);
      if (resolved === undefined)
        throw new Error(`${file}: analyticsEvents.${match[1]} is not declared`);
      fired.add(resolved);
    }
  }
  return fired;
}

test('every event fired in www is in the taxonomy', async () => {
  const taxonomy = await readFile(TAXONOMY_PATH, 'utf8');

  const fired = await eventsFiredInWww();
  const documented = documentedEvents(taxonomy);

  // Guards against a scan that silently finds nothing.
  expect([...fired].sort()).toEqual(
    expect.arrayContaining([
      'docs:code_copied',
      'docs:page_viewed',
      'marketing:ai_crawler_visit',
      'marketing:ai_referral_visit',
      'marketing:cta_click',
      'marketing:engaged_time',
      'marketing:pre_analytics_exit',
      'marketing:threadplane_cta_click',
    ]),
  );
  expect([...fired].filter((event) => !documented.has(event)).sort()).toEqual(
    [],
  );
});

test('every declared website event is in the taxonomy, including ones not fired yet', async () => {
  const taxonomy = await readFile(TAXONOMY_PATH, 'utf8');

  const declared = [...(await analyticsEventAliases()).values()];
  const documented = documentedEvents(taxonomy);

  expect(declared).toContain('marketing:unstuck_form_submit');
  expect(declared.filter((event) => !documented.has(event)).sort()).toEqual([]);
});
