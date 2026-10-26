import { THREAD_LIFETIME_MS } from './thread-policy';

/**
 * Deletes expired anonymous state while every ATC agent instance is offline.
 * Checkpoints go first so a failed deletion leaves a discoverable thread row
 * for the next operator retry. This function does not acquire a distributed lock.
 */
export async function pruneAnonymousThreads(options: {
  readonly threads: {
    listThreads(): Promise<
      readonly { readonly thread_id: string; readonly created_at: string }[]
    >;
    deleteThread(threadId: string): Promise<void>;
  };
  readonly checkpointer: { deleteThread(threadId: string): Promise<void> };
  readonly now: number;
}): Promise<number> {
  const threads = await options.threads.listThreads();
  const expired = threads.filter(
    (thread) =>
      Date.parse(thread.created_at) <= options.now - THREAD_LIFETIME_MS,
  );
  for (const thread of expired) {
    await options.checkpointer.deleteThread(thread.thread_id);
    await options.threads.deleteThread(thread.thread_id);
  }
  return expired.length;
}
