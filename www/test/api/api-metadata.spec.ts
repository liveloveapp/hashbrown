import { expect, test } from 'vitest';
import { metadata as layoutMetadata } from '../../src/app/api/layout';
import { metadata as indexMetadata } from '../../src/app/api/page';
import { generateMetadata } from '../../src/app/api/[pkg]/[symbol]/page';
import { DEFAULT_CARD_IMAGE } from '../../src/lib/site-metadata';

test('the API layout and index use the default card', () => {
  const metas = [layoutMetadata, indexMetadata];

  const images = metas.map((meta) => meta.openGraph?.images);

  expect(images).toEqual([[DEFAULT_CARD_IMAGE], [DEFAULT_CARD_IMAGE]]);
});

test('an API symbol page uses the default card', async () => {
  const params = Promise.resolve({ pkg: 'core', symbol: 'Chat' });

  const meta = await generateMetadata({ params });

  expect(meta.openGraph?.images).toEqual([DEFAULT_CARD_IMAGE]);
});
