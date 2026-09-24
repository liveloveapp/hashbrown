import { expect, test } from 'vitest';
import { getHomeCodeHtml } from '../../src/lib/home-code';

test('highlights hero code for both frameworks', async () => {
  const html = await getHomeCodeHtml();

  const result = [html.hero.react, html.hero.angular];

  expect(result[0]).toContain('shiki hashbrown');
  expect(result[0]).toContain('useUiKit');
  expect(result[1]).toContain('createUiKit');
});

test('highlights three steps for each framework', async () => {
  const html = await getHomeCodeHtml();

  const counts = [html.steps.react.length, html.steps.angular.length];

  expect(counts).toEqual([3, 3]);
  expect(html.steps.angular[2]).toContain('shiki hashbrown');
});

test('highlights the Angular template step as HTML', async () => {
  const html = await getHomeCodeHtml();

  const result = html.steps.angular[2];

  expect(result).toContain('hb-render-message');
  expect(result).toContain('color:');
});
