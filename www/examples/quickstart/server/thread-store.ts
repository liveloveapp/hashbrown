/** A completed visible message supported by this server's storage contract. */
export interface StoredTextMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/** Validates and copies this application's bounded completed-text format. */
export function parseCompletedText(value: unknown): StoredTextMessage[] | null {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      (message) =>
        typeof message !== 'object' ||
        message === null ||
        (message.role !== 'user' && message.role !== 'assistant') ||
        typeof message.content !== 'string' ||
        message.content.length > 10000 ||
        Object.keys(message).some((key) => key !== 'role' && key !== 'content'),
    ) ||
    (value.length > 0 && value.at(-1).role !== 'assistant')
  )
    return null;
  return value.map(({ role, content }) => ({ role, content }));
}

/** One application-owned snapshot; it is not an agent checkpoint. */
export interface ThreadSnapshot {
  readonly id: string;
  readonly version: number;
  readonly messages: StoredTextMessage[];
}

/** Persistence operations that must enforce owner scope and atomic version checks. */
export interface ThreadStore {
  read(ownerId: string, id: string): Promise<ThreadSnapshot | null>;
  compareAndSwap(
    ownerId: string,
    id: string,
    expectedVersion: number,
    messages: readonly StoredTextMessage[],
  ): Promise<ThreadSnapshot | null>;
}

/** A thread provisioned by the application, rather than by client identity claims. */
export interface ThreadSeed {
  readonly ownerId: string;
  readonly id: string;
  readonly messages: readonly StoredTextMessage[];
}

function copy(snapshot: ThreadSnapshot): ThreadSnapshot {
  return {
    ...snapshot,
    messages: snapshot.messages.map((message) => ({ ...message })),
  };
}

/**
 * Creates local demonstration storage. Data survives page refreshes, but not a
 * server restart, and is not shared across server processes. Use an atomic
 * database update scoped by both owner and version in a deployed application.
 */
export function createMemoryThreadStore(
  seeds: readonly ThreadSeed[],
): ThreadStore {
  let records = new Map<string, { ownerId: string; snapshot: ThreadSnapshot }>(
    seeds.map((seed) => {
      const parsed = parseCompletedText(seed.messages);
      if (parsed === null || !seed.id || !seed.ownerId)
        throw new Error('Invalid thread seed');
      return [
        seed.id,
        {
          ownerId: seed.ownerId,
          snapshot: { id: seed.id, version: 0, messages: parsed },
        },
      ] as const;
    }),
  );
  if (records.size !== seeds.length)
    throw new Error('Thread IDs must be unique');
  return {
    async read(ownerId, id) {
      const record = records.get(id);
      return record?.ownerId === ownerId ? copy(record.snapshot) : null;
    },
    async compareAndSwap(ownerId, id, expectedVersion, messages) {
      const record = records.get(id);
      if (
        !record ||
        record.ownerId !== ownerId ||
        record.snapshot.version !== expectedVersion ||
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion < 0 ||
        expectedVersion >= Number.MAX_SAFE_INTEGER
      )
        return null;
      const parsed = parseCompletedText(messages);
      if (parsed === null) throw new Error('Only completed text can be saved');
      const snapshot = {
        id,
        version: expectedVersion + 1,
        messages: parsed,
      };
      records = new Map(records).set(id, { ownerId, snapshot });
      return copy(snapshot);
    },
  };
}
