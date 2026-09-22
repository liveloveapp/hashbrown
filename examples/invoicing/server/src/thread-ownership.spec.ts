import { expect, test } from 'vitest';
import { createSessionStore } from './session-store';
import { createThreadOwnershipGuard } from './thread-ownership';
import { createMemoryRepositories } from './persistence/memory';

test('a B4 thread cannot cross routes, sessions, or reset generations', async () => {
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions);
  const owner = await store.createSession();
  const other = await store.createSession();
  const guard = createThreadOwnershipGuard(store, repositories.threads);
  const headers = { cookie: `invoicing_session=${owner}` };
  const body = { threadId: 'thread' };

  await guard(headers, '/assistant', body);

  await expect(guard(headers, '/assistant', body)).resolves.toBeUndefined();
  await expect(guard(headers, '/review', body)).rejects.toThrow(
    'thread_binding_conflict',
  );
  await expect(
    guard({ cookie: `invoicing_session=${other}` }, '/assistant', body),
  ).rejects.toThrow('thread_binding_conflict');
  // A reset is the session's own doing, so the thread is stale rather than
  // someone else's. Both answer the caller with 422 through the middleware.
  await store.reset(owner);
  await expect(guard(headers, '/assistant', body)).rejects.toThrow(
    'stale_generation',
  );
});
