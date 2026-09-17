import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, test, vi } from 'vitest';
import { createMemoryRepositories } from './persistence/memory';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('./persistence/from-env');
});

/** Serve one listener on an ephemeral loopback port for the duration of `run`. */
async function serving<T>(
  listener: RequestListener,
  run: (origin: string) => Promise<T>,
): Promise<T> {
  const server = createServer(listener);
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const { port } = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test('a cold-start repository failure answers 500 and is retried on the next request', async () => {
  const repositories = createMemoryRepositories();
  let attempt = 0;
  const repositoriesFromEnv = vi.fn(async () => {
    if (++attempt === 1) throw new Error('database unavailable');
    return repositories;
  });
  vi.resetModules();
  vi.doMock('./persistence/from-env', () => ({ repositoriesFromEnv }));
  const handler = (await import('./api')).default;

  const [failed, recovered] = await serving(
    handler as unknown as RequestListener,
    async (origin) => {
      const first = await fetch(`${origin}/api/snapshot`, {
        signal: AbortSignal.timeout(5_000),
      });
      const firstBody = await first.text();
      const second = await fetch(`${origin}/api/snapshot`, {
        signal: AbortSignal.timeout(5_000),
      });
      const secondBody = await second.json();
      return [
        { status: first.status, body: firstBody },
        { status: second.status, body: secondBody },
      ] as const;
    },
  );

  expect(failed).toEqual({ status: 500, body: '{"error":"internal_error"}' });
  expect(recovered.status).toBe(200);
  expect(recovered.body).toMatchObject({ payments: expect.any(Array) });
  expect(repositoriesFromEnv).toHaveBeenCalledTimes(2);
});
