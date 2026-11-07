/** Memory-only live variant of the owned recovery proxy; source completion precedes physical commit validation and loss. */
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import {
  type ClientRequest,
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  request,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { performance } from 'node:perf_hooks';

/** Actual owned worker registration; the parent separately verifies candidate package and loaded-host identity. */
export interface LiveRecoveryOwnedWorker {
  readonly id: string;
  readonly origin: string;
  readonly loadedIdentityEvidence: string;
}
/** Immutable scenario route selected only by parent-owned controls. */
export interface LiveRecoveryProxyThread {
  readonly scenarioId: string;
  readonly threadId: string;
  readonly workerId: string;
  readonly recoveryPath: string;
  readonly principal: string;
}
/** Controlled interventions apply to actual forwarded run streams only. */
export type LiveRecoveryRunIntervention =
  | 'pass'
  | 'post-commit-loss'
  | 'disconnect-before-delivered-ack'
  | 'hold-after-delivered-ack'
  | 'disconnect-after-delivered-ack'
  | 'malform-after-upstream-ack'
  | 'hold-before-delivery';
/** Controlled recovery mutations must derive from an actual worker response. */
export type LiveRecoveryReadIntervention =
  | 'pass'
  | 'corrupt-completed-history'
  | 'real-v1'
  | 'downgrade-real-v2'
  | 'unsupported-capability'
  | 'mismatched-revision'
  | 'duplicate-call-ids'
  | 'missing-call-id'
  | 'extra-capability-field';
/** Explicit evidence boundaries; socket write completion never claims browser receipt. */
export type LiveRecoveryProxyBoundary =
  | 'request'
  | 'upstream-complete'
  | 'commit-verified'
  | 'post-commit-loss'
  | 'upstream-headers'
  | 'delivered-headers'
  | 'upstream-body'
  | 'delivered-body'
  | 'upstream-ack'
  | 'downstream-ack-write'
  | 'downstream-terminal-write'
  | 'downstream-closed'
  | 'backpressure'
  | 'drain'
  | 'complete'
  | 'mutation'
  | 'route-change'
  | 'rejected'
  | 'fault'
  | 'stop-start'
  | 'stop-complete';
/** Exact entity byte evidence; empty buffers on nonbody events carry no byte claim. */
export interface LiveRecoveryProxyRecord {
  readonly kind: LiveRecoveryProxyBoundary;
  readonly seq: number;
  readonly monotonicMs: number;
  readonly requestId: string;
  readonly scenarioId: string;
  readonly threadId: string;
  readonly workerId: string;
  readonly routeEpoch: number;
  readonly bytes: Buffer;
  readonly incomingBody: Buffer;
  readonly forwardedBody: Buffer;
  readonly rawHeaders?: readonly string[];
  readonly forwardedHeaders?: Readonly<IncomingHttpHeaders>;
  readonly headers?: Readonly<OutgoingHttpHeaders>;
  readonly status?: number;
  readonly reason?: string;
  /** Owned local cause confirmed by the committed same-request downstream closure. */
  readonly faultCause?: 'downstream-closed';
  /** Delivery boundary that directly observed the destroyed downstream response. */
  readonly faultStage?: 'before-write';
  /** Sequence returned by persistence of the actual downstream-closed receipt. */
  readonly downstreamCloseSeq?: number;
}
/** Owned resource bounds; safety hold deadlines are infrastructure failures. */
export interface LiveRecoveryProxyOptions {
  readonly ownedOrigins: readonly string[];
  readonly limits: Readonly<{
    requestBytes: number;
    responseBytes: number;
    frameBytes: number;
    records: number;
    holdTimeoutMs: number;
  }>;
}
/** Stable loopback transport with parent-only route and intervention controls. */
export interface LiveRecoveryProxy {
  readonly origin: string;
  readonly registerWorker: (worker: LiveRecoveryOwnedWorker) => void;
  readonly registerThread: (thread: LiveRecoveryProxyThread) => void;
  readonly switchWorker: (threadId: string, workerId: string) => Promise<void>;
  readonly armReadEffect: (
    threadId: string,
    effect: () => Promise<void>,
  ) => void;
  readonly armCommittedLoss: (
    threadId: string,
    validatePhysicalCommitAndTeardown: () => Promise<void>,
  ) => void;
  readonly armRun: (
    threadId: string,
    mode: LiveRecoveryRunIntervention,
  ) => void;
  readonly armRead: (
    threadId: string,
    mode: LiveRecoveryReadIntervention,
  ) => void;
  readonly waitFor: (
    requestId: string,
    boundary: LiveRecoveryProxyBoundary,
    signal: AbortSignal,
  ) => Promise<void>;
  readonly waitForThread: (
    threadId: string,
    boundary: LiveRecoveryProxyBoundary,
    signal: AbortSignal,
  ) => Promise<LiveRecoveryProxyRecord>;
  readonly release: (requestId: string) => void;
  readonly records: (threadId?: string) => readonly LiveRecoveryProxyRecord[];
  readonly close: () => Promise<void>;
}

/** Clones buffers and header arrays before evidence crosses the parent API boundary. */
function cloneRecord(record: LiveRecoveryProxyRecord): LiveRecoveryProxyRecord {
  return {
    ...record,
    bytes: Buffer.from(record.bytes),
    incomingBody: Buffer.from(record.incomingBody),
    forwardedBody: Buffer.from(record.forwardedBody),
    ...(record.rawHeaders ? { rawHeaders: [...record.rawHeaders] } : {}),
    ...(record.forwardedHeaders
      ? { forwardedHeaders: structuredClone(record.forwardedHeaders) }
      : {}),
    ...(record.headers ? { headers: structuredClone(record.headers) } : {}),
  };
}

/** Waits for socket backpressure with explicit close and error alternatives. */
function drained(response: ServerResponse): Promise<void> {
  if (!response.writableNeedDrain) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      response.off('drain', drain);
      response.off('close', close);
      response.off('error', error);
    };
    const drain = () => {
      cleanup();
      resolve();
    };
    const close = () => {
      cleanup();
      reject(new Error('Downstream closed during backpressure'));
    };
    const error = (reason: Error) => {
      cleanup();
      reject(reason);
    };
    response.once('drain', drain);
    response.once('close', close);
    response.once('error', error);
    if (response.destroyed) close();
  });
}

