import { expect, test } from 'vitest';

import { readBlogMarkdown } from './source.ts';

test('reads the merged post from main on raw.githubusercontent.com', async () => {
  let requested = '';
  const fetchImpl = (async (url: string) => {
    requested = url;
    return new Response('---\ntitle: T\n---\nBody', { status: 200 });
  }) as typeof fetch;

  expect(await readBlogMarkdown('2026-11-04-post', fetchImpl)).toContain(
    'Body',
  );
  expect(requested).toBe(
    'https://raw.githubusercontent.com/liveloveapp/hashbrown/main/www/content/blog/2026-11-04-post.md',
  );
});

test('throws with the status when the post is not on main', async () => {
  const fetchImpl = (async () =>
    new Response('404', { status: 404 })) as typeof fetch;

  await expect(readBlogMarkdown('missing', fetchImpl)).rejects.toThrow(
    'HTTP 404 reading www/content/blog/missing.md from main',
  );
});
