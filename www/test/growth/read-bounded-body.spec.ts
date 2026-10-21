import { expect, test } from 'vitest';

import { readBoundedBody } from '../../src/app/%5F/_internal/read-bounded-body';

function post(body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request('https://hashbrown.dev/_/x', {
    method: 'POST',
    body,
    headers,
  });
}

test('readBoundedBody returns the text within the byte cap', async () => {
  const request = post('hello');

  const result = await readBoundedBody(request, 5);

  expect(result).toBe('hello');
});

test('readBoundedBody returns null over the byte cap', async () => {
  const request = post('hello!');

  const result = await readBoundedBody(request, 5);

  expect(result).toBeNull();
});

test('readBoundedBody returns null when content-length exceeds the cap', async () => {
  const request = post('hi', { 'content-length': '999' });

  const result = await readBoundedBody(request, 5);

  expect(result).toBeNull();
});

test('readBoundedBody returns null on invalid UTF-8', async () => {
  const request = post(new Uint8Array([0xff, 0xfe, 0xfd]));

  const result = await readBoundedBody(request, 10);

  expect(result).toBeNull();
});

test('readBoundedBody returns an empty string without a body', async () => {
  const request = new Request('https://hashbrown.dev/_/x');

  const result = await readBoundedBody(request, 10);

  expect(result).toBe('');
});
