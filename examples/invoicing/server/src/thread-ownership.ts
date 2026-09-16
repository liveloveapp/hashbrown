import { readSessionCookie } from './http';
import type { SessionStore } from './session-store';

/** Prevent route changes or session/reset changes from reclaiming persisted B4 history. */
export function createThreadOwnershipGuard(store: SessionStore) {
  const owners = new Map<
    string,
    { sessionId: string; routeId: string; generation: number }
  >();
  return (
    headers: Readonly<Record<string, string>>,
    routeId: string,
    body: unknown,
  ) => {
    const sessionId = readSessionCookie(headers.cookie);
    if (
      !sessionId ||
      !body ||
      typeof body !== 'object' ||
      !('threadId' in body) ||
      typeof body.threadId !== 'string'
    )
      throw new Error('invalid_thread');
    const generation = store.generation(sessionId);
    const previous = owners.get(body.threadId);
    if (
      previous &&
      (previous.sessionId !== sessionId ||
        previous.routeId !== routeId ||
        previous.generation !== generation)
    )
      throw new Error('thread_binding_conflict');
    owners.set(body.threadId, { sessionId, routeId, generation });
  };
}
