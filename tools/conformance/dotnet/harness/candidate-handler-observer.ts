import { type FileHandle, open } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

/** JSON values returned by a trusted owned fixture operation. */
export type CandidateObservedJson =
  | null
  | boolean
  | number
  | string
  | readonly CandidateObservedJson[]
  | { readonly [key: string]: CandidateObservedJson };
/** Independently owned scenario and thread identity. */
export interface CandidateObserverScope {
  readonly scenarioId: string;
  readonly threadId: string;
}
/** Actual fixture operation; computation may have an observable counter effect. */
export interface CandidateObservedOperation {
  readonly correlation: string;
  readonly toolName: string;
  readonly arguments: Readonly<Record<string, CandidateObservedJson>>;
  readonly compute: () => CandidateObservedJson;
}
/** Trusted association captured from actual canonical publication. */
export interface CandidateObserverBinding {
  readonly correlation: string;
  readonly canonicalCallId: string;
  readonly toolName: string;
  readonly arguments: Readonly<Record<string, CandidateObservedJson>>;
}
/** Finite observer evidence vocabulary. */
export type CandidateObserverRecordKind =
  | 'request-received'
  | 'entry-committed'
  | 'canonical-binding'
  | 'hold-received'
  | 'released'
  | 'downstream-closed'
  | 'rejected'
  | 'fault'
  | 'stop-start'
  | 'stop-complete';
/** An immutable append-only evidence record independent of page and worker lifetime. */
export interface CandidateObserverRecord {
  readonly kind: CandidateObserverRecordKind;
  readonly seq: number;
  readonly monotonicMs: number;
  readonly scenarioId: string;
  readonly threadId: string;
  readonly correlation?: string;
  readonly receiptId?: string;
  readonly toolName?: string;
  readonly arguments?: Readonly<Record<string, CandidateObservedJson>>;
  readonly result?: CandidateObservedJson;
  readonly serializedResult?: string;
  readonly canonicalCallId?: string;
  readonly reason?: string;
}
/** Positively witnessed execution, including the independently computed result. */
export interface CandidateObserverEntry extends CandidateObserverRecord {
  readonly kind: 'entry-committed';
  readonly receiptId: string;
  readonly correlation: string;
  readonly toolName: string;
  readonly arguments: Readonly<Record<string, CandidateObservedJson>>;
  readonly result: CandidateObservedJson;
  readonly serializedResult: string;
}
/** Finite resource policy supplied by the runner. */
export interface CandidateObserverOptions {
  readonly ownedOrigins: readonly string[];
  readonly evidencePath: string;
  readonly limits: Readonly<{
    requestBytes: number;
    resultBytes: number;
    records: number;
    holdTimeoutMs: number;
  }>;
}
/** Parent-only registration and controls; HTTP exposes only operation entry and held result reads. */
export interface CandidateHandlerObserver {
  readonly register: (
    input: Readonly<{
      scope: CandidateObserverScope;
      operations: readonly CandidateObservedOperation[];
    }>,
  ) => Readonly<{ entryUrl: string; holdBaseUrl: string }>;
  readonly bindCanonical: (
    scope: CandidateObserverScope,
    calls: readonly CandidateObserverBinding[],
  ) => Promise<void>;
  readonly entries: (
    scope: CandidateObserverScope,
  ) => readonly CandidateObserverEntry[];
  readonly records: () => readonly CandidateObserverRecord[];
  readonly waitForRecord: (
    kind: CandidateObserverRecordKind,
    scope: CandidateObserverScope,
    signal: AbortSignal,
  ) => Promise<void>;
  readonly release: (receiptId: string) => void;
  readonly close: () => Promise<void>;
}

/** Copies JSON evidence so caller mutations cannot change retained records. */
function copy<T>(value: T): T {
  return structuredClone(value);
}

