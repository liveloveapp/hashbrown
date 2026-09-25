import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Footer } from '../../src/components/site/Footer';

const hrefs = (html: string) =>
  [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((match) => match[1]);

test('footer links match the Angular footer', () => {
  const html = renderToStaticMarkup(<Footer sdk="react" />);

  expect(hrefs(html)).toEqual([
    'https://analogjs.org',
    '/docs/react/start/intro',
    '/api',
    '/samples',
    '/llms.txt',
    '/llms-full.txt',
    '/blog',
    'https://threadplane.ai/?utm_source=hashbrown&amp;utm_medium=footer',
    'https://b4.run',
    'https://pretable.ai',
    'https://www.linkedin.com/company/liveloveapp',
    'https://github.com/liveloveapp/hashbrown',
  ]);
});

test('footer renders its link column titles', () => {
  const html = renderToStaticMarkup(<Footer />);

  expect(html).toContain('>Documentation</div>');
  expect(html).toContain('>Learn</div>');
  expect(html).toContain('>More from the team</div>');
});

test('footer renders the copyright with the current year', () => {
  const year = new Date().getFullYear();

  const html = renderToStaticMarkup(<Footer />);

  expect(html).toContain(`© LiveLoveApp, LLC ${year}.`);
});

test('footer docs link defaults to the angular sdk', () => {
  const html = renderToStaticMarkup(<Footer />);

  expect(html).toContain('href="/docs/angular/start/intro"');
});

test('footer social links have accessible names', () => {
  const html = renderToStaticMarkup(<Footer />);

  expect(html).toContain('aria-label="Hashbrown on LinkedIn"');
  expect(html).toContain('aria-label="Hashbrown on GitHub"');
});
