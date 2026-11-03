import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startCandidateHandlerObserver } from '../harness/candidate-handler-observer';

test('observer concurrent conflicting canonical binds commit exactly one immutable association', async () => {
  await withObserver(async (observer, path) => {
    const registration = observer.register({ scope, operations: [operation] });
    await enter(registration.entryUrl);
    const binding = {
      correlation: 'PDX',
      canonicalCallId: 'canonical-a',
      toolName: operation.toolName,
      arguments: argumentsA,
    };

    const settled = await Promise.allSettled([
      observer.bindCanonical(scope, [binding]),
      observer.bindCanonical(scope, [
        { ...binding, canonicalCallId: 'canonical-b' },
      ]),
    ]);

    expect(
      settled.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      settled.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const bindings = (await persisted(path)).filter(
      (record) => record.kind === 'canonical-binding',
    );
    expect(bindings).toHaveLength(1);
    expect(observer.entries(scope)[0].canonicalCallId).toBe(
      bindings[0].canonicalCallId,
    );
  });
});

test('observer append failure during close still closes held socket listener and actual evidence handle exactly once', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'candidate-observer-close-fault-'),
  );
  const path = join(directory, 'entries.jsonl');
  const filesystem =
    jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  const http = jest.requireActual<typeof import('node:http')>('node:http');
  const realOpen = filesystem.open;
  const realCreateServer = http.createServer;
  let ownedHandle: Awaited<ReturnType<typeof realOpen>> | undefined;
  let ownedServer: ReturnType<typeof realCreateServer> | undefined;
  const opening = jest
    .spyOn(filesystem, 'open')
    .mockImplementation(async (...args: Parameters<typeof realOpen>) => {
      const handle = await realOpen(...args);
      if (String(args[0]) === path) ownedHandle = handle;
      return handle;
    });
  const creating = jest
    .spyOn(http, 'createServer')
    .mockImplementation((...args: Parameters<typeof realCreateServer>) => {
      const server = realCreateServer(...args);
      ownedServer = server;
      return server;
    });
  let appendFailure: jest.SpyInstance | undefined;
  let actualClose: jest.SpyInstance | undefined;
  const client = new AbortController();
  let observer:
    Awaited<ReturnType<typeof startCandidateHandlerObserver>> | undefined;
  try {
    observer = await startCandidateHandlerObserver({
      ownedOrigins: [origin],
      evidencePath: path,
      limits: {
        requestBytes: 4096,
        resultBytes: 4096,
        records: 128,
        holdTimeoutMs: 2000,
      },
    });
    opening.mockRestore();
    creating.mockRestore();
    expect(ownedHandle).toBeDefined();
    if (!ownedHandle) throw new Error('Owned evidence handle was not captured');
    const registration = observer.register({ scope, operations: [operation] });
    const receipt = await enter(registration.entryUrl);
    const held = fetch(receipt.holdUrl, {
      headers: { Origin: origin },
      signal: client.signal,
    });
    const socketClosed = held.then(
      () => false,
      () => true,
    );
    await observer.waitForRecord(
      'hold-received',
      scope,
      new AbortController().signal,
    );
    const failure = new Error('controlled owned observer append failure');
    actualClose = jest.spyOn(ownedHandle, 'close');
    appendFailure = jest
      .spyOn(ownedHandle, 'appendFile')
      .mockRejectedValue(failure);

    const first = observer.close();
    const second = observer.close();
    const rejected = expect(first).rejects.toBe(failure);
    expect(second).toBe(first);
    await rejected;

    expect(actualClose).toHaveBeenCalledTimes(1);
    expect(await socketClosed).toBe(true);
    await expect(
      fetch(registration.entryUrl, { headers: { Origin: origin } }),
    ).rejects.toThrow();
  } finally {
    client.abort();
    opening.mockRestore();
    creating.mockRestore();
    appendFailure?.mockRestore();
    actualClose?.mockRestore();
    if (ownedServer) {
      const server = ownedServer;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await observer?.close().catch(() => undefined);
    await ownedHandle?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('observer release append failure closes its captured held socket before global teardown without delivering a result', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'candidate-observer-release-fault-'),
  );
  const path = join(directory, 'entries.jsonl');
  const filesystem =
    jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  const http = jest.requireActual<typeof import('node:http')>('node:http');
  const realOpen = filesystem.open;
  const realCreateServer = http.createServer;
  let ownedHandle: Awaited<ReturnType<typeof realOpen>> | undefined;
  let ownedServer: ReturnType<typeof realCreateServer> | undefined;
  const opening = jest
    .spyOn(filesystem, 'open')
    .mockImplementation(async (...args: Parameters<typeof realOpen>) => {
      const handle = await realOpen(...args);
      if (String(args[0]) === path) ownedHandle = handle;
      return handle;
    });
  const creating = jest
    .spyOn(http, 'createServer')
    .mockImplementation((...args: Parameters<typeof realCreateServer>) => {
      const server = realCreateServer(...args);
      ownedServer = server;
      return server;
    });
  let appendFailure: jest.SpyInstance | undefined;
  let actualClose: jest.SpyInstance | undefined;
  let guard: ReturnType<typeof setTimeout> | undefined;
  const client = new AbortController();
  let observer:
    Awaited<ReturnType<typeof startCandidateHandlerObserver>> | undefined;
  try {
    observer = await startCandidateHandlerObserver({
      ownedOrigins: [origin],
      evidencePath: path,
      limits: {
        requestBytes: 4096,
        resultBytes: 4096,
        records: 128,
        holdTimeoutMs: 2000,
      },
    });
    opening.mockRestore();
    creating.mockRestore();
    if (!ownedHandle) throw new Error('Owned evidence handle was not captured');
    const registration = observer.register({ scope, operations: [operation] });
    const receipt = await enter(registration.entryUrl);
    let receivedHeaders = false;
    const held = fetch(receipt.holdUrl, {
      headers: { Origin: origin },
      signal: client.signal,
    }).then(async (response) => {
      receivedHeaders = true;
      return response.text();
    });
    const socketOutcome = held.then(
      () => 'result-delivered',
      () => 'socket-closed',
    );
    await observer.waitForRecord(
      'hold-received',
      scope,
      new AbortController().signal,
    );
    const originalEntries = observer.entries(scope);
    const failure = new Error(
      'controlled owned observer release append failure',
    );
    actualClose = jest.spyOn(ownedHandle, 'close');
    appendFailure = jest
      .spyOn(ownedHandle, 'appendFile')
      .mockRejectedValue(failure);
    const boundedGuard = new Promise<string>((resolve) => {
      guard = setTimeout(() => resolve('test-guard-expired'), 500);
    });

    observer.release(receipt.receiptId);
    const beforeGlobalClose = await Promise.race([socketOutcome, boundedGuard]);

    expect(beforeGlobalClose).toBe('socket-closed');
    expect(receivedHeaders).toBe(false);
    expect(actualClose).not.toHaveBeenCalled();
    expect(observer.entries(scope)).toEqual(originalEntries);
    expect(
      (await persisted(path)).filter((record) => record.kind === 'released'),
    ).toEqual([]);
    await expect(observer.close()).rejects.toBe(failure);
    expect(actualClose).toHaveBeenCalledTimes(1);
  } finally {
    clearTimeout(guard);
    client.abort();
    opening.mockRestore();
    creating.mockRestore();
    appendFailure?.mockRestore();
    actualClose?.mockRestore();
    await observer?.close().catch(() => undefined);
    if (ownedServer) {
      const server = ownedServer;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await ownedHandle?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

const origin = 'http://127.0.0.1:4431';
const scope = Object.freeze({
  scenarioId: 'primitive.observer',
  threadId: 'thread-a',
});
const argumentsA = Object.freeze({ code: 'PDX' });
const operation = Object.freeze({
  correlation: 'PDX',
  toolName: 'browserLookup',
  arguments: argumentsA,
  compute: () => ({ code: 'PDX', label: '  café 🛫\n', nested: [null, true] }),
});

/** Owns a private evidence file and observer for HTTP primitive tests only. */
async function withObserver(
  use: (
    observer: Awaited<ReturnType<typeof startCandidateHandlerObserver>>,
    path: string,
  ) => Promise<void>,
  limits: Partial<{
    requestBytes: number;
    resultBytes: number;
    records: number;
    holdTimeoutMs: number;
  }> = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'candidate-observer-'));
  const path = join(directory, 'entries.jsonl');
  const observer = await startCandidateHandlerObserver({
    ownedOrigins: [origin],
    evidencePath: path,
    limits: {
      requestBytes: 4096,
      resultBytes: 4096,
      records: 128,
      holdTimeoutMs: 2000,
      ...limits,
    },
  });
  try {
    await use(observer, path);
  } finally {
    await observer.close();
    await rm(directory, { recursive: true, force: true });
  }
}

/** Calls the actual observer entry endpoint; never supplies a claimed operation result. */
async function enter(
  entryUrl: string,
  body: unknown = {
    correlation: operation.correlation,
    toolName: operation.toolName,
    arguments: argumentsA,
  },
) {
  const response = await fetch(entryUrl, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { receiptId: string; holdUrl: string };
}

/** Reads committed JSONL independently from the observer's query API. */
async function persisted(
  path: string,
): Promise<readonly Record<string, unknown>[]> {
  return (await readFile(path, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('observer commits the actual operation result before acknowledging entry and holds all response headers until release', async () => {
  await withObserver(async (observer, path) => {
    let computations = 0;
    const registration = observer.register({
      scope,
      operations: [
        {
          ...operation,
          compute: () => {
            computations++;
            return operation.compute();
          },
        },
      ],
    });
    const receipt = await enter(registration.entryUrl);
    const before = await persisted(path);
    let headersReceived = false;
    const held = fetch(receipt.holdUrl, { headers: { Origin: origin } }).then(
      (response) => {
        headersReceived = true;
        return response.json();
      },
    );

    await observer.waitForRecord(
      'hold-received',
      scope,
      new AbortController().signal,
    );

    expect(computations).toBe(1);
    expect(before).toContainEqual(
      expect.objectContaining({
        kind: 'entry-committed',
        receiptId: receipt.receiptId,
        result: operation.compute(),
      }),
    );
    expect(observer.entries(scope)).toEqual([
      expect.objectContaining({
        result: operation.compute(),
        serializedResult: JSON.stringify(operation.compute()),
      }),
    ]);
    expect(headersReceived).toBe(false);
    observer.release(receipt.receiptId);
    expect(await held).toEqual(operation.compute());
    expect(headersReceived).toBe(true);
  });
});

test('observer duplicate positive control computes and appends twice without deduplication', async () => {
  await withObserver(async (observer, path) => {
    let computations = 0;
    const registration = observer.register({
      scope,
      operations: [{ ...operation, compute: () => ++computations }],
    });

    const first = await enter(registration.entryUrl);
    const second = await enter(registration.entryUrl);

    const entries = observer.entries(scope);
    expect(computations).toBe(2);
    expect(first.receiptId).not.toBe(second.receiptId);
    expect(entries.map((entry) => entry.result)).toEqual([1, 2]);
    expect(entries[0].seq).toBeLessThan(entries[1].seq);
    expect(
      (await persisted(path)).filter(
        (record) => record.kind === 'entry-committed',
      ),
    ).toHaveLength(2);
  });
});

test('observer canonical binding is scoped, validated, append-only and independent of a client-supplied call id', async () => {
  await withObserver(async (observer, path) => {
    const otherScope = { ...scope, threadId: 'thread-b' };
    const first = observer.register({ scope, operations: [operation] });
    const second = observer.register({
      scope: otherScope,
      operations: [operation],
    });
    await enter(first.entryUrl);
    await enter(second.entryUrl);
    const original = (await persisted(path)).find(
      (record) => record.kind === 'entry-committed',
    );
    const binding = {
      correlation: 'PDX',
      canonicalCallId: 'real-call-a',
      toolName: operation.toolName,
      arguments: argumentsA,
    };

    await observer.bindCanonical(scope, [binding]);

    expect(observer.entries(scope)[0].canonicalCallId).toBe('real-call-a');
    expect(observer.entries(otherScope)[0].canonicalCallId).toBeUndefined();
    expect(
      (await persisted(path)).find(
        (record) => record.kind === 'entry-committed',
      ),
    ).toEqual(original);
    await expect(
      observer.bindCanonical(scope, [
        { ...binding, canonicalCallId: 'forged-rebind' },
      ]),
    ).rejects.toThrow(/bind|conflict/i);
    await expect(
      observer.bindCanonical(otherScope, [
        { ...binding, arguments: { code: 'SEA' } },
      ]),
    ).rejects.toThrow(/argument|bind/i);
    const refused = await fetch(first.entryUrl, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correlation: 'PDX',
        toolName: operation.toolName,
        arguments: argumentsA,
        canonicalCallId: 'page-forgery',
      }),
    });
    expect(refused.ok).toBe(false);
    expect(observer.entries(scope)).toHaveLength(1);
  });
});

test('observer keeps computed entries after aborted holds and replacement clients without treating normal request close as cancellation', async () => {
  await withObserver(async (observer, path) => {
    const registration = observer.register({ scope, operations: [operation] });
    const first = await enter(registration.entryUrl);
    const controller = new AbortController();
    const waiting = fetch(first.holdUrl, {
      headers: { Origin: origin },
      signal: controller.signal,
    });
    const rejected = expect(waiting).rejects.toThrow();
    await observer.waitForRecord(
      'hold-received',
      scope,
      new AbortController().signal,
    );

    controller.abort(new Error('original client destroyed'));
    await rejected;
    await observer.waitForRecord(
      'downstream-closed',
      scope,
      new AbortController().signal,
    );
    observer.release(first.receiptId);
    const second = await enter(registration.entryUrl);
    const replacement = fetch(second.holdUrl, { headers: { Origin: origin } });
    observer.release(second.receiptId);

    expect(await (await replacement).json()).toEqual(operation.compute());
    expect(observer.entries(scope)).toHaveLength(2);
    expect(
      (await persisted(path)).filter(
        (record) => record.kind === 'entry-committed',
      ),
    ).toHaveLength(2);
  });
});

test('observer returns strict owned-origin preflight and records invalid scoped requests without computing them', async () => {
  await withObserver(async (observer) => {
    let computations = 0;
    const registration = observer.register({
      scope,
      operations: [{ ...operation, compute: () => ++computations }],
    });
    const before = observer.records().length;

    const preflight = await fetch(registration.entryUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    const hostile = await fetch(registration.entryUrl, {
      method: 'POST',
      headers: {
        Origin: 'http://127.0.0.1:44310',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    const malformed = await fetch(registration.entryUrl, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{',
    });
    const foreign = await fetch(registration.entryUrl, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correlation: 'SEA',
        toolName: operation.toolName,
        arguments: { code: 'SEA' },
      }),
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);
    expect(preflight.headers.get('vary')).toContain('Origin');
    expect(hostile.ok).toBe(false);
    expect(hostile.headers.get('access-control-allow-origin')).not.toBe('*');
    expect(malformed.ok).toBe(false);
    expect(foreign.ok).toBe(false);
    expect(computations).toBe(0);
    expect(observer.entries(scope)).toEqual([]);
    expect(
      observer
        .records()
        .slice(before)
        .filter((record) => record.kind === 'rejected').length,
    ).toBeGreaterThanOrEqual(3);
    const snapshot = observer.records();
    expect(snapshot.map((record) => record.seq)).toEqual(
      [...new Set(snapshot.map((record) => record.seq))].sort((a, b) => a - b),
    );
  });
});

test('observer enforces request and computed-result byte limits without silently dropping evidence', async () => {
  await withObserver(
    async (observer) => {
      const registration = observer.register({
        scope,
        operations: [{ ...operation, compute: () => '🛫'.repeat(100) }],
      });

      const oversized = await fetch(registration.entryUrl, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ padding: 'x'.repeat(1000) }),
      });
      const resultOverflow = await fetch(registration.entryUrl, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correlation: 'PDX',
          toolName: operation.toolName,
          arguments: argumentsA,
        }),
      });

      expect(oversized.ok).toBe(false);
      expect(resultOverflow.ok).toBe(false);
      expect(observer.entries(scope)).toEqual([]);
      expect(observer.records()).toContainEqual(
        expect.objectContaining({ kind: 'fault' }),
      );
    },
    { requestBytes: 256, resultBytes: 32 },
  );
});

