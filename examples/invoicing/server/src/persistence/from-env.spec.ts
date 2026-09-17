import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const originalDatabaseUrl = process.env['DATABASE_URL'];

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('./postgres');
  if (originalDatabaseUrl === undefined) delete process.env['DATABASE_URL'];
  else process.env['DATABASE_URL'] = originalDatabaseUrl;
});

test('a rejected construction is not cached, so a later call retries', async () => {
  process.env['DATABASE_URL'] = 'postgres://example';
  const createPostgresRepositories = vi
    .fn()
    .mockRejectedValueOnce(new Error('connection_failed'))
    .mockResolvedValueOnce({
      sessions: {},
      threads: {},
      close: () => Promise.resolve(),
    });
  vi.doMock('./postgres', () => ({ createPostgresRepositories }));

  const { repositoriesFromEnv } = await import('./from-env');

  await expect(repositoriesFromEnv()).rejects.toThrow('connection_failed');
  await expect(repositoriesFromEnv()).resolves.toBeDefined();
  expect(createPostgresRepositories).toHaveBeenCalledTimes(2);
});

test('resolves to memory repositories when DATABASE_URL is unset', async () => {
  delete process.env['DATABASE_URL'];

  const { repositoriesFromEnv } = await import('./from-env');
  const repositories = await repositoriesFromEnv();

  expect(repositories.sessions).toBeDefined();
  expect(repositories.threads).toBeDefined();
});