/** Bounded SSE inspection observes original bytes without re-encoding the forwarded stream. */
function acknowledgementParser(limit: number) {
  let fragments: Buffer[] = [];
  let frameBytes = 0;
  let newlines = 0;
  let offset = 0;
  return (chunk: Buffer): readonly number[] => {
    const acknowledgements: number[] = [];
    let start = 0;
    for (let index = 0; index < chunk.length; index++) {
      frameBytes++;
      if (frameBytes > limit) throw new Error('SSE frame byte limit');
      const byte = chunk[index];
      if (byte === 10) newlines++;
      else if (byte !== 13) newlines = 0;
      if (byte !== 10 || newlines < 2) continue;
      fragments.push(chunk.subarray(start, index + 1));
      const data = Buffer.concat(fragments)
        .toString('utf8')
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      try {
        const value: unknown = JSON.parse(data);
        if (
          value &&
          typeof value === 'object' &&
          'type' in value &&
          value.type === 'RUN_STARTED'
        )
          acknowledgements.push(offset + index + 1);
      } catch {
        /* A non-JSON upstream frame is forwarded unchanged, not treated as an ACK. */
      }
      fragments = [];
      frameBytes = 0;
      newlines = 0;
      start = index + 1;
    }
    if (start < chunk.length) fragments.push(chunk.subarray(start));
    offset += chunk.length;
    return acknowledgements;
  };
}

/** Recognizes one exact normal-run terminal while retaining genuine HTTP EOF as a separate obligation. */
function normalRunTerminalWitness(
  limit: number,
  threadId: string,
  runId: string,
) {
  let fragments: Buffer[] = [];
  let frameBytes = 0;
  let newlines = 0;
  let offset = 0;
  let started = false;
  let terminalEnd: number | undefined;
  return {
    observe(chunk: Buffer): void {
      let start = 0;
      for (let index = 0; index < chunk.length; index++) {
        if (terminalEnd !== undefined)
          throw new Error('Recovery source bytes followed its terminal');
        if (++frameBytes > limit) throw new Error('SSE frame byte limit');
        const byte = chunk[index];
        if (byte === 10) newlines++;
        else if (byte !== 13) newlines = 0;
        if (byte !== 10 || newlines < 2) continue;
        fragments.push(chunk.subarray(start, index + 1));
        const text = Buffer.concat(fragments)
          .toString('utf8')
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n');
        const event = JSON.parse(text);
        if (!started) {
          if (
            event.type !== 'RUN_STARTED' ||
            event.threadId !== threadId ||
            event.runId !== runId
          )
            throw new Error('Recovery source start identity mismatch');
          started = true;
        } else if (event.type === 'RUN_STARTED')
          throw new Error('Recovery source duplicate start');
        if (event.type === 'RUN_FINISHED') {
          if (event.threadId !== threadId || event.runId !== runId)
            throw new Error('Recovery source terminal identity mismatch');
          terminalEnd = offset + index + 1;
        }
        if (event.type === 'RUN_ERROR')
          throw new Error('Recovery source error terminal');
        fragments = [];
        frameBytes = 0;
        newlines = 0;
        start = index + 1;
      }
      if (start < chunk.length) fragments.push(chunk.subarray(start));
      offset += chunk.length;
    },
    terminalEnd: () => terminalEnd,
    complete: () => {
      if (
        !started ||
        terminalEnd === undefined ||
        frameBytes !== 0 ||
        fragments.length !== 0
      )
        throw new Error('Recovery genuine source incomplete');
    },
  };
}

