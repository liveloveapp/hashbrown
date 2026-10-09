import { expect, test } from 'vitest';
import { generateStaticParams as pageParams } from '../../src/app/blog/[slug]/page';
import {
  blogCardContent,
  generateStaticParams,
} from '../../src/app/blog/[slug]/opengraph-image';

test('every blog post has a card', () => {
  const pages = pageParams();

  const cards = generateStaticParams();

  expect(cards).toEqual(pages);
});

test('a post card shows the title and the date', () => {
  const slug = '2026-10-08-hashbrown-v-0-7-0';

  const content = blogCardContent(slug);

  expect(content).toEqual({
    title: 'Hashbrown v0.7 moves to AG-UI 1.0',
    subtitle: ['Oct 8, 2026 · hashbrown blog'],
  });
});