test('observer closes held sockets idempotently and leaves persisted records readable', async () => {
  await withObserver(async (observer, path) => {
    const registration = observer.register({ scope, operations: [operation] });
    const receipt = await enter(registration.entryUrl);
    const closed = new Promise<void>((resolve, reject) => {
      const pending = request(receipt.holdUrl, { headers: { Origin: origin } });
      pending.once('response', () =>
        reject(new Error('held response sent headers before release')),
      );
      pending.once('error', () => resolve());
      pending.end();
    });
    await observer.waitForRecord(
      'hold-received',
      scope,
      new AbortController().signal,
    );

    await observer.close();
    await observer.close();

    await closed;
    expect(observer.entries(scope)).toHaveLength(1);
    expect(await persisted(path)).toContainEqual(
      expect.objectContaining({ kind: 'stop-complete' }),
    );
    expect(() =>
      observer.register({
        scope: { ...scope, threadId: 'late' },
        operations: [operation],
      }),
    ).toThrow(/clos|stop/i);
  });
});

test('observer preserves exact string and null results in independently queryable evidence', async () => {
  await withObserver(async (observer, path) => {
    const value = '  Known café 🛫\n';
    const registration = observer.register({
      scope,
      operations: [
        { ...operation, compute: () => value },
        {
          ...operation,
          correlation: 'SEA',
          arguments: { code: 'SEA' },
          compute: () => null,
        },
      ],
    });

    await enter(registration.entryUrl);
    await enter(registration.entryUrl, {
      correlation: 'SEA',
      toolName: operation.toolName,
      arguments: { code: 'SEA' },
    });

    expect(observer.entries(scope).map((entry) => entry.result)).toEqual([
      value,
      null,
    ]);
    expect(
      observer.entries(scope).map((entry) => entry.serializedResult),
    ).toEqual([JSON.stringify(value), 'null']);
    expect(
      (await persisted(path))
        .filter((record) => record.kind === 'entry-committed')
        .map((record) => record.result),
    ).toEqual([value, null]);
  });
});

