import { randomUUID } from 'node:crypto';
import {
  ConflictError,
  type Document,
  type Repositories,
  type Session,
  type ThreadRecord,
} from './types';

/** Process-local repositories for tests, the e2e fixture, and local development. */
export function createMemoryRepositories(): Repositories {
  const sessions = new Map<string, Document<Session>>();
  const threads = new Map<string, Document<ThreadRecord>>();
  const snapshot = <T>(doc: Document<T> | undefined) =>
    doc
      ? { version: doc.version, value: structuredClone(doc.value) }
      : undefined;

  return {
    sessions: {
      async create(initial) {
        const id = randomUUID();
        sessions.set(id, { version: 0, value: structuredClone(initial) });
        return id;
      },
      async load(id) {
        return snapshot(sessions.get(id));
      },
      async commit(id, expectedVersion, next) {
        const current = sessions.get(id);
        if (!current || current.version !== expectedVersion)
          throw new ConflictError();
        sessions.set(id, {
          version: current.version + 1,
          value: structuredClone(next),
        });
      },
    },
    threads: {
      async load(threadId) {
        return snapshot(threads.get(threadId));
      },
      async commit(threadId, expectedVersion, next) {
        const current = threads.get(threadId);
        if (expectedVersion === null) {
          if (current) throw new ConflictError();
          threads.set(threadId, { version: 0, value: structuredClone(next) });
          return;
        }
        if (!current || current.version !== expectedVersion)
          throw new ConflictError();
        threads.set(threadId, {
          version: current.version + 1,
          value: structuredClone(next),
        });
      },
    },
    close: () => Promise.resolve(),
  };
}