/** Rejects non-JSON results rather than allowing JSON.stringify to drop or transform them. */
function resultJson(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0,
): CandidateObservedJson {
  if (depth > 64) throw new Error('Result depth limit');
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || ancestors.has(value))
    throw new Error('JSON result required');
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new Error('Plain JSON result required');
  if (Object.getOwnPropertySymbols(value).length)
    throw new Error('JSON result symbols forbidden');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Object.keys(descriptors).length !== value.length + 1)
        throw new Error('Dense JSON array required');
      const output: CandidateObservedJson[] = [];
      for (let index = 0; index < value.length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
          throw new Error('Dense data array required');
        output.push(resultJson(descriptor.value, ancestors, depth + 1));
      }
      return output;
    }
    const output: Record<string, CandidateObservedJson> = Object.create(null);
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(value),
    )) {
      if (!('value' in descriptor) || !descriptor.enumerable)
        throw new Error('JSON data property required');
      Object.defineProperty(output, key, {
        value: resultJson(descriptor.value, ancestors, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

/** Compares parsed JSON objects independently of property insertion order. */
function equalJson(
  left: CandidateObservedJson,
  right: CandidateObservedJson,
): boolean {
  if (left === right) return true;
  if (
    !left ||
    !right ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)
  )
    return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        equalJson(
          (left as Readonly<Record<string, CandidateObservedJson>>)[key],
          (right as Readonly<Record<string, CandidateObservedJson>>)[key],
        ),
    )
  );
}

/** Starts an owned HTTP primitive; callers must independently qualify actual candidate consumers and workers. */
export async function startCandidateHandlerObserver(
  options: CandidateObserverOptions,
): Promise<CandidateHandlerObserver> {
  for (const origin of options.ownedOrigins) {
    const url = new URL(origin);
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.origin !== origin
    )
      throw new Error('Owned loopback origin required');
  }
  for (const limit of Object.values(options.limits))
    if (!Number.isSafeInteger(limit) || limit <= 0)
      throw new Error('Positive finite observer limits required');
  const file: FileHandle = await open(options.evidencePath, 'wx');
  const records: CandidateObserverRecord[] = [];
  const scopes = new Map<
    string,
    Readonly<{
      scope: CandidateObserverScope;
      operations: readonly CandidateObservedOperation[];
    }>
  >();
  const receipts = new Map<string, CandidateObserverEntry>();
  const held = new Map<string, ServerResponse>();
  const released = new Set<string>();
  const claimed = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const tasks = new Set<Promise<void>>();
  const bindings = new Map<string, CandidateObserverBinding>();
  const changes = new Set<() => void>();
  let sequence = 0;
  let writes = Promise.resolve();
  let bindingQueue = Promise.resolve();
  let closing = false;
  let closePromise: Promise<void> | undefined;
  let failure: Error | undefined;

  const bindingKey = (scope: CandidateObserverScope, correlation: string) =>
    JSON.stringify([scope.scenarioId, scope.threadId, correlation]);

  const append = (
    record: Omit<CandidateObserverRecord, 'seq' | 'monotonicMs'>,
  ): Promise<CandidateObserverRecord> => {
    if (
      sequence >= options.limits.records &&
      record.kind !== 'fault' &&
      record.kind !== 'stop-start' &&
      record.kind !== 'stop-complete'
    )
      return Promise.reject(new Error('Observer evidence record limit'));
    const complete = copy({
      ...record,
      seq: ++sequence,
      monotonicMs: performance.now(),
    });
    const pending = writes.then(async () => {
      await file.appendFile(JSON.stringify(complete) + '\n');
      records.push(complete);
      for (const changed of [...changes]) changed();
    });
    writes = pending;
    void pending.catch((error: unknown) => {
      failure =
        error instanceof Error
          ? error
          : new Error('Observer evidence write failed');
    });
    return pending.then(() => complete);
  };
  const fault = async (
    scope: CandidateObserverScope,
    reason: string,
    receiptId?: string,
    correlation?: string,
  ) => {
    failure ??= new Error(reason);
    await append({
      kind: 'fault',
      ...scope,
      reason,
      ...(receiptId ? { receiptId } : {}),
      ...(correlation ? { correlation } : {}),
    });
  };
  const clearHold = (receiptId: string) => {
    clearTimeout(timers.get(receiptId));
    timers.delete(receiptId);
    held.delete(receiptId);
  };
  const completeHeld = async (receiptId: string) => {
    const response = held.get(receiptId);
    const entry = receipts.get(receiptId);
    if (!response || !entry || !released.has(receiptId) || response.destroyed)
      return;
    clearHold(receiptId);
    try {
      await append({
        kind: 'released',
        scenarioId: entry.scenarioId,
        threadId: entry.threadId,
        correlation: entry.correlation,
        receiptId,
      });
    } catch (error: unknown) {
      response.destroy();
      throw error;
    }
    if (!response.destroyed) {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      response.end(entry.serializedResult);
    }
  };
  const server = createServer((incoming, response) => {
    let requestScope: CandidateObserverScope = { scenarioId: '', threadId: '' };
    const handle = async () => {
      const url = new URL(incoming.url ?? '/', 'http://127.0.0.1');
      const match = /^\/scope\/([^/]+)\/(entry|hold(?:\/([^/]+))?)$/.exec(
        url.pathname,
      );
      const registration = match ? scopes.get(match[1]) : undefined;
      if (closing || !registration) {
        response.writeHead(404).end();
        return;
      }
      const { scope } = registration;
      requestScope = scope;
      const requestOrigin = incoming.headers.origin;
      if (requestOrigin && options.ownedOrigins.includes(requestOrigin)) {
        response.setHeader('Access-Control-Allow-Origin', requestOrigin);
        response.setHeader('Vary', 'Origin');
      }
      if (requestOrigin && !options.ownedOrigins.includes(requestOrigin)) {
        await append({ kind: 'rejected', ...scope, reason: 'unowned-origin' });
        response.writeHead(403).end();
        return;
      }
      if (incoming.method === 'OPTIONS') {
        const method = match?.[2] === 'entry' ? 'POST' : 'GET';
        const requested = String(
          incoming.headers['access-control-request-headers'] ?? '',
        )
          .toLowerCase()
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        if (
          incoming.headers['access-control-request-method'] !== method ||
          requested.some((header) => header !== 'content-type')
        ) {
          response.writeHead(400).end();
          return;
        }
        response
          .writeHead(204, {
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          })
          .end();
        return;
      }
      await append({ kind: 'request-received', ...scope });
      if (failure) {
        response.writeHead(503).end();
        return;
      }
      if (url.search) {
        await append({
          kind: 'rejected',
          ...scope,
          reason: 'unexpected-query',
        });
        response.writeHead(400).end();
        return;
      }
      if (match?.[2] === 'entry' && incoming.method === 'POST') {
        if (
          incoming.headers['content-type']?.split(';')[0].trim() !==
          'application/json'
        ) {
          await append({ kind: 'rejected', ...scope, reason: 'content-type' });
          response.writeHead(415).end();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of incoming) {
          const buffer = Buffer.from(chunk);
          size += buffer.length;
          if (size <= options.limits.requestBytes) chunks.push(buffer);
        }
        if (size > options.limits.requestBytes) {
          await append({
            kind: 'rejected',
            ...scope,
            reason: 'request-byte-limit',
          });
          response.writeHead(413).end();
          return;
        }
        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          await append({ kind: 'rejected', ...scope, reason: 'invalid-json' });
          response.writeHead(400).end();
          return;
        }
        if (
          !body ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          Object.keys(body).sort().join(',') !==
            'arguments,correlation,toolName' ||
          !('correlation' in body) ||
          !('toolName' in body) ||
          !('arguments' in body)
        ) {
          await append({ kind: 'rejected', ...scope, reason: 'entry-shape' });
          response.writeHead(400).end();
          return;
        }
        const operation = registration.operations.find(
          (candidate) => candidate.correlation === body.correlation,
        );
        if (
          !operation ||
          body.toolName !== operation.toolName ||
          !equalJson(resultJson(body.arguments), operation.arguments)
        ) {
          await append({
            kind: 'rejected',
            ...scope,
            reason: 'operation-arguments',
            ...(typeof body.correlation === 'string'
              ? { correlation: body.correlation }
              : {}),
          });
          response.writeHead(400).end();
          return;
        }
        let result: CandidateObservedJson;
        try {
          result = resultJson(operation.compute());
          if (
            Buffer.byteLength(JSON.stringify(result)) >
            options.limits.resultBytes
          )
            throw new Error('Computed result byte limit');
        } catch {
          await fault(
            scope,
            'operation-or-result-failure',
            undefined,
            operation.correlation,
          );
          response.writeHead(500).end();
          return;
        }
        const receiptId = randomUUID();
        const entry = (await append({
          kind: 'entry-committed',
          ...scope,
          receiptId,
          correlation: operation.correlation,
          toolName: operation.toolName,
          arguments: operation.arguments,
          result,
          serializedResult: JSON.stringify(result),
        })) as CandidateObserverEntry;
        receipts.set(receiptId, entry);
        response.writeHead(201, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        response.end(
          JSON.stringify({
            receiptId,
            holdUrl: `${base}/scope/${match[1]}/hold/${receiptId}`,
          }),
        );
        return;
      }
      const receiptId = match?.[3];
      const entry = receiptId ? receipts.get(receiptId) : undefined;
      if (
        incoming.method !== 'GET' ||
        !receiptId ||
        !entry ||
        entry.threadId !== scope.threadId ||
        entry.scenarioId !== scope.scenarioId ||
        claimed.has(receiptId)
      ) {
        await append({
          kind: 'rejected',
          ...scope,
          reason: 'invalid-or-consumed-hold',
        });
        response.writeHead(404).end();
        return;
      }
      claimed.add(receiptId);
      held.set(receiptId, response);
      timers.set(
        receiptId,
        setTimeout(() => {
          const task = fault(scope, 'hold-deadline', receiptId).finally(() => {
            clearHold(receiptId);
            response.destroy();
          });
          tasks.add(task);
          void task.then(
            () => tasks.delete(task),
            () => tasks.delete(task),
          );
        }, options.limits.holdTimeoutMs),
      );
      response.once('close', () => {
        if (response.writableFinished) return;
        clearHold(receiptId);
        const task = append({
          kind: 'downstream-closed',
          ...scope,
          receiptId,
        }).then(() => undefined);
        tasks.add(task);
        void task.then(
          () => tasks.delete(task),
          () => tasks.delete(task),
        );
      });
      await append({ kind: 'hold-received', ...scope, receiptId });
      await completeHeld(receiptId);
    };
    const task = handle().catch(async () => {
      try {
        await fault(requestScope, 'request-or-evidence-failure');
      } catch {
        response.destroy();
        return;
      }
      if (response.headersSent) response.destroy();
      else response.writeHead(500).end();
    });
    tasks.add(task);
    void task.then(
      () => tasks.delete(task),
      () => tasks.delete(task),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  }).catch(async (error: unknown) => {
    await file.close();
    throw error;
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    register(input) {
      if (closing) throw new Error('Observer closed');
      if (
        !input.scope.scenarioId ||
        !input.scope.threadId ||
        !input.operations.length ||
        [...scopes.values()].some(
          (value) =>
            value.scope.threadId === input.scope.threadId &&
            value.scope.scenarioId === input.scope.scenarioId,
        )
      )
        throw new Error('Unique observer scope required');
      if (
        new Set(input.operations.map((operation) => operation.correlation))
          .size !== input.operations.length ||
        input.operations.some(
          (operation) => !operation.correlation || !operation.toolName,
        )
      )
        throw new Error('Distinct operation correlation required');
      const key = randomUUID();
      scopes.set(key, {
        scope: copy(input.scope),
        operations: input.operations.map((operation) => ({
          ...operation,
          arguments: copy(operation.arguments),
        })),
      });
      return Object.freeze({
        entryUrl: `${base}/scope/${key}/entry`,
        holdBaseUrl: `${base}/scope/${key}/hold`,
      });
    },
    bindCanonical(scopeInput, callInput) {
      const scope = copy(scopeInput);
      const calls = copy(callInput);
      const task = bindingQueue.then(async () => {
        if (closing || failure) throw new Error('Observer closed or failed');
        const registration = [...scopes.values()].find(
          (value) =>
            value.scope.threadId === scope.threadId &&
            value.scope.scenarioId === scope.scenarioId,
        );
        const witnessedCorrelations = new Set(
          records
            .filter(
              (record) =>
                record.kind === 'entry-committed' &&
                record.threadId === scope.threadId &&
                record.scenarioId === scope.scenarioId,
            )
            .map((record) => record.correlation),
        );
        if (
          !registration ||
          calls.length === 0 ||
          calls.length !== witnessedCorrelations.size ||
          calls.some((call) => !witnessedCorrelations.has(call.correlation)) ||
          new Set(calls.map((call) => call.correlation)).size !==
            calls.length ||
          new Set(calls.map((call) => call.canonicalCallId)).size !==
            calls.length
        )
          throw new Error('Invalid binding scope or duplicate call');
        for (const call of calls) {
          const operation = registration.operations.find(
            (value) => value.correlation === call.correlation,
          );
          const prior = bindings.get(bindingKey(scope, call.correlation));
          const reused = [...bindings.entries()].some(
            ([key, value]) =>
              key !== bindingKey(scope, call.correlation) &&
              key.startsWith(
                JSON.stringify([scope.scenarioId, scope.threadId]).slice(
                  0,
                  -1,
                ) + ',',
              ) &&
              value.canonicalCallId === call.canonicalCallId,
          );
          const witnessed = records.some(
            (record) =>
              record.kind === 'entry-committed' &&
              record.threadId === scope.threadId &&
              record.scenarioId === scope.scenarioId &&
              record.correlation === call.correlation,
          );
          if (
            !operation ||
            !witnessed ||
            !call.canonicalCallId ||
            call.toolName !== operation.toolName ||
            !equalJson(call.arguments, operation.arguments) ||
            (prior && prior.canonicalCallId !== call.canonicalCallId) ||
            reused
          )
            throw new Error('Canonical binding argument or identity conflict');
        }
        for (const call of calls) {
          const key = bindingKey(scope, call.correlation);
          if (bindings.has(key)) continue;
          await append({ kind: 'canonical-binding', ...scope, ...call });
        }
        if (closing || failure) throw new Error('Observer closed or failed');
        for (const call of calls)
          bindings.set(bindingKey(scope, call.correlation), copy(call));
      });
      bindingQueue = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    },
    entries: (scope) =>
      copy(
        records
          .filter(
            (record): record is CandidateObserverEntry =>
              record.kind === 'entry-committed' &&
              record.scenarioId === scope.scenarioId &&
              record.threadId === scope.threadId,
          )
          .map((record) => {
            const binding = bindings.get(bindingKey(scope, record.correlation));
            return {
              ...record,
              ...(binding ? { canonicalCallId: binding.canonicalCallId } : {}),
            };
          }),
      ),
    records: () => copy(records),
    waitForRecord(kind, scope, signal) {
      return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          changes.delete(check);
          signal.removeEventListener('abort', abort);
        };
        const abort = () => {
          cleanup();
          reject(new Error('Observer wait aborted'));
        };
        const check = () => {
          if (
            records.some(
              (record) =>
                record.kind === kind &&
                record.threadId === scope.threadId &&
                record.scenarioId === scope.scenarioId,
            )
          ) {
            cleanup();
            resolve();
          } else if (closing) {
            cleanup();
            reject(new Error('Observer closed'));
          }
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('Observer record wait deadline'));
        }, options.limits.holdTimeoutMs);
        changes.add(check);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        else check();
      });
    },
    release(receiptId) {
      if (closing) return;
      released.add(receiptId);
      const task = completeHeld(receiptId).catch(async () => {
        held.get(receiptId)?.destroy();
        await fault(
          { scenarioId: '', threadId: '' },
          'release-failure',
          receiptId,
        );
      });
      tasks.add(task);
      void task.then(
        () => tasks.delete(task),
        () => tasks.delete(task),
      );
    },
    close() {
      closePromise ??= (async () => {
        closing = true;
        const errors: unknown[] = [];
        const attempt = async (action: () => unknown | Promise<unknown>) => {
          try {
            await action();
          } catch (error: unknown) {
            if (!errors.includes(error)) errors.push(error);
          }
        };
        for (const changed of [...changes]) await attempt(changed);
        await attempt(() =>
          append({ kind: 'stop-start', scenarioId: '', threadId: '' }),
        );
        for (const response of held.values())
          await attempt(() => response.destroy());
        held.clear();
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
        const serverClosed = new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        await attempt(() => server.closeAllConnections());
        await attempt(() => serverClosed);
        await attempt(() => bindingQueue);
        const completed = await Promise.allSettled([...tasks]);
        for (const result of completed)
          if (result.status === 'rejected')
            await attempt(() => Promise.reject(result.reason));
        await attempt(() => writes);
        await attempt(() =>
          append({ kind: 'stop-complete', scenarioId: '', threadId: '' }),
        );
        await attempt(() => file.close());
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1)
          throw new AggregateError(errors, 'Observer cleanup failed');
      })();
      return closePromise;
    },
  };
}
