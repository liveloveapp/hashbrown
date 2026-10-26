import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import {
  loadServerHistory,
  saveServerHistory,
  ServerHistoryError,
} from '../../examples/quickstart/react/src/server-history';

const snapshot = {
  id: 'personal',
  version: 2,
  messages: [{ role: 'assistant', content: 'Hello' }],
};

test('loads an encoded thread with session credentials and cancellation', async () => {
  const signal = new AbortController().signal;
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ ...snapshot, id: 'a/b' }));

  const result = await loadServerHistory('a/b', signal, request);

  expect(request).toHaveBeenCalledWith('/api/threads/a%2Fb', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  expect(result.id).toBe('a/b');
});

test.each([
  null,
  {},
  { ...snapshot, id: 'work' },
  { ...snapshot, version: -1 },
  { ...snapshot, version: 1.5 },
  { ...snapshot, version: Number.MAX_SAFE_INTEGER + 1 },
  { ...snapshot, unexpected: true },
  { ...snapshot, messages: [{ role: 'user', content: 'Pending' }] },
  {
    ...snapshot,
    messages: [{ role: 'assistant', content: 'Hello', toolCalls: [] }],
  },
])('rejects malformed or mismatched server snapshots', async (body) => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));

  const result = loadServerHistory('personal', undefined, request);

  await expect(result).rejects.toThrow('Invalid server conversation');
});

test('saves completed text only and checks the incremented version', async () => {
  const signal = new AbortController().signal;
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ ...snapshot, version: 3 }));
  const messages = [
    { role: 'assistant', content: 'Hello', id: 'private', toolCalls: [] },
  ];

  const result = await saveServerHistory(
    'personal',
    2,
    messages,
    signal,
    request,
  );

  expect(result.version).toBe(3);
  expect(request).toHaveBeenCalledWith('/api/threads/personal', {
    method: 'PUT',
    credentials: 'same-origin',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion: 2, messages: snapshot.messages }),
  });
});

test.each([1, 2, 4])(
  'rejects save responses with an unexpected version',
  async (version) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ...snapshot, version }));

    const result = saveServerHistory(
      'personal',
      2,
      snapshot.messages,
      undefined,
      request,
    );

    await expect(result).rejects.toThrow('Invalid server conversation');
  },
);

test.each([401, 404, 409, 500])(
  'reports HTTP status without trusting an error response body',
  async (status) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('not JSON', { status }));

    const result = saveServerHistory(
      'personal',
      2,
      snapshot.messages,
      undefined,
      request,
    );

    await expect(result).rejects.toBeInstanceOf(ServerHistoryError);
    await expect(result).rejects.toMatchObject({ status });
  },
);

test.each([-1, 1.5, Number.MAX_SAFE_INTEGER])(
  'rejects invalid expected versions before fetching',
  async (version) => {
    const request = vi.fn<typeof fetch>();

    const result = saveServerHistory(
      'personal',
      version,
      snapshot.messages,
      undefined,
      request,
    );

    await expect(result).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  },
);

test('never sends partial conversations or tool calls to storage', async () => {
  const request = vi.fn<typeof fetch>();

  const result = saveServerHistory(
    'personal',
    2,
    [{ role: 'user', content: 'Pending' }],
    undefined,
    request,
  );

  await expect(result).rejects.toThrow('Only completed text');
  expect(request).not.toHaveBeenCalled();
});

test('both frameworks share the same validated server transport', () => {
  const base = resolve(import.meta.dirname, '../../examples/quickstart');

  const react = readFileSync(
    resolve(base, 'react/src/server-history.ts'),
    'utf8',
  );
  const angular = readFileSync(
    resolve(base, 'angular/src/app/server-history.ts'),
    'utf8',
  );

  expect(angular).toBe(react);
});
