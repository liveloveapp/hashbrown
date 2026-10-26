import { expect, test, vi } from 'vitest';
import { pruneAnonymousThreads } from './cleanup';

const now = Date.parse('2026-10-24T12:00:00Z');
const old = { thread_id: 'old', created_at: '2026-10-23T12:00:00Z' };
const fresh = { thread_id: 'fresh', created_at: '2026-10-24T11:00:00Z' };

test('offline cleanup removes expired checkpoints before thread rows and retains fresh conversations', async () => {
  const operations: string[] = [];
  const threads = {
    listThreads: async () => [old, fresh],
    deleteThread: async (id: string) => {
      operations.push(`thread:${id}`);
    },
  };
  const checkpointer = {
    deleteThread: async (id: string) => {
      operations.push(`checkpoint:${id}`);
    },
  };

  const count = await pruneAnonymousThreads({ threads, checkpointer, now });

  expect(count).toBe(1);
  expect(operations).toEqual(['checkpoint:old', 'thread:old']);
});

test('failed checkpoint deletion leaves the thread discoverable for a later cleanup retry', async () => {
  const threads = { listThreads: async () => [old], deleteThread: vi.fn() };
  const checkpointer = {
    deleteThread: async () => {
      throw new Error('Storage unavailable');
    },
  };

  const cleanup = pruneAnonymousThreads({ threads, checkpointer, now });

  await expect(cleanup).rejects.toThrow('Storage unavailable');
  expect(threads.deleteThread).not.toHaveBeenCalled();
});
