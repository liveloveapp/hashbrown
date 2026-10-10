import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from 'vitest';

/*
 * LiveLoveApp's design rules, the subset a source scan can check. Comments are
 * stripped first so prose explaining a rule never trips it.
 */

/** The atc example root. */
const ATC = join(import.meta.dirname, '..', '..');
/** Where the scanned sources live: the stylesheet and both apps. */
const ROOTS = [
  { dir: join(ATC, 'shared', 'src', 'styles'), pattern: /\.css$/ },
  { dir: join(ATC, 'angular', 'src'), pattern: /\.ts$/ },
  { dir: join(ATC, 'react', 'src'), pattern: /\.tsx$/ },
];

/** Every file under `dir` matching `pattern`, skipping tests. */
function walk(dir: string, pattern: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, pattern, out);
    else if (
      pattern.test(entry.name) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name)
    )
      out.push(path);
  }
  return out;
}

/** The source without block or line comments. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[\s;{}])\/\/.*$/gm, '$1');
}

/** Every scanned file with comments stripped. */
const files = ROOTS.flatMap(({ dir, pattern }) => walk(dir, pattern)).map(
  (path) => ({
    file: relative(ATC, path),
    source: stripComments(readFileSync(path, 'utf8')),
  }),
);

/** Font names the rules allow, lowercased. */
const ALLOWED_FONTS = new Set([
  'hanken grotesk',
  'jetbrains mono',
  'sans-serif',
  'serif',
  'monospace',
  'system-ui',
  'ui-monospace',
  'inherit',
]);

/** Font names in a comma separated stack that are not on the allowed list. */
function badFonts(stack: string): string[] {
  return stack
    .split(',')
    .map((name) =>
      name
        .replace(/!important/, '')
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .toLowerCase(),
    )
    .filter(
      (name) => name && !name.startsWith('var(') && !ALLOWED_FONTS.has(name),
    );
}

/**
 * Every positive letter-spacing value in the source, from CSS
 * (`letter-spacing: 1px`) or a React inline style (`letterSpacing: '1px'`).
 */
