import { expect, test, vi } from 'vitest';

import { createMemoryCredentialStore } from '../../credentials/memory-store.ts';
import { createAdapters } from '../registry.ts';
import { bodyOf, jsonResponse } from '../test-fetch.ts';
import type { Draft } from '../types.ts';
import { postDevTo } from './post.ts';

const draft: Draft = {
  channel: 'devto',
  text: '# Body',
  article: {
    title: 'A post',
    tags: ['angular', 'ai', 'llm', 'typescript'],
    canonicalUrl: 'https://hashbrown.dev/blog/a-post',
    description: 'About it',
  },
};

test('postDevTo publishes through the API with canonical_url and the API key', async () => {
  const fetchMock = vi.fn(async () =>
    jsonResponse(
      {
        id: 42,
        url: 'https://dev.to/brian/a-post',
        published_at: '2026-11-02T10:00:00Z',
      },
      { status: 201 },
    ),
  );

  const result = await postDevTo('key-1', draft, fetchMock);

  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe('https://dev.to/api/articles');
  expect((init.headers as Record<string, string>)['api-key']).toBe('key-1');
  expect(bodyOf(fetchMock, 0)).toEqual({
    article: {
      title: 'A post',
      body_markdown: '# Body',
      published: true,
      tags: ['angular', 'ai', 'llm', 'typescript'],
      canonical_url: 'https://hashbrown.dev/blog/a-post',
      description: 'About it',
    },
  });
  expect(result).toEqual({
    channel: 'devto',
    postId: '42',
    url: 'https://dev.to/brian/a-post',
    postedAt: '2026-11-02T10:00:00Z',
  });
});

test('a dev.to draft with more than 4 tags is rejected before any fetch call', async () => {
  const fetchMock = vi.fn();
  const { devto } = createAdapters({
    credentials: createMemoryCredentialStore(),
    env: { DEVTO_API_KEY: 'key-1' },
    fetch: fetchMock,
    dryRun: false,
  });

  await expect(
    devto.post({
      ...draft,
      article: { title: 'A post', tags: ['a', 'b', 'c', 'd', 'e'] },
    }),
  ).rejects.toThrow(/at most 4 tags/);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('postDevTo reports a rejected API key without echoing it', async () => {
  const fetchMock = vi.fn(async () => new Response('no', { status: 401 }));

  await expect(postDevTo('key-1', draft, fetchMock)).rejects.toThrow(
    /DEVTO_API_KEY/,
  );
});

test.each([
  ['a 503', async () => new Response('boom', { status: 503 })],
  [
    'a network error',
    async () => {
      throw new Error('socket hang up');
    },
  ],
])(
  'postDevTo makes exactly one fetch call when the create gets %s',
  async (_, respond) => {
    const fetchMock = vi.fn(respond);

    await expect(postDevTo('key-1', draft, fetchMock)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
