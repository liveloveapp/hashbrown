import { expect, test } from 'vitest';
import { generateStaticParams as pageParams } from '../../src/app/blog/[slug]/page';
import * as postSquare from '../../src/app/blog/[slug]/square-card/route';
import * as siteSquare from '../../src/app/square-card/route';

async function pngSize(response: Response) {
  const view = new DataView(await response.arrayBuffer());
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

test('the site square card is a static 1080x1080 PNG', async () => {
  const response = await siteSquare.GET();

  expect(siteSquare.dynamic).toBe('force-static');
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(await pngSize(response)).toEqual({ width: 1080, height: 1080 });
});

test('every blog post has a square card', () => {
  const pages = pageParams();

  const cards = postSquare.generateStaticParams();

  expect(cards).toEqual(pages);
});

test('a post square card is a 1080x1080 PNG', async () => {
  const params = Promise.resolve({ slug: '2026-10-08-hashbrown-v-0-7-0' });

  const response = await postSquare.GET(new Request('http://x'), { params });

  expect(postSquare.dynamicParams).toBe(false);
  expect(await pngSize(response)).toEqual({ width: 1080, height: 1080 });
});