/** Locates an actual complete source frame before permitting malformed-stream intervention. */
function frameEnd(bytes: Buffer): number {
  let newlines = 0;
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] === 10) newlines++;
    else if (bytes[index] !== 13) newlines = 0;
    if (bytes[index] === 10 && newlines >= 2) return index + 1;
  }
  return -1;
}

/** Narrows an owned parsed response without manufacturing missing recovery state. */
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Derives a negative read response from a genuine V2 Pending source. */
function mutateRead(
  bytes: Buffer,
  mode: Exclude<LiveRecoveryReadIntervention, 'pass' | 'real-v1'>,
): Buffer {
  const source: unknown = JSON.parse(bytes.toString('utf8'));
  if (mode === 'corrupt-completed-history') {
    if (
      !object(source) ||
      source.schemaVersion !== 2 ||
      source.disposition !== 'Completed' ||
      !object(source.snapshot) ||
      !Array.isArray(source.snapshot.messages)
    )
      throw new Error('Genuine Completed source required');
    const user = source.snapshot.messages.find(
      (message: unknown) =>
        object(message) &&
        message.role === 'user' &&
        typeof message.content === 'string',
    );
    if (!object(user) || typeof user.content !== 'string')
      throw new Error('Genuine Completed user history required');
    user.content += ' [deterministic corrupted delivery]';
    return Buffer.from(JSON.stringify(source));
  }

  if (
    !object(source) ||
    source.schemaVersion !== 2 ||
    source.disposition !== 'Pending' ||
    !Number.isSafeInteger(source.serverRevision) ||
    !object(source.snapshot) ||
    !object(source.snapshot.pendingBrowserRecovery)
  )
    throw new Error('Genuine Pending V2 source required');
  const capability = source.snapshot.pendingBrowserRecovery;
  if (
    capability.protocolVersion !== 1 ||
    capability.serverRevision !== source.serverRevision ||
    !Array.isArray(capability.callIds) ||
    !capability.callIds.length ||
    capability.callIds.some((id: unknown) => typeof id !== 'string' || !id) ||
    new Set(capability.callIds).size !== capability.callIds.length
  )
    throw new Error('Genuine complete capability required');
  if (mode === 'unsupported-capability') capability.protocolVersion = 999;
  else if (mode === 'mismatched-revision')
    source.serverRevision = Number(source.serverRevision) + 1;
  else if (mode === 'duplicate-call-ids')
    capability.callIds = [capability.callIds[0], ...capability.callIds];
  else if (mode === 'missing-call-id')
    capability.callIds = capability.callIds.slice(0, -1);
  else if (mode === 'extra-capability-field') capability.unexpected = true;
  else source.schemaVersion = 1;
  return Buffer.from(JSON.stringify(source));
}

