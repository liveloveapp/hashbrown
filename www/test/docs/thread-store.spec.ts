import { expect, test } from 'vitest';
import { createMemoryThreadStore } from '../../examples/quickstart/server/thread-store';

test('thread store isolates owners and returns fresh snapshots', async () => {
  const messages = [{ role: 'assistant' as const, content: 'Hello Sam' }];
  const store = createMemoryThreadStore([
    { ownerId: 'sam', id: 'personal', messages },
  ]);

  const own = await store.read('sam', 'personal');
  const foreign = await store.read('lee', 'personal');
  messages[0].content = 'Changed outside the store';

  expect(own).toEqual({
    id: 'personal',
    version: 0,
    messages: [{ role: 'assistant', content: 'Hello Sam' }],
  });
  expect(foreign).toBeNull();
  expect(await store.read('sam', 'personal')).toEqual(own);
  expect(await store.read('sam', 'personal')).not.toBe(own);
});

test('thread store atomically rejects stale versions and keeps the winning save', async () => {
  const store = createMemoryThreadStore([
    { ownerId: 'sam', id: 'personal', messages: [] },
  ]);
  const first = [{ role: 'assistant' as const, content: 'First writer' }];
  const second = [{ role: 'assistant' as const, content: 'Stale writer' }];

  const [winner, conflict] = await Promise.all([
    store.compareAndSwap('sam', 'personal', 0, first),
    store.compareAndSwap('sam', 'personal', 0, second),
  ]);
  const foreign = await store.compareAndSwap('lee', 'personal', 1, second);

  expect(winner).toEqual({ id: 'personal', version: 1, messages: first });
  expect(conflict).toBeNull();
  expect(foreign).toBeNull();
  expect(await store.read('sam', 'personal')).toEqual(winner);
});
