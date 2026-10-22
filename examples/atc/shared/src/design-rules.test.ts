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
    if (entry.isDirectory()) {
      walk(path, pattern, out);
    } else if (
      pattern.test(entry.name) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name)
    ) {
      out.push(path);
    }
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

/** Shared source files (not tests, not styles), comments stripped. */
const sharedSources = walk(join(ATC, 'shared', 'src'), /\.ts$/)
  .filter((path) => !path.includes(join('shared', 'src', 'styles')))
  .map((path) => ({
    file: relative(ATC, path),
    source: stripComments(readFileSync(path, 'utf8')),
  }));

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

/**
 * The one allowed gradient: a `linear-gradient` inside the rule for exactly
 * `.atc-shimmer`, the loading shimmer on the assistant's working text: a sweep
 * across text needs a gradient clipped to it. Only a rule whose whole
 * selector is `.atc-shimmer` (at the start of the source or after another
 * rule or block opens) is exempt; a selector list or descendant selector that
 * includes it, any other selector, or a shadow inside that rule still fails.
 */
function allowShimmerGradient(source: string): string {
  return source.replace(/(^|[{}])\s*\.atc-shimmer\s*\{[^}]*\}/g, (rule) =>
    rule.replace(/linear-gradient\s*\(/g, 'shimmer-sweep('),
  );
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
    allowShimmerGradient(s).match(
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
    '.atc-card { background: linear-gradient(red, blue); }',
    '.atc-shimmer-wide { background: linear-gradient(red, blue); }',
    '.atc-shimmer { box-shadow: 0 0 2px red; }',
    '.atc-shimmer:hover { background: linear-gradient(red, blue); }',
    '.atc-card, .atc-shimmer { background: linear-gradient(red, blue); }',
    '.foo .atc-shimmer { background: linear-gradient(red, blue); }',
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
  "title: 'Seattle-Tacoma and F-16'",
  '.atc-shimmer { background: linear-gradient(90deg, #52525b, #0d0d0d); }',
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

test('the shared sources have no em or en dashes', () => {
  const offenders = sharedSources.flatMap(({ file, source }) =>
    (source.match(/[—–]/g) ?? []).map(() => file),
  );

  expect(offenders).toEqual([]);
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

/** The chart hexes: the two inks, the two airspace bands and the diagram. */
const CHART_HEX = /#086ca8|#76334f|#3288b5|#a6768e|#cfcfcf|#955101/i;
/** Chart colours and tokens, allowed only where chart features are drawn. */
const CHART_COLOUR = new RegExp(
  `${CHART_HEX.source}|--atc-chart-|--atc-diagram-`,
  'i',
);
/** Where chart colours may appear: chart.css and the chart modules. */
const CHART_ALLOWED = ['shared/src/styles/chart.css', 'shared/src/map/chart/'];

test('chart colours stay on the map', () => {
  const sources = [...files, ...sharedSources];

  const offenders = sources
    .filter(
      ({ file }) => !CHART_ALLOWED.some((allowed) => file.startsWith(allowed)),
    )
    .filter(({ source }) => CHART_COLOUR.test(source));

  expect(offenders.map(({ file }) => file)).toEqual([]);
});

/** Files other than chart.css that use a chart hex. */
function chartHexOffenders(
  sources: readonly { file: string; source: string }[],
): string[] {
  return sources
    .filter(({ file }) => file !== 'shared/src/styles/chart.css')
    .filter(({ source }) => CHART_HEX.test(source))
    .map(({ file }) => file);
}

test('chart hexes are defined only in chart.css', () => {
  const sources = [...files, ...sharedSources];

  const offenders = chartHexOffenders(sources);

  expect(offenders).toEqual([]);
});

test('an airspace band hex outside chart.css fails the hex rule', () => {
  const sources = [
    { file: 'shared/src/styles/chart.css', source: ':root { --a: #3288b5; }' },
    { file: 'shared/src/styles/map.css', source: '.x { stroke: #3288B5; }' },
    { file: 'shared/src/styles/cards.css', source: '.y { color: #A6768E; }' },
  ];

  const offenders = chartHexOffenders(sources);

  expect(offenders).toEqual([
    'shared/src/styles/map.css',
    'shared/src/styles/cards.css',
  ]);
});

/** A stylesheet partial's source. */
function readStyle(name: string): string {
  return readFileSync(join(ATC, 'shared', 'src', 'styles', name), 'utf8');
}

test('the ink data block has a flat surface background and no depth', () => {
  const css = readStyle('chart.css');

  const rule = /\.atc-map \.atc-apt-block \{([^}]*)\}/.exec(css)?.[1] ?? '';

  expect(rule).toMatch(/background:\s*var\(--atc-surface\)/);
  expect(rule).not.toMatch(/shadow|border(?!-radius)|blur/);
});

test('a dimmed airspace label fades to 0.3, like its shelf', () => {
  const css = readStyle('chart.css');

  const rule =
    /\.atc-map \.atc-as-label\.is-dimmed \{([^}]*)\}/.exec(css)?.[1] ?? '';

  expect(rule).toMatch(/opacity:\s*0\.3;/);
});

test('a marker with a visible tag stacks above untagged markers and below the hovered and selected tiers', () => {
  const css = readStyle('markers.css');
  const rule = css.match(/\.atc-plane-icon:has\(\.is-tagged\)\s*\{([^}]*)\}/);

  const zIndex = Number(rule?.[1]?.match(/z-index:\s*(\d+)/)?.[1]);

  expect(zIndex).toBeGreaterThan(0);
  expect(zIndex).toBeLessThan(10001);
});

/** The declarations of the chart.css rule with exactly this selector list. */
function chartRule(selectors: string): string {
  const css = readStyle('chart.css');
  const escaped = selectors
    .replace(/[.[\]()]/g, '\\$&')
    .replace(/,\s*/g, ',\\s*');
  return (
    new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(
      css,
    )?.[1] ?? ''
  );
}

test('the highlight casing is cobalt at 0.45 and butt-capped', () => {
  const rule = chartRule('.atc-map .atc-as-casing');

  expect(rule).toMatch(/stroke:\s*var\(--atc-accent\)/);
  expect(rule).toMatch(/stroke-opacity:\s*0\.45;/);
  expect(rule).toMatch(/stroke-linecap:\s*butt/);
});

/** The declarations of the chart.css rule whose selector list includes `selector`. */
function chartRuleWith(selector: string): string {
  const rules = stripComments(readStyle('chart.css')).matchAll(
    /([^{}]+)\{([^{}]*)\}/g,
  );
  for (const [, selectors = '', body = ''] of rules) {
    if (selectors.split(',').some((item) => item.trim() === selector)) {
      return body;
    }
  }
  return '';
}

/** A property's value in a rule's declarations, or '' when it is not set. */
function declared(rule: string, property: string): string {
  return (
    new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+);`).exec(rule)?.[1] ?? ''
  ).trim();
}

/** A shelf or casing stroke: the overview rule's value, else the base rule's. */
function stroke(
  element: string,
  shelf: string,
  overview: boolean,
  property: string,
): string {
  const rules = [
    ...(overview
      ? [`.atc-map[data-zoom-overview] .${element}.is-${shelf}`]
      : []),
    `.atc-map .${element}.is-${shelf}`,
    `.atc-map .${element}`,
  ];
  return (
    rules
      .map((selector) => declared(chartRuleWith(selector), property))
      .find((value) => value !== '') ?? ''
  );
}

test('the casing is 2 px wider than its shelf and keeps the shelf dashes', () => {
  const cases = ['b', 'c', 'd', 'e2', 'e3', 'e4'].flatMap((shelf) =>
    [false, true].map((overview) => ({ shelf, overview })),
  );

  const strokes = cases.map(({ shelf, overview }) => ({
    shelf,
    overview,
    width: parseFloat(stroke('atc-as', shelf, overview, 'stroke-width')),
    casingWidth: parseFloat(
      stroke('atc-as-casing', shelf, overview, 'stroke-width'),
    ),
    dashes: stroke('atc-as', shelf, overview, 'stroke-dasharray'),
    casingDashes: stroke('atc-as-casing', shelf, overview, 'stroke-dasharray'),
  }));

  const broken = strokes.filter(
    ({ width, casingWidth, dashes, casingDashes }) =>
      !(width > 0 && casingWidth === width + 2) ||
      dashes === '' ||
      casingDashes !== dashes,
  );

  expect(strokes).toHaveLength(12);
  expect(broken).toEqual([]);
});

test('atc.css imports the rail and the dev drawer in cascade order, and no stream panel', () => {
  const css = readFileSync(
    join(ATC, 'shared', 'src', 'styles', 'atc.css'),
    'utf8',
  );

  const imports = [...css.matchAll(/@import '\.\/([\w-]+)\.css'/g)].map(
    (match) => match[1],
  );

  expect(imports).toContain('rail');
  expect(imports).toContain('dev-drawer');
  expect(imports.indexOf('rail')).toBeGreaterThan(imports.indexOf('shell'));
  expect(imports.indexOf('dev-drawer')).toBeGreaterThan(
    imports.indexOf('rail'),
  );
  expect(imports.indexOf('dev-drawer')).toBeLessThan(imports.indexOf('sheet'));
  expect(imports).not.toContain('stream-panel');
  expect(readdirSync(join(ATC, 'shared', 'src', 'styles'))).not.toContain(
    'stream-panel.css',
  );
  // The narrow header rules it held moved to the phone partial.
  expect(readStyle('sheet.css')).toContain('.atc-credit-lead');
});
