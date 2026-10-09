import { expect, test } from 'vitest';
import {
  generateMetadata,
  generateStaticParams as pageParams,
} from '../../src/app/docs/[sdk]/[...slug]/page';
import {
  docsCardContent,
  generateStaticParams,
} from '../../src/app/og/docs/[sdk]/[...slug]/route';

test('every docs page has a card', () => {
  const pages = pageParams();

  const cards = generateStaticParams();

  expect(cards).toEqual(pages);
});

test('a docs card shows the heading, description and SDK', () => {
  const params = { sdk: 'react', slug: ['start', 'quick'] };

  const content = docsCardContent(params);

  expect(content).toEqual({
    title: 'React Quick Start',
    subtitle: [
      'Take your first steps with Hashbrown.',
      'React docs · hashbrown.dev',
    ],
  });
});

test('long descriptions are cut to 120 characters', () => {
  const pages = generateStaticParams();

  const longest = pages
    .map((params) => docsCardContent(params).subtitle[0])
    .sort((a, b) => b.length - a.length)[0];

  expect(longest.length).toBeLessThanOrEqual(120);
});

test('a docs page points its Open Graph image at its card', async () => {
  const params = { sdk: 'angular', slug: ['start', 'quick'] };

  const meta = await generateMetadata({ params: Promise.resolve(params) });

  expect(meta.openGraph?.images).toEqual(['/og/docs/angular/start/quick']);
});
