import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const css = readFileSync(
  join(__dirname, '../examples/quickstart/runtime/workbench.css'),
  'utf8',
);

/** Properties that space or size UI; their px values must sit on the 4px grid. */
const gridProperties =
  /^(?:padding|margin|gap|row-gap|column-gap|inset)(?:-[a-z-]+)?$|^(?:top|left|right|bottom|height|min-height|max-height|width|min-width|line-height)$/;

/**
 * Lists `line: declaration` for every px value in a grid property that is not
 * a multiple of 4. Hairlines and focus/indicator lines (1px, 2px), 1px or 2px
 * border compensation in `calc()`, and lines marked `/* off-grid: … *\/` (on
 * the line or the one above) are allowed. Breakpoints are at-rules, not
 * declarations, so they never match.
 */
function offGridDeclarations(source: string): string[] {
  const lines = source.split('\n');
  return lines.flatMap((line, index) => {
    if (/off-grid:/.test(line) || /off-grid:/.test(lines[index - 1] ?? ''))
      return [];
    const offGrid = [
      ...line.matchAll(/(?:^|[{;])\s*([a-z-]+)\s*:\s*([^;{}]+)(?=[;}])/g),
    ]
      .filter(([, property]) => gridProperties.test(property))
      .flatMap(([, , value]) => [
        ...value.replace(/[-+]\s+[12]px/g, '').matchAll(/(\d*\.?\d+)px/g),
      ])
      .map((px) => Number(px[1]))
      .filter((px) => px !== 1 && px !== 2 && px % 4 !== 0);
    return offGrid.length ? [`${index + 1}: ${line.trim()}`] : [];
  });
}

test('workbench spacing and sizes sit on the 4px grid', () => {
  const source = css;

  const offenders = offGridDeclarations(source);

  expect(offenders).toEqual([]);
});

test('the grid check flags off-grid values and allows the documented exceptions', () => {
  const source = [
    '.a { min-height: 34px; }',
    '.b {',
    '  padding: 6px 12px;',
    '  margin-left: -1px;',
    '  height: 2px;',
    '  padding: calc(var(--wb-space-2) - 1px);',
    '  /* off-grid: matches the 15px font metrics */',
    '  top: 7px;',
    '  gap: 8px;',
    '  line-height: 1.45;',
    '  border-radius: 10px;',
    '}',
    '@media (max-width: 559px) {',
    '  .c { width: 30px; }',
    '}',
  ].join('\n');

  const offenders = offGridDeclarations(source);

  expect(offenders).toEqual([
    '1: .a { min-height: 34px; }',
    '3: padding: 6px 12px;',
    '14: .c { width: 30px; }',
  ]);
});

/** Returns the body of the rule whose selector list is exactly `selector`. */
function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`,
    'm',
  ).exec(source);
  return match?.[1] ?? '';
}

/** Returns the value of one declaration inside a rule body. */
function declaration(body: string, name: string): string {
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(body);
  return match?.[1].trim() ?? '';
}

/** Returns the body of each listed selector's top-level rule; throws when one has no rule. */
function panelRules(source: string, selectors: string[]): string[] {
  return selectors.map((selector) => {
    const body = ruleBody(source, selector);
    if (body === '') throw new Error(`no rule found for ${selector}`);
    return body;
  });
}

test('panel spacing reads only the semantic tokens', () => {
  const rules = panelRules(css, [
    '.wb',
    '.wb-panel-head',
    '.wb-feed',
    '.wb-composer',
    '.wb-tabs-row',
    '.wb-inspection',
    '.wb-player',
    '.wb-layout',
  ]);

  // (?<![-\w]) skips custom-property names like --wb-pad: so only real padding/gap declarations match.
  const literal = rules.filter((rule) =>
    /(?<![-\w])(?:padding|gap)\s*:[^;]*var\(--wb-space-\d+\)/.test(rule),
  );

  expect(literal).toEqual([]);
});

test('the embed redefines the rhythm one step down', () => {
  const embed = ruleBody(css, '.wb.wb-embed');

  const values = ['--wb-gap', '--wb-pad', '--wb-stack'].map((name) =>
    declaration(embed, name),
  );

  expect(values).toEqual(Array(3).fill('var(--wb-space-3)'));
});
