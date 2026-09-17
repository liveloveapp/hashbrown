import { createMemoryRepositories } from './memory';
import { createPostgresRepositories } from './postgres';
import type { Repositories } from './types';

let shared: Promise<Repositories> | undefined;

/** Postgres when DATABASE_URL is set, otherwise process memory. One instance per process. */
export function repositoriesFromEnv(): Promise<Repositories> {
  shared ??= (async () => {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) return createMemoryRepositories();
    return createPostgresRepositories({ connectionString });
  })().catch((error: unknown) => {
    shared = undefined;
    throw error;
  });
  return shared;
}
