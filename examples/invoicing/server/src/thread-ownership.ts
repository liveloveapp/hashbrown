import { readSessionCookie } from './http';
import type { SessionStore } from './session-store';
import {
  ConflictError,
  type ThreadRecord,
  type ThreadRepository,
} from './persistence/types';

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
    const compare = (previous: ThreadRecord) => {
      if (
        previous.sessionId !== sessionId ||
        previous.routeId !== routeId ||
        previous.generation !== generation
      )
        throw new Error('thread_binding_conflict');
    };
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
