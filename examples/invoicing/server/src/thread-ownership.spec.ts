import { expect, test } from 'vitest';
import { createSessionStore } from './session-store';
import { createThreadOwnershipGuard } from './thread-ownership';

test('a B4 thread cannot cross routes, sessions, or reset generations', () => {
  const store = createSessionStore();
  const owner = store.createSession();
  const other = store.createSession();
  const guard = createThreadOwnershipGuard(store);
  const headers = { cookie: `invoicing_session=${owner}` };
  const body = { threadId: 'thread' };

  guard(headers, '/assistant', body);

  expect(() => guard(headers, '/assistant', body)).not.toThrow();
  expect(() => guard(headers, '/review', body)).toThrow(
    'thread_binding_conflict',
  );
  expect(() =>
    guard({ cookie: `invoicing_session=${other}` }, '/assistant', body),
  ).toThrow('thread_binding_conflict');
  store.reset(owner);
  expect(() => guard(headers, '/assistant', body)).toThrow(
    'thread_binding_conflict',
  );
});
