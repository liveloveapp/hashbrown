import { readSessionCookie } from './session-cookie';
import type { SessionStore } from './session-store';
import {
  ConflictError,
  type ThreadRecord,
  type ThreadRepository,
} from './persistence/types';

/** What a thread is bound to for its whole life. */
export interface ThreadOwner {
  readonly sessionId: string;
  readonly routeId: string;
  readonly generation: number;
}

/**
 * The one rule about who may speak on a thread: it belongs to the session that
 * created it, on the route it was created for, in the ledger generation it was
 * created under.
 *
 * The two failures are deliberately distinct. A binding mismatch means the
 * thread is someone else's and the request must not touch it. A generation
 * mismatch means this session reset the ledger underneath its own thread, so
 * the history is stale and the caller should start a new one.
 */
export function assertThreadOwner(
  stored: ThreadRecord,
  expected: ThreadOwner,
): void {
  if (
    stored.sessionId !== expected.sessionId ||
    stored.routeId !== expected.routeId
  )
    throw new Error('thread_binding_conflict');
  if (stored.generation !== expected.generation)
    throw new Error('stale_generation');
}

/** Prevent route changes or session/reset changes from reclaiming persisted B4 history. */
export function createThreadOwnershipGuard(
  store: SessionStore,
  threads: ThreadRepository,
) {
  return async (
    headers: Readonly<Record<string, string>>,
    routeId: string,
    body: unknown,
  ): Promise<void> => {
    const sessionId = readSessionCookie(headers.cookie);
    if (
      !sessionId ||
      !body ||
      typeof body !== 'object' ||
      !('threadId' in body) ||
      typeof body.threadId !== 'string'
    )
      throw new Error('invalid_thread');
    const threadId = body.threadId;
    const generation = await store.generation(sessionId);
    const compare = (previous: ThreadRecord) =>
      assertThreadOwner(previous, { sessionId, routeId, generation });
    const existing = await threads.load(threadId);
    if (existing) {
      compare(existing.value);
      return;
    }
    try {
      await threads.commit(threadId, null, {
        sessionId,
        routeId,
        generation,
        tokens: {},
      });
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      const reloaded = await threads.load(threadId);
      if (!reloaded) throw error;
      compare(reloaded.value);
    }
  };
}
