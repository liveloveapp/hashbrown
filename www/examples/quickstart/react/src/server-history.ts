import {
  decodeTextHistory,
  encodeTextHistory,
  type SavedTextMessage,
  type TextHistorySource,
} from './text-history';

/** A server-owned, versioned snapshot of a completed text conversation. */
export interface ServerHistory {
  readonly id: string;
  readonly version: number;
  readonly messages: SavedTextMessage[];
}

/** An HTTP failure whose status distinguishes authentication, missing data, and conflicts. */
export class ServerHistoryError extends Error {
  constructor(readonly status: number) {
    super(
      status === 409
        ? 'Another session saved this conversation. Reload the saved conversation.'
        : status === 401
          ? 'Sign in before loading or saving this conversation.'
          : status === 404
            ? 'This conversation is unavailable.'
            : 'The server could not load or save this conversation.',
    );
    this.name = 'ServerHistoryError';
  }
}

async function readSnapshot(
  response: Response,
  selectedId: string,
  expectedVersion?: number,
): Promise<ServerHistory> {
  if (!response.ok) throw new ServerHistoryError(response.status);
  try {
    const value: unknown = await response.json();
    if (
      typeof value !== 'object' ||
      value === null ||
      !('id' in value) ||
      value.id !== selectedId ||
      !('version' in value) ||
      typeof value.version !== 'number' ||
      !Number.isSafeInteger(value.version) ||
      value.version < 0 ||
      (expectedVersion !== undefined && value.version !== expectedVersion) ||
      !('messages' in value) ||
      Object.keys(value).some(
        (key) => !['id', 'version', 'messages'].includes(key),
      )
    )
      throw new Error();
    const decoded = decodeTextHistory(
      JSON.stringify({ version: 1, messages: value.messages }),
    );
    if (decoded.issue) throw new Error();
    return {
      id: selectedId,
      version: value.version,
      messages: decoded.messages,
    };
  } catch {
    throw new Error('Invalid server conversation');
  }
}

/** Loads a provisioned thread using the application's existing same-origin session. */
export async function loadServerHistory(
  id: string,
  signal?: AbortSignal,
  request: typeof fetch = globalThis.fetch,
): Promise<ServerHistory> {
  const response = await request(`/api/threads/${encodeURIComponent(id)}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  return readSnapshot(response, id);
}

/** Atomically saves completed text against the last successfully loaded server version. */
export async function saveServerHistory(
  id: string,
  expectedVersion: number,
  messages: readonly TextHistorySource[],
  signal?: AbortSignal,
  request: typeof fetch = globalThis.fetch,
): Promise<ServerHistory> {
  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0 ||
    expectedVersion >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error('Invalid expected version');
  }
  const decoded = decodeTextHistory(encodeTextHistory(messages));
  const response = await request(`/api/threads/${encodeURIComponent(id)}`, {
    method: 'PUT',
    credentials: 'same-origin',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion, messages: decoded.messages }),
  });
  return readSnapshot(response, id, expectedVersion + 1);
}
