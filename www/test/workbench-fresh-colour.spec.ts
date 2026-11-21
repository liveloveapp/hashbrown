import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const css = readFileSync(
  join(__dirname, '../examples/quickstart/runtime/workbench.css'),
  'utf8',
);

/**
 * Lists the selector of every rule whose body uses `token`, skipping the
 * custom-property declaration of the token itself.
 */
function rulesUsing(source: string, token: string): string[] {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , body]) => body.includes(`var(${token})`))
    .map(([, selector]) =>
      selector
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim()
        .replace(/\s+/g, ' '),
    );
}

test('only the fresh highlight uses the highlight colour', () => {
  // Keyframe steps belong to the fresh mark's settle animation.
  const allowed = /mark\.wb-fresh|\[data-wb-fresh\]|^(?:from|to|\d+%)$/;

  const others = rulesUsing(css, '--wb-cobalt-soft').filter(
    (selector) => !allowed.test(selector),
  );

  expect(others).toEqual([]);
});
