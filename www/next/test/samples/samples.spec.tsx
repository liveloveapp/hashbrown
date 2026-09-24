import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import FastFoodPage from '../../src/app/samples/fast-food/page';
import FinancePage from '../../src/app/samples/finance/page';
import SamplesIndexPage, { metadata } from '../../src/app/samples/page';
import SmartHomePage from '../../src/app/samples/smart-home/page';
import { Samples } from '../../src/components/samples/Samples';

const hrefs = (html: string) =>
  [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]);

test('the samples section links match the Angular www-samples', () => {
  const sdk = 'react';

  const html = renderToStaticMarkup(<Samples sdk={sdk} />);

  expect(hrefs(html)).toEqual([
    'https://invoicing.hashbrown.dev',
    'https://github.com/liveloveapp/hashbrown/tree/main/examples/invoicing',
    '/docs/react/start/quick',
  ]);
  expect(html).toContain('>Try the invoicing app</a>');
  expect(html).toContain('>Read the source</a>');
  expect(html).toContain('>Build your own</a>');
});

test('the samples section renders its heading and copy', () => {
  const html = renderToStaticMarkup(<Samples />);

  expect(html).toContain(
    '<section aria-labelledby="example-heading" class="',
  );
  expect(html).toContain(
    '<h2 id="example-heading">Invoicing with an AI assistant</h2>',
  );
  expect(html).toContain('All data is simulated.');
  expect(html).toContain('<nav aria-label="Invoicing example">');
  expect(html).toContain('href="/docs/angular/start/quick"');
});

test('the samples page renders the heading, section, header and footer', () => {
  const html = renderToStaticMarkup(<SamplesIndexPage />);

  expect(html).toContain('<h1');
  expect(html).toContain('Hashbrown example</h1>');
  expect(html).toContain('<header');
  expect(html).toContain('https://invoicing.hashbrown.dev');
  expect(html).toContain('<footer');
});

test('samples metadata matches the Angular routeMeta', () => {
  const meta = metadata;

  const description = meta.description;

  expect(meta.title).toBe('Hashbrown Invoicing Example');
  expect(description).toBe(
    'Explore the React, B4 and Pretable invoicing example with a simulated ledger and explicit allocation reviews.',
  );
});

test.each([
  ['Finance', FinancePage],
  ['Fast Food', FastFoodPage],
  ['Smart Home', SmartHomePage],
])('the retired %s example explains it was retired', (name, Page) => {
  const html = renderToStaticMarkup(<Page />);

  expect(html).toContain(`${name} example retired</h1>`);
  expect(html).toContain('This legacy example is no longer maintained.');
  expect(html).toContain(
    '<a href="/samples">Explore the maintained invoicing example</a>, built with React, Hashbrown, B4 and Pretable using simulated data.',
  );
  expect(html).toContain('<header');
  expect(html).not.toContain('<footer');
});
