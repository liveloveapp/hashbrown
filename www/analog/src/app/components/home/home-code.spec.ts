import { expect, test } from 'vitest';
import { HOME_CODE_HTML } from 'virtual:home-code-html';

test('serves highlighted hero code for both frameworks', () => {
  const { react, angular } = HOME_CODE_HTML.hero;

  const result = [react, angular];

  expect(result[0]).toContain('shiki hashbrown');
  expect(result[0]).toContain('useUiKit');
  expect(result[1]).toContain('createUiKit');
});

test('serves three highlighted steps for each framework', () => {
  const counts = [
    HOME_CODE_HTML.steps.react.length,
    HOME_CODE_HTML.steps.angular.length,
  ];

  expect(counts).toEqual([3, 3]);
  expect(HOME_CODE_HTML.steps.angular[2]).toContain('shiki hashbrown');
});
