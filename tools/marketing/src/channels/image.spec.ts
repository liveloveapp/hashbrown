import { createHash } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { loadImage, validateImage } from './image.ts';

const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const image = {
  url: 'https://hashbrown.dev/marketing/test.png',
  altText: 'A recorded model request.',
  sha256: createHash('sha256').update(bytes).digest('hex'),
};

test('loads the reviewed image without credentials and rejects redirects', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(bytes, { headers: { 'content-type': 'image/png' } }),
    );

  const result = await loadImage(image, fetcher);

  expect(result.bytes).toEqual(bytes);
  expect(result.contentType).toBe('image/png');
  expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  expect(fetcher.mock.calls[0][1]?.headers).toBeUndefined();
});

test.each([
  'http://hashbrown.dev/marketing/a.png',
  'https://hashbrown.dev.evil.test/marketing/a.png',
  'https://user:pass@hashbrown.dev/marketing/a.png',
  'https://hashbrown.dev/marketing/a.png?url=http://localhost',
  'https://hashbrown.dev/marketing/../private.png',
  'https://hashbrown.dev:444/marketing/a.png',
])('rejects untrusted image source %s before fetching', async (url) => {
  const fetcher = vi.fn<typeof fetch>();

  await expect(loadImage({ ...image, url }, fetcher)).rejects.toThrow(/image/i);

  expect(fetcher).not.toHaveBeenCalled();
});

test('rejects a changed asset instead of silently publishing a different picture', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(bytes, { headers: { 'content-type': 'image/png' } }),
    );

  await expect(
    loadImage({ ...image, sha256: '0'.repeat(64) }, fetcher),
  ).rejects.toThrow(/digest/i);
});

test.each(['text/html', 'image/svg+xml', 'image/gif'])(
  'rejects unsupported content type %s',
  async (contentType) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(bytes, { headers: { 'content-type': contentType } }),
      );

    await expect(loadImage(image, fetcher)).rejects.toThrow(/format/i);
  },
);

test('bounds a streaming body even without a content length', async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1));
    },
    cancel,
  });
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(stream, { headers: { 'content-type': 'image/png' } }),
    );

  await expect(loadImage(image, fetcher)).rejects.toThrow(/5 MiB/i);

  expect(cancel).toHaveBeenCalledOnce();
});

test('rejects a forged PNG content type', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response('not an image', {
      headers: { 'content-type': 'image/png' },
    }),
  );

  await expect(loadImage(image, fetcher)).rejects.toThrow(/signature/i);
});

test.each([
  { ...image, altText: ' ' },
  { ...image, sha256: 'wrong' },
])('requires accessible description and immutable identity', (input) => {
  expect(() => validateImage(input)).toThrow(/image/i);
});