test('observer operation failure is visible and never becomes a known result or successful receipt', async () => {
  await withObserver(async (observer) => {
    const registration = observer.register({
      scope,
      operations: [
        {
          ...operation,
          compute: () => {
            throw new Error('owned operation failed');
          },
        },
      ],
    });

    const response = await fetch(registration.entryUrl, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correlation: 'PDX',
        toolName: operation.toolName,
        arguments: argumentsA,
      }),
    });

    expect(response.ok).toBe(false);
    expect(observer.entries(scope)).toEqual([]);
    expect(observer.records()).toContainEqual(
      expect.objectContaining({ kind: 'fault', correlation: 'PDX' }),
    );
  });
});

test('observer refuses an existing evidence path rather than replacing prior evidence', async () => {
  await withObserver(async (observer, path) => {
    const registration = observer.register({ scope, operations: [operation] });
    await enter(registration.entryUrl);
    const original = await readFile(path, 'utf8');

    await expect(
      startCandidateHandlerObserver({
        ownedOrigins: [origin],
        evidencePath: path,
        limits: {
          requestBytes: 4096,
          resultBytes: 4096,
          records: 128,
          holdTimeoutMs: 2000,
        },
      }),
    ).rejects.toThrow(/exist|evidence/i);

    expect(await readFile(path, 'utf8')).toBe(original);
  });
});

test('observer finite hold safety deadline records failure without releasing a result', async () => {
  await withObserver(
    async (observer) => {
      const registration = observer.register({
        scope,
        operations: [operation],
      });
      const receipt = await enter(registration.entryUrl);

      await expect(
        fetch(receipt.holdUrl, { headers: { Origin: origin } }),
      ).rejects.toThrow();

      expect(observer.entries(scope)).toHaveLength(1);
      expect(observer.records()).toContainEqual(
        expect.objectContaining({
          kind: 'fault',
          receiptId: receipt.receiptId,
        }),
      );
      expect(
        observer.records().filter((record) => record.kind === 'released'),
      ).toEqual([]);
    },
    { holdTimeoutMs: 25 },
  );
});