function positiveSpacing(source: string): string[] {
  return [
    ...source.matchAll(/letter-spacing\s*:\s*([^;}]+)/g),
    ...source.matchAll(/\bletterSpacing\s*:\s*['"`]?([^'"`,}]+)/g),
  ]
    .map((match) => (match[1] ?? '').trim())
    .filter(
      (value) => /^\+?(\d+\.?\d*|\.\d+)/.test(value) && parseFloat(value) > 0,
    );
}

/** Font families named by stylesheet, custom property, shorthand or inline style. */
function fontNames(source: string): string[] {
  const stacks = [
    ...[...source.matchAll(/font-family\s*:\s*([^;}]+)/g)].map(
      (m) => m[1] ?? '',
    ),
    ...[...source.matchAll(/--[\w-]*(?:font|mono)[\w-]*\s*:\s*([^;}]+)/g)].map(
      (m) => m[1] ?? '',
    ),
    ...[...source.matchAll(/\bfont\s*:\s*([^;}]+)/g)].map((m) =>
      // shorthand: the family follows the size, e.g. `14px/1.4 Inter, sans-serif`
      (m[1] ?? '').replace(
        /^.*?\d+(?:\.\d+)?(?:px|rem|em|%|pt)(?:\/[\w.]+)?\s*/,
        '',
      ),
    ),
    ...[...source.matchAll(/\bfontFamily\s*:\s*(['"`])(.*?)\1/g)].map(
      (m) => m[2] ?? '',
    ),
  ];
  return stacks.flatMap(badFonts);
}

/** The rules, each returning the offending fragments found in a source. */
const RULES: Record<string, (source: string) => unknown[]> = {
  uppercase: (s) =>
    s.match(/\buppercase\b|text-transform\s*:\s*uppercase/g) ?? [],
  'positive letter-spacing': (s) => [
    ...positiveSpacing(s),
    ...(s.match(/tracking-(?:wide|wider|widest)\b/g) ?? []),
  ],
  'gradients, shadows and glass': (s) =>
    s.match(
      /gradient\s*\(|box-?shadow|text-?shadow|drop-?shadow|backdrop-?filter/gi,
    ) ?? [],
  'dark scheme': (s) =>
    s.match(/prefers-color-scheme\s*:\s*dark|color-scheme\s*:\s*dark/g) ?? [],
  fonts: fontNames,
  'em or en dashes': (s) => s.match(/[—–]/g) ?? [],
};

/** Snippets each rule must catch. */
const BAD: Record<string, string[]> = {
  uppercase: ['text-transform: uppercase', "className='uppercase'"],
  'positive letter-spacing': [
    'letter-spacing: 0.1em',
    'letter-spacing: 0.05em',
    'letter-spacing: 0.5px',
    'letter-spacing: .5px',
    'letter-spacing: 1px',
    "style={{ letterSpacing: '0.1em' }}",
    'style={{ letterSpacing: 2 }}',
  ],
  'gradients, shadows and glass': [
    'box-shadow: 0 1px 2px #000',
    'background: linear-gradient(red, blue)',
    'filter: drop-shadow(0 0 2px red)',
    'backdrop-filter: blur(4px)',
    "style={{ boxShadow: '0 1px 2px #000' }}",
    "style={{ textShadow: '0 0 2px red' }}",
    "style={{ backdropFilter: 'blur(4px)' }}",
    "style={{ WebkitBackdropFilter: 'blur(4px)' }}",
  ],
  'dark scheme': [
    '@media (prefers-color-scheme : dark) {}',
    '@media (prefers-color-scheme: dark) {}',
  ],
  fonts: [
    'font-family: Inter',
    "font-family: 'Segoe UI', sans-serif",
    '--atc-font: Inter, sans-serif;',
    '--atc-mono: Menlo, monospace;',
    'font: 14px/1.4 Inter, sans-serif;',
    "style={{ fontFamily: 'Arial' }}",
  ],
  'em or en dashes': ['<h3>Arrivals — Seattle</h3>', "'Seattle–Tacoma'"],
};

/** Snippets every rule must accept. */
const GOOD = [
  'letter-spacing: 0',
  'letter-spacing: -0.01em',
  "style={{ letterSpacing: '-0.01em' }}",
  'style={{ letterSpacing: 0 }}',
  "style={{ filter: 'grayscale(1)' }}",
  "style={{ border: '1px solid var(--atc-border)' }}",
  "font-family: 'Hanken Grotesk', system-ui, sans-serif;",
  "--atc-mono: 'JetBrains Mono', ui-monospace, monospace;",
  'font-family: var(--atc-font);',
  "font: 500 14px/1.4 'Hanken Grotesk', sans-serif;",
  'font: inherit;',
];

test('scans the stylesheet and both apps', () => {
  const names = files.map(({ file }) => file);

  expect(names).toContain('shared/src/styles/atc.css');
  expect(names.some((name) => name.startsWith('angular/'))).toBe(true);
  expect(names.some((name) => name.startsWith('react/'))).toBe(true);
});

test('the comment stripper keeps url(//...) and drops line comments', () => {
  const source = 'a { background: url(//x.test/a.png); } // box-shadow: none';

  const result = stripComments(source);

  expect(result).toContain('url(//x.test/a.png)');
  expect(result).not.toContain('box-shadow');
});

for (const [rule, check] of Object.entries(RULES)) {
  test(`the ${rule} rule catches known-bad snippets`, () => {
    const snippets = BAD[rule] ?? [];

    const missed = snippets.filter((snippet) => check(snippet).length === 0);

    expect(snippets.length).toBeGreaterThan(0);
    expect(missed).toEqual([]);
  });
}

test('the rules accept known-good snippets', () => {
  const found = GOOD.flatMap((snippet) =>
    Object.entries(RULES).flatMap(([rule, check]) =>
      check(snippet).length > 0 ? [`${rule}: ${snippet}`] : [],
    ),
  );

  expect(found).toEqual([]);
});

for (const [rule, check] of Object.entries(RULES)) {
  test(`the source has no ${rule}`, () => {
    const offenders = files.flatMap(({ file, source }) =>
      check(source).map((hit) => `${file}: ${String(hit)}`),
    );

    expect(offenders).toEqual([]);
  });
}