/** Starts an HTTP primitive; its Node upstream tests establish no actual .NET or browser qualification. */
export async function startLiveRecoveryProxy(
  options: LiveRecoveryProxyOptions,
): Promise<LiveRecoveryProxy> {
  for (const origin of options.ownedOrigins) {
    const url = new URL(origin);
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.origin !== origin
    )
      throw new Error('Owned loopback candidate origin required');
  }
  for (const limit of Object.values(options.limits))
    if (!Number.isSafeInteger(limit) || limit <= 0)
      throw new Error('Positive finite proxy limits required');
  let retainedBytes = 0;
  let requestFailure: Error | undefined;
  const readEffects = new Map<string, () => Promise<void>>();
  const commitValidators = new Map<string, () => Promise<void>>();
  const workers = new Map<string, LiveRecoveryOwnedWorker>();
  const threads = new Map<
    string,
    LiveRecoveryProxyThread & { readonly epoch: number }
  >();
  const records: LiveRecoveryProxyRecord[] = [];
  const active = new Set<ClientRequest>();
  const tasks = new Set<Promise<void>>();
  const changes = new Set<() => void>();
  const runModes = new Map<string, LiveRecoveryRunIntervention>();
  const readModes = new Map<string, LiveRecoveryReadIntervention>();
  const gates = new Map<string, { release: () => void; abort: () => void }>();
  let sequence = 0;
  let writes = Promise.resolve();
  let closing = false;
  let closePromise: Promise<void> | undefined;
  let writeFailure: Error | undefined;

  const append = (
    value: Partial<LiveRecoveryProxyRecord> &
      Pick<LiveRecoveryProxyRecord, 'kind'>,
  ): Promise<LiveRecoveryProxyRecord> => {
    if (
      sequence >= options.limits.records &&
      value.kind !== 'fault' &&
      value.kind !== 'stop-start' &&
      value.kind !== 'stop-complete'
    )
      return Promise.reject(new Error('Proxy evidence record limit'));
    const record: LiveRecoveryProxyRecord = cloneRecord({
      requestId: '',
      scenarioId: '',
      threadId: '',
      workerId: '',
      routeEpoch: 0,
      bytes: Buffer.alloc(0),
      incomingBody: Buffer.alloc(0),
      forwardedBody: Buffer.alloc(0),
      ...value,
      seq: ++sequence,
      monotonicMs: performance.now(),
    });
    const pending = writes.then(async () => {
      retainedBytes +=
        record.bytes.length +
        record.incomingBody.length +
        record.forwardedBody.length +
        1024;
      if (retainedBytes > 24 * 1024 * 1024)
        throw new Error('Recovery proxy memory limit');
      records.push(record);
      for (const changed of [...changes]) changed();
    });
    writes = pending;
    void pending.catch((error: unknown) => {
      writeFailure =
        error instanceof Error
          ? error
          : new Error('Proxy evidence write failed');
    });
    return pending.then(() => record);
  };
  const wait = (
    matches: (record: LiveRecoveryProxyRecord) => boolean,
    signal: AbortSignal,
  ): Promise<LiveRecoveryProxyRecord> =>
    new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        changes.delete(check);
        signal.removeEventListener('abort', abort);
      };
      const abort = () => {
        cleanup();
        reject(new Error('Proxy wait aborted'));
      };
      const check = () => {
        const record = records.find(matches);
        if (record) {
          cleanup();
          resolve(cloneRecord(record));
        } else if (closing) {
          cleanup();
          reject(new Error('Proxy closed'));
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Proxy boundary wait deadline'));
      }, options.limits.holdTimeoutMs);
      changes.add(check);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      else check();
    });

  const server = createServer((incoming, response) => {
    const requestId = randomUUID();
    let context = {
      requestId,
      scenarioId: '',
      threadId: '',
      workerId: '',
      routeEpoch: 0,
    };
    const beforeWriteDisposals = new WeakSet<Error>();
    let observeDownstreamClose!: (
      observation:
        | Readonly<{ record: LiveRecoveryProxyRecord; closing: boolean }>
        | undefined,
    ) => void;
    const downstreamClose = new Promise<
      | Readonly<{ record: LiveRecoveryProxyRecord; closing: boolean }>
      | undefined
    >((resolve) => {
      observeDownstreamClose = resolve;
    });
    /** Creates owned identity only at the actual prewrite destroyed observation. */
    const requireWritableDownstream = () => {
      if (!response.destroyed) return;
      const error = new Error('Downstream closed');
      beforeWriteDisposals.add(error);
      throw error;
    };
    let cancellation: (() => void) | undefined;
    const sendHeaders = async (
      status: number,
      headers: OutgoingHttpHeaders = {},
    ) => {
      if (response.headersSent) return;
      for (const [name, value] of Object.entries(headers))
        if (value !== undefined) response.setHeader(name, value);
      // Fresh downstream sockets keep injected empty responses from replaying on reused connections.
      response.setHeader('Connection', 'close');
      response.writeHead(status);
      await append({
        kind: 'delivered-headers',
        ...context,
        status: response.statusCode,
        headers: response.getHeaders(),
      });
    };
    const handle = async () => {
      const path = incoming.url ?? '/';
      const requestOrigin = incoming.headers.origin;
      if (requestOrigin && options.ownedOrigins.includes(requestOrigin)) {
        response.setHeader('Access-Control-Allow-Origin', requestOrigin);
        response.setHeader('Vary', 'Origin');
      }
      if (
        closing ||
        writeFailure ||
        (requestOrigin && !options.ownedOrigins.includes(requestOrigin))
      ) {
        await append({
          kind: 'rejected',
          requestId,
          reason: 'closed-or-unowned-origin',
        });
        await sendHeaders(403);
        response.end();
        return;
      }
      const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
      if (
        incoming.headers.host !== host ||
        !path.startsWith('/') ||
        path.startsWith('//') ||
        path.includes('?')
      ) {
        await append({
          kind: 'rejected',
          requestId,
          reason: 'unowned-request-target',
        });
        await sendHeaders(400);
        response.end();
        return;
      }
      if (incoming.method === 'OPTIONS') {
        const allowed = new Set([
          'content-type',
          'accept',
          'authorization',
          'x-fixture-principal',
          'hashbrown-recovery-version',
        ]);
        const requested = String(
          incoming.headers['access-control-request-headers'] ?? '',
        )
          .toLowerCase()
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        if (
          (path !== '/run' &&
            ![...threads.values()].some(
              (thread) => thread.recoveryPath === path,
            )) ||
          incoming.headers['access-control-request-method'] !== 'POST' ||
          requested.some((header) => !allowed.has(header))
        ) {
          await sendHeaders(400);
          response.end();
          return;
        }
        await sendHeaders(204, {
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers':
            'Content-Type, Accept, Authorization, X-Fixture-Principal, Hashbrown-Recovery-Version',
        });
        response.end();
        return;
      }
      if (
        incoming.method !== 'POST' ||
        (path !== '/run' &&
          ![...threads.values()].some((thread) => thread.recoveryPath === path))
      ) {
        await append({
          kind: 'rejected',
          requestId,
          reason: 'unregistered-route',
        });
        await sendHeaders(404);
        response.end();
        return;
      }
      const chunks: Buffer[] = [];
      let incomingBytes = 0;
      for await (const chunk of incoming) {
        const bytes = Buffer.from(chunk);
        incomingBytes += bytes.length;
        if (incomingBytes <= options.limits.requestBytes) chunks.push(bytes);
      }
      if (incomingBytes > options.limits.requestBytes) {
        await append({
          kind: 'rejected',
          requestId,
          reason: 'request-byte-limit',
        });
        await sendHeaders(413);
        response.end();
        return;
      }
      const body = Buffer.concat(chunks);
      let parsed: unknown;
      try {
        parsed =
          path === '/run' ? JSON.parse(body.toString('utf8')) : undefined;
      } catch {
        await append({
          kind: 'rejected',
          requestId,
          reason: 'invalid-request-json',
        });
        await sendHeaders(400);
        response.end();
        return;
      }
      const threadId =
        parsed &&
        typeof parsed === 'object' &&
        'threadId' in parsed &&
        typeof parsed.threadId === 'string'
          ? parsed.threadId
          : [...threads.values()].find((thread) => thread.recoveryPath === path)
              ?.threadId;
      const thread = threadId ? threads.get(threadId) : undefined;
      const worker = thread ? workers.get(thread.workerId) : undefined;
      if (
        !thread ||
        !worker ||
        incoming.headers['x-fixture-principal'] !== thread.principal
      ) {
        await append({
          kind: 'rejected',
          requestId,
          reason: 'unregistered-thread-or-principal',
        });
        await sendHeaders(403);
        response.end();
        return;
      }
      context = {
        requestId,
        scenarioId: thread.scenarioId,
        threadId: thread.threadId,
        workerId: worker.id,
        routeEpoch: thread.epoch,
      };
      const headerNames = incoming.rawHeaders
        .filter((_header, index) => index % 2 === 0)
        .map((header) => header.toLowerCase());
      if (
        [
          'authorization',
          'x-fixture-principal',
          'hashbrown-recovery-version',
          'content-type',
          'content-length',
          'host',
        ].some(
          (name) => headerNames.filter((header) => header === name).length > 1,
        )
      ) {
        await append({
          kind: 'rejected',
          ...context,
          rawHeaders: incoming.rawHeaders,
          incomingBody: body,
          reason: 'duplicate-routing-header',
        });
        await sendHeaders(400);
        response.end();
        return;
      }
      if (
        incoming.headers['content-type']?.split(';')[0].trim() !==
        'application/json'
      ) {
        await append({ kind: 'rejected', ...context, reason: 'content-type' });
        await sendHeaders(415);
        response.end();
        return;
      }
      const runMode =
        path === '/run' ? (runModes.get(thread.threadId) ?? 'pass') : 'pass';
      const readMode =
        path !== '/run' ? (readModes.get(thread.threadId) ?? 'pass') : 'pass';
      if (path === '/run') runModes.delete(thread.threadId);
      else {
        readModes.delete(thread.threadId);
        const effect = readEffects.get(thread.threadId);
        readEffects.delete(thread.threadId);
        if (effect) await effect();
      }
      let normalTerminalWritten = false;
      let sourceDrainTimer: ReturnType<typeof setTimeout> | undefined;
      const headers: IncomingHttpHeaders = {
        ...incoming.headers,
        host: new URL(worker.origin).host,
        'content-length': String(body.length),
      };
      delete headers.connection;
      delete headers['transfer-encoding'];
      if (readMode === 'real-v1') delete headers['hashbrown-recovery-version'];
      await append({
        kind: 'request',
        ...context,
        rawHeaders: incoming.rawHeaders,
        incomingBody: body,
        forwardedBody: body,
        forwardedHeaders: headers,
      });
      const upstream = request(new URL(path, worker.origin), {
        method: incoming.method,
        headers,
      });
      active.add(upstream);
      let released = false;
      let aborted = false;
      let acceptGate: (() => void) | undefined;
      let rejectGate: ((error: Error) => void) | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanupGate = () => {
        clearTimeout(timer);
        gates.delete(requestId);
      };
      const abortGate = () => {
        aborted = true;
        cleanupGate();
        rejectGate?.(new Error('Held response aborted'));
      };
      gates.set(requestId, {
        release: () => {
          released = true;
          cleanupGate();
          acceptGate?.();
        },
        abort: abortGate,
      });
      const hold = async () => {
        if (released) return;
        if (aborted || response.destroyed || closing)
          throw new Error('Held response aborted');
        await new Promise<void>((resolve, reject) => {
          acceptGate = resolve;
          rejectGate = reject;
          timer = setTimeout(() => {
            const task = append({
              kind: 'fault',
              ...context,
              reason: 'hold-deadline',
            }).then(() => {
              response.destroy();
              upstream.destroy();
              abortGate();
            });
            tasks.add(task);
            void task.then(
              () => tasks.delete(task),
              () => {
                tasks.delete(task);
                response.destroy();
                upstream.destroy();
                abortGate();
              },
            );
          }, options.limits.holdTimeoutMs);
        });
      };
      cancellation = () => {
        abortGate();
        upstream.destroy();
      };
      response.once('close', () => {
        if (response.writableFinished) return;
        const closingAtClose = closing;
        if (!normalTerminalWritten || closingAtClose) cancellation?.();
        const task = append({ kind: 'downstream-closed', ...context }).then(
          (record) => {
            observeDownstreamClose({ record, closing: closingAtClose });
          },
          (error: unknown) => {
            observeDownstreamClose(undefined);
            throw error;
          },
        );
        tasks.add(task);
        void task.then(
          () => tasks.delete(task),
          () => {
            // Retain failed close evidence for cleanup without an unhandled rejection.
          },
        );
      });
      try {
        const started = once(upstream, 'response') as Promise<
          [IncomingMessage]
        >;
        upstream.end(body);
        const [result] = await started;
        await append({
          kind: 'upstream-headers',
          ...context,
          status: result.statusCode,
          rawHeaders: result.rawHeaders,
        });
        const responseHeaders = { ...result.headers };
        for (const key of [
          'connection',
          'transfer-encoding',
          'access-control-allow-origin',
          'vary',
        ])
          delete responseHeaders[key];
        if (
          runMode !== 'pass' ||
          (readMode !== 'pass' && readMode !== 'real-v1')
        )
          for (const key of ['content-length', 'content-encoding', 'etag'])
            delete responseHeaders[key];
        let deliveredBytes = 0;
        let upstreamBytes = 0;
        let ackEnd: number | undefined;
        let ackWritten = false;
        const parseAcknowledgements = acknowledgementParser(
          options.limits.frameBytes,
        );
        const expectedRunId =
          parsed &&
          typeof parsed === 'object' &&
          'runId' in parsed &&
          typeof parsed.runId === 'string' &&
          parsed.runId.length > 0
            ? parsed.runId
            : undefined;
        const terminal =
          path === '/run' && runMode === 'pass' && expectedRunId
            ? normalRunTerminalWitness(
                options.limits.frameBytes,
                thread.threadId,
                expectedRunId,
              )
            : undefined;
        const deliver = async (bytes: Buffer) => {
          if (!bytes.length) return;
          requireWritableDownstream();
          await sendHeaders(result.statusCode ?? 502, responseHeaders);
          requireWritableDownstream();
          let writable = true;
          const completed = new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              response.off('close', closed);
              response.off('error', error);
            };
            const closed = () => {
              cleanup();
              reject(new Error('Downstream closed during write'));
            };
            const error = (reason: Error) => {
              cleanup();
              reject(reason);
            };
            response.once('close', closed);
            response.once('error', error);
            writable = response.write(bytes, (reason?: Error | null) => {
              cleanup();
              if (reason) reject(reason);
              else resolve();
            });
          });
          const flushed = Promise.all([
            completed,
            writable ? Promise.resolve() : drained(response),
          ]);
          void flushed.catch(() => undefined);
          deliveredBytes += bytes.length;
          await append({ kind: 'delivered-body', ...context, bytes });
          if (!writable) await append({ kind: 'backpressure', ...context });
          await flushed;
          const end = terminal?.terminalEnd();
          if (
            end !== undefined &&
            deliveredBytes >= end &&
            !normalTerminalWritten &&
            result.statusCode === 200
          ) {
            // Only a fully flushed matching terminal permits client disposal without cancelling the source.
            normalTerminalWritten = true;
            sourceDrainTimer = setTimeout(
              () =>
                upstream.destroy(new Error('Recovery source drain deadline')),
              options.limits.holdTimeoutMs,
            );
            sourceDrainTimer.unref();
            await append({ kind: 'downstream-terminal-write', ...context });
          }
          if (!writable) await append({ kind: 'drain', ...context });
          if (ackEnd !== undefined && deliveredBytes >= ackEnd && !ackWritten) {
            ackWritten = true;
            await append({ kind: 'downstream-ack-write', ...context });
          }
        };
        const readMutation = readMode !== 'pass' && readMode !== 'real-v1';
        const readChunks: Buffer[] = [];
        let beforeAck: Buffer[] = [];
        let afterAck: Buffer[] = [];
        let interventionDone = false;
        let malformedPending = false;
        for await (const chunk of result) {
          const bytes = Buffer.from(chunk);
          upstreamBytes += bytes.length;
          if (upstreamBytes > options.limits.responseBytes)
            throw new Error('Response byte limit');
          await append({ kind: 'upstream-body', ...context, bytes });
          if (path !== '/run') {
            if (readMutation) readChunks.push(bytes);
            else await deliver(bytes);
            continue;
          }
          terminal?.observe(bytes);
          const acknowledgements = parseAcknowledgements(bytes);
          if (ackEnd === undefined && acknowledgements.length) {
            ackEnd = acknowledgements[0];
            await append({ kind: 'upstream-ack', ...context });
          }
          if (runMode === 'post-commit-loss') {
            if (!ackWritten) {
              beforeAck.push(bytes);
              if (ackEnd !== undefined) {
                const prefix = Buffer.concat(beforeAck);
                beforeAck = [];
                await deliver(prefix.subarray(0, ackEnd));
              }
            }
            continue;
          }
          if (runMode === 'pass' || interventionDone) {
            await deliver(bytes);
            continue;
          }
          if (malformedPending) afterAck.push(bytes);
          else beforeAck.push(bytes);
          if (ackEnd === undefined) continue;
          if (runMode === 'disconnect-before-delivered-ack') {
            await append({ kind: 'mutation', ...context, reason: runMode });
            response.destroy();
            upstream.destroy();
            return;
          }
          if (!malformedPending) {
            const buffered = Buffer.concat(beforeAck);
            beforeAck = [];
            if (runMode === 'hold-before-delivery') {
              await hold();
              await deliver(buffered);
              interventionDone = true;
              continue;
            }
            await deliver(buffered.subarray(0, ackEnd));
            const suffix = buffered.subarray(ackEnd);
            if (
              runMode === 'disconnect-after-delivered-ack' ||
              runMode === 'malform-after-upstream-ack'
            ) {
              // The parent releases only after the actual consumer has parsed this ACK.
              await hold();
            }
            if (runMode === 'disconnect-after-delivered-ack') {
              await append({ kind: 'mutation', ...context, reason: runMode });
              response.destroy();
              upstream.destroy();
              return;
            }
            if (runMode === 'hold-after-delivered-ack') {
              await hold();
              await deliver(suffix);
              interventionDone = true;
              continue;
            }
            malformedPending = true;
            afterAck.push(suffix);
          }
          const source = Buffer.concat(afterAck);
          const end = frameEnd(source);
          if (end !== -1) {
            const text = source.subarray(0, end).toString('utf8');
            const position = text.indexOf('data:');
            const json = position < 0 ? -1 : text.indexOf('{', position + 5);
            if (json < 0)
              throw new Error('Actual post-ACK JSON frame required');
            const changed = Buffer.from(source);
            changed[Buffer.byteLength(text.slice(0, json))] = 33;
            await append({ kind: 'mutation', ...context, reason: runMode });
            await deliver(changed);
            afterAck = [];
            interventionDone = true;
          }
        }
        if (path === '/run' && runMode === 'post-commit-loss') {
          if (
            !ackWritten ||
            !result.complete ||
            (result.statusCode ?? 500) !== 200
          )
            throw new Error('Recovery genuine source incomplete');
          await append({ kind: 'upstream-complete', ...context });
          const validate = commitValidators.get(thread.threadId);
          commitValidators.delete(thread.threadId);
          if (!validate)
            throw new Error('Recovery physical commit validator missing');
          let commitTimer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              validate(),
              new Promise<never>((_resolve, reject) => {
                commitTimer = setTimeout(
                  () => reject(new Error('Recovery physical commit deadline')),
                  options.limits.holdTimeoutMs,
                );
              }),
            ]);
          } finally {
            clearTimeout(commitTimer);
          }
          await append({ kind: 'commit-verified', ...context });
          await append({ kind: 'post-commit-loss', ...context });
          response.destroy();
          return;
        }
        if (path === '/run' && runMode === 'pass') {
          if (!result.complete || result.statusCode !== 200)
            throw new Error('Recovery genuine source incomplete');
          terminal?.complete();
          await append({ kind: 'upstream-complete', ...context });
        }
        if (readMutation) {
          if (
            (result.statusCode ?? 500) < 200 ||
            (result.statusCode ?? 500) >= 300
          )
            throw new Error('Successful genuine recovery source required');
          const changed = mutateRead(Buffer.concat(readChunks), readMode);
          await append({ kind: 'mutation', ...context, reason: readMode });
          await deliver(changed);
        }
        if (path === '/run' && runMode !== 'pass' && !interventionDone)
          throw new Error(
            'Required genuine stream intervention source missing',
          );
        if (response.destroyed) {
          if (!normalTerminalWritten)
            throw new Error(
              'Recovery downstream closed before terminal delivery',
            );
        } else {
          await sendHeaders(result.statusCode ?? 502, responseHeaders);
          response.end();
        }
        await append({ kind: 'complete', ...context });
      } finally {
        clearTimeout(sourceDrainTimer);
        cleanupGate();
        cancellation = undefined;
        active.delete(upstream);
        if (!upstream.destroyed) upstream.destroy();
      }
    };
    const task = handle().catch(async (error: unknown) => {
      requestFailure ??= new Error('Recovery proxy request failed');
      cancellation?.();
      const closed =
        error instanceof Error && beforeWriteDisposals.has(error)
          ? await downstreamClose
          : undefined;
      try {
        await append({
          kind: 'fault',
          ...context,
          ...(closed && !closed.closing
            ? {
                faultCause: 'downstream-closed' as const,
                faultStage: 'before-write' as const,
                downstreamCloseSeq: closed.record.seq,
              }
            : {}),
          reason:
            error instanceof Error ? error.message : 'proxy-request-failure',
        });
      } catch {
        response.destroy();
        return;
      }
      if (response.destroyed || response.headersSent) response.destroy();
      else if (incoming.url === '/run') response.destroy();
      else {
        await sendHeaders(502, { 'Content-Type': 'application/json' });
        response.end('{"error":"owned-source-or-transport-failure"}');
      }
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
    throw error;
  });

  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    registerWorker(worker) {
      if (closing) throw new Error('Proxy closed');
      const url = new URL(worker.origin);
      if (
        url.protocol !== 'http:' ||
        url.hostname !== '127.0.0.1' ||
        !url.port ||
        url.origin !== worker.origin
      )
        throw new Error('Owned loopback worker origin required');
      if (workers.has(worker.id)) throw new Error('Worker already registered');
      workers.set(worker.id, { ...worker });
    },
    registerThread(thread) {
      if (closing) throw new Error('Proxy closed');
      const prefix = `/threads/${encodeURIComponent(thread.threadId)}/`;
      if (
        !workers.has(thread.workerId) ||
        threads.has(thread.threadId) ||
        !thread.scenarioId ||
        !thread.threadId ||
        !thread.principal ||
        (thread.recoveryPath !== prefix + 'native-session' &&
          thread.recoveryPath !== prefix + 'recovery')
      )
        throw new Error(
          'Unique registered worker/thread and owned recovery path required',
        );
      threads.set(thread.threadId, { ...thread, epoch: 0 });
    },
    async switchWorker(threadId, workerId) {
      if (closing) throw new Error('Proxy closed');
      const thread = threads.get(threadId);
      if (!thread || !workers.has(workerId))
        throw new Error('Registered thread and worker required');
      threads.set(threadId, { ...thread, workerId, epoch: thread.epoch + 1 });
      await append({
        kind: 'route-change',
        scenarioId: thread.scenarioId,
        threadId,
        workerId,
        routeEpoch: thread.epoch + 1,
      });
    },
    armReadEffect(threadId, effect) {
      if (closing || !threads.has(threadId) || readEffects.has(threadId))
        throw new Error('Unarmed registered recovery read required');
      readEffects.set(threadId, effect);
    },
    armCommittedLoss(threadId, validatePhysicalCommitAndTeardown) {
      if (
        closing ||
        !threads.has(threadId) ||
        runModes.has(threadId) ||
        commitValidators.has(threadId)
      )
        throw new Error('Unarmed registered recovery thread required');
      commitValidators.set(threadId, validatePhysicalCommitAndTeardown);
      runModes.set(threadId, 'post-commit-loss');
    },
    armRun(threadId, mode) {
      if (closing || !threads.has(threadId) || runModes.has(threadId))
        throw new Error('Unarmed registered thread required');
      runModes.set(threadId, mode);
    },
    armRead(threadId, mode) {
      if (closing || !threads.has(threadId) || readModes.has(threadId))
        throw new Error('Unarmed registered thread required');
      readModes.set(threadId, mode);
    },
    waitFor: async (requestId, boundary, signal) => {
      await wait(
        (record) => record.requestId === requestId && record.kind === boundary,
        signal,
      );
    },
    waitForThread: (threadId, boundary, signal) =>
      wait(
        (record) => record.threadId === threadId && record.kind === boundary,
        signal,
      ),
    release(requestId) {
      gates.get(requestId)?.release();
    },
    records: (threadId) =>
      records
        .filter(
          (record) => threadId === undefined || record.threadId === threadId,
        )
        .map(cloneRecord),
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
        await attempt(() => append({ kind: 'stop-start' }));
        for (const gate of gates.values()) await attempt(() => gate.abort());
        for (const upstream of active) await attempt(() => upstream.destroy());
        const serverClosed = new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        await attempt(() => server.closeAllConnections());
        await attempt(() => serverClosed);
        const completed = await Promise.allSettled([...tasks]);
        for (const result of completed)
          if (result.status === 'rejected')
            await attempt(() => Promise.reject(result.reason));
        await attempt(() => writes);
        await attempt(() => append({ kind: 'stop-complete' }));
        if (requestFailure) errors.push(requestFailure);
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1)
          throw new AggregateError(errors, 'Proxy cleanup failed');
      })();
      return closePromise;
    },
  };
}
