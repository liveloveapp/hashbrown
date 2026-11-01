import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  request,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startCandidateRecoveryProxy } from '../harness/candidate-recovery-proxy';

test('candidate proxy persists actual delivered mutation headers separately from upstream headers', async () => {
  const source = Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      disposition: 'Pending',
      serverRevision: 7,
      snapshot: {
        threadId,
        messages: [],
        pendingBrowserRecovery: {
          protocolVersion: 1,
          serverRevision: 7,
          callIds: ['browser-a'],
        },
      },
    }),
  );
  await withUpstream(
    async (worker) =>
      withProxy(worker, async (proxy, path) => {
        proxy.armRead(threadId, 'unsupported-capability');

        const result = await post(
          `${proxy.origin}${recoveryPath}`,
          Buffer.from('{}'),
          undefined,
          { 'Hashbrown-Recovery-Version': '2' },
        );

        expect(result.status).toBe(200);
        expect(result.headers.get('content-type')).toBe('application/json');
        expect(result.headers.get('content-length')).toBeNull();
        expect(result.headers.get('etag')).toBeNull();
        const records = (await readFile(path, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        const upstream = records.filter(
          (record) => record.kind === 'upstream-headers',
        );
        const delivered = records.filter(
          (record) => record.kind === 'delivered-headers',
        );
        expect(upstream).toHaveLength(1);
        expect(upstream[0].rawHeaders).toEqual(
          expect.arrayContaining([
            'ETag',
            'owned-source-tag',
            'Content-Length',
            String(source.length),
          ]),
        );
        expect(delivered).toHaveLength(1);
        expect(delivered[0]).toMatchObject({
          status: result.status,
          headers: { 'content-type': 'application/json' },
        });
        expect(delivered[0].headers).not.toHaveProperty('content-length');
        expect(delivered[0].headers).not.toHaveProperty('etag');
        expect(proxy.records(threadId)).toContainEqual(
          expect.objectContaining({
            kind: 'delivered-headers',
            status: result.status,
          }),
        );
      }),
    async (incoming, response) => {
      await bytes(incoming);
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': String(source.length),
        ETag: 'owned-source-tag',
      });
      response.end(source);
    },
  );
});

test('candidate proxy records actual delivered headers and status for an empty upstream response', async () => {
  await withUpstream(
    async (worker) =>
      withProxy(worker, async (proxy, path) => {
        const result = await post(`${proxy.origin}/run`);

        expect(result.status).toBe(200);
        expect(result.body).toEqual(Buffer.alloc(0));
        expect(result.headers.get('content-length')).toBe('0');
        expect(result.headers.get('x-owned-source')).toBe('empty');
        const records = (await readFile(path, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        const delivered = records.filter(
          (record) => record.kind === 'delivered-headers',
        );
        expect(delivered).toHaveLength(1);
        expect(delivered[0]).toMatchObject({
          status: result.status,
          headers: {
            'content-type': 'application/json',
            'content-length': '0',
            'x-owned-source': 'empty',
          },
        });
        expect(
          records.filter((record) => record.kind === 'delivered-body'),
        ).toEqual([]);
      }),
    async (incoming, response) => {
      await bytes(incoming);
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': '0',
        'X-Owned-Source': 'empty',
      });
      response.end();
    },
  );
});

test('candidate proxy append failure during close still closes held socket listener and actual evidence handle exactly once', async () => {
  await withUpstream(
    async (worker) => {
      const directory = await mkdtemp(
        join(tmpdir(), 'candidate-proxy-close-fault-'),
      );
      const path = join(directory, 'traffic.jsonl');
      const filesystem =
        jest.requireActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );
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
      let proxy:
        Awaited<ReturnType<typeof startCandidateRecoveryProxy>> | undefined;
      try {
        proxy = await startCandidateRecoveryProxy({
          ownedOrigins: [origin],
          evidencePath: path,
          limits: {
            requestBytes: 8192,
            responseBytes: 65536,
            frameBytes: 8192,
            records: 256,
            holdTimeoutMs: 2000,
          },
        });
        opening.mockRestore();
        creating.mockRestore();
        expect(ownedHandle).toBeDefined();
        if (!ownedHandle)
          throw new Error('Owned evidence handle was not captured');
        proxy.registerWorker({
          id: 'node-primitive-a',
          origin: worker,
          loadedIdentityEvidence: 'unit-node-upstream-only',
        });
        proxy.registerThread({
          scenarioId: 'primitive.proxy',
          threadId,
          workerId: 'node-primitive-a',
          recoveryPath,
          principal: 'alice',
        });
        proxy.armRun(threadId, 'hold-before-delivery');
        const held = post(`${proxy.origin}/run`, input, client.signal);
        const socketClosed = held.then(
          () => false,
          () => true,
        );
        await proxy.waitForThread(
          threadId,
          'upstream-ack',
          new AbortController().signal,
        );
        const failure = new Error('controlled owned proxy append failure');
        actualClose = jest.spyOn(ownedHandle, 'close');
        appendFailure = jest
          .spyOn(ownedHandle, 'appendFile')
          .mockRejectedValue(failure);

        const first = proxy.close();
        const second = proxy.close();
        const rejected = expect(first).rejects.toBe(failure);
        expect(second).toBe(first);
        await rejected;

        expect(actualClose).toHaveBeenCalledTimes(1);
        expect(await socketClosed).toBe(true);
        await expect(
          fetch(proxy.origin, { headers: { Origin: origin } }),
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
        await proxy?.close().catch(() => undefined);
        await ownedHandle?.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
    async (incoming, response) => {
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write(acknowledgement);
    },
  );
});

const origin = 'http://127.0.0.1:4431';
const threadId = 'primitive-thread';
const recoveryPath = `/threads/${threadId}/native-session`;
const acknowledgement = Buffer.from(
  'data: {"type":"RUN_STARTED","threadId":"primitive-thread","runId":"primitive-run"}\r\n\r\n',
);
const terminal = Buffer.from(
  'data: {"type":"RUN_FINISHED","threadId":"primitive-thread","runId":"primitive-run"}\r\n\r\n',
);
const input = Buffer.from(
  JSON.stringify({
    threadId,
    runId: 'primitive-run',
    messages: [{ role: 'user', content: '  café 🛫\n' }],
    forwardedProps: {
      hashbrown: { recovery: { version: 1, serverRevision: 7, outcomes: [] } },
    },
  }),
);

/** Creates a real owned Node upstream; this is not a qualified .NET worker or browser witness. */
async function withUpstream(
  use: (url: string) => Promise<void>,
  respond: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void | Promise<void>,
) {
  const server = createServer((incoming, response) => {
    void Promise.resolve(respond(incoming, response)).catch((error: Error) =>
      response.destroy(error),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Owns a proxy and evidence file; tests exercise only its HTTP primitive contract. */
async function withProxy(
  worker: string,
  use: (
    proxy: Awaited<ReturnType<typeof startCandidateRecoveryProxy>>,
    path: string,
  ) => Promise<void>,
  limits: Partial<{
    requestBytes: number;
    responseBytes: number;
    frameBytes: number;
    records: number;
    holdTimeoutMs: number;
  }> = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'candidate-proxy-'));
  const path = join(directory, 'traffic.jsonl');
  const proxy = await startCandidateRecoveryProxy({
    ownedOrigins: [origin],
    evidencePath: path,
    limits: {
      requestBytes: 8192,
      responseBytes: 65536,
      frameBytes: 8192,
      records: 256,
      holdTimeoutMs: 2000,
      ...limits,
    },
  });
  proxy.registerWorker({
    id: 'node-primitive-a',
    origin: worker,
    loadedIdentityEvidence: 'unit-node-upstream-only',
  });
  proxy.registerThread({
    scenarioId: 'primitive.proxy',
    threadId,
    workerId: 'node-primitive-a',
    recoveryPath,
    principal: 'alice',
  });
  try {
    await use(proxy, path);
  } finally {
    await proxy.close();
    await rm(directory, { recursive: true, force: true });
  }
}

/** Sends exact entity bytes and returns status, headers and raw received entity bytes. */
async function post(
  url: string,
  body = input,
  signal?: AbortSignal,
  headers: Record<string, string> = {},
) {
  const result = await fetch(url, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'X-Fixture-Principal': 'alice',
      ...headers,
    },
    body,
    signal,
  });
  return {
    status: result.status,
    headers: result.headers,
    body: Buffer.from(await result.arrayBuffer()),
  };
}

/** Consumes an upstream body before assertions about forwarding. */
async function bytes(incoming: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('candidate proxy forwards raw UTF-8 entity and authentication/version headers exactly once', async () => {
  const received: Array<{
    body: Buffer;
    headers: IncomingMessage['headers'];
    path: string | undefined;
  }> = [];
  await withUpstream(
    async (worker) =>
      withProxy(worker, async (proxy, path) => {
        const configuration = Buffer.from('{"system":" café 🛫 ","tools":[]}');

        const run = await post(`${proxy.origin}/run`, input, undefined, {
          Authorization: 'Bearer primitive-only',
        });
        const read = await post(
          `${proxy.origin}${recoveryPath}`,
          configuration,
          undefined,
          { 'Hashbrown-Recovery-Version': '2', Accept: 'application/json' },
        );

        expect(run.body).toEqual(Buffer.concat([acknowledgement, terminal]));
        expect(read.status).toBe(200);
        expect(received).toHaveLength(2);
        expect(received[0].body).toEqual(input);
        expect(received[0].headers.authorization).toBe('Bearer primitive-only');
        expect(received[1].body).toEqual(configuration);
        expect(received[1].headers['hashbrown-recovery-version']).toBe('2');
        expect(received[1].headers['x-fixture-principal']).toBe('alice');
        const captures = proxy
          .records(threadId)
          .filter((record) => record.kind === 'request');
        expect(captures).toHaveLength(2);
        expect(captures[0].incomingBody).toEqual(input);
        expect(captures[0].forwardedBody).toEqual(input);
        expect((await readFile(path, 'utf8')).trim().length).toBeGreaterThan(0);
      }),
    async (incoming, response) => {
      received.push({
        body: await bytes(incoming),
        headers: incoming.headers,
        path: incoming.url,
      });
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(Buffer.concat([acknowledgement, terminal]));
    },
  );
});

test('candidate proxy recognizes split real ACK without re-encoding bytes or cancelling normally completed input', async () => {
  await withUpstream(
    async (worker) =>
      withProxy(worker, async (proxy) => {
        const expected = Buffer.concat([
          acknowledgement,
          Buffer.from(': café 🛫\r\n\r\n'),
          terminal,
        ]);

        const result = await post(`${proxy.origin}/run`);

        expect(result.body).toEqual(expected);
        expect(proxy.records(threadId)).toContainEqual(
          expect.objectContaining({ kind: 'upstream-ack' }),
        );
        expect(proxy.records(threadId)).toContainEqual(
          expect.objectContaining({ kind: 'downstream-ack-write' }),
        );
        const upstream = proxy
          .records(threadId)
          .filter((record) => record.kind === 'upstream-body')
          .map((record) => record.bytes);
        const delivered = proxy
          .records(threadId)
          .filter((record) => record.kind === 'delivered-body')
          .map((record) => record.bytes);
        expect(Buffer.concat(upstream)).toEqual(expected);
        expect(Buffer.concat(delivered)).toEqual(expected);
      }),
    async (incoming, response) => {
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const byte of Buffer.concat([
        acknowledgement,
        Buffer.from(': café 🛫\r\n\r\n'),
        terminal,
      ]))
        response.write(Buffer.from([byte]));
      response.end();
    },
  );
});

test('candidate proxy holds the coalesced post-ACK suffix at its exact byte boundary', async () => {
  await withUpstream(
    async (worker) =>
      withProxy(worker, async (proxy) => {
        proxy.armRun(threadId, 'hold-after-delivered-ack');
        const response = await fetch(`${proxy.origin}/run`, {
          method: 'POST',
          headers: {
            Origin: origin,
            'Content-Type': 'application/json',
            'X-Fixture-Principal': 'alice',
          },
          body: input,
        });
        if (!response.body) throw new Error('Actual response stream required');
        const reader = response.body.getReader();
        const prefix = await reader.read();
        const requestRecord = proxy
          .records(threadId)
          .find((record) => record.kind === 'request');
        if (!requestRecord)
          throw new Error('Actual proxy request record required');

        await proxy.waitFor(
          requestRecord.requestId,
          'downstream-ack-write',
          new AbortController().signal,
        );

        if (!prefix.value)
          throw new Error('Actual acknowledgement prefix required');
        expect(Buffer.from(prefix.value)).toEqual(acknowledgement);
        expect(
          Buffer.concat(
            proxy
              .records(threadId)
              .filter((record) => record.kind === 'delivered-body')
              .map((record) => record.bytes),
          ),
        ).toEqual(acknowledgement);
        proxy.release(requestRecord.requestId);
        const remaining: Buffer[] = [];
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          remaining.push(Buffer.from(next.value));
        }
        expect(Buffer.concat(remaining)).toEqual(terminal);
      }),
    async (incoming, response) => {
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(Buffer.concat([acknowledgement, terminal]));
    },
  );
});

test('candidate proxy pre-ACK disconnect records real upstream ACK and zero delivered ACK without retry', async () => {
  let runs = 0;
  await withUpstream(
    async (worker) =>
      withProxy(worker, async (proxy) => {
        proxy.armRun(threadId, 'disconnect-before-delivered-ack');

        await expect(post(`${proxy.origin}/run`)).rejects.toThrow();

        expect(runs).toBe(1);
        expect(proxy.records(threadId)).toContainEqual(
          expect.objectContaining({ kind: 'upstream-ack' }),
        );
        expect(
          proxy
            .records(threadId)
            .filter((record) => record.kind === 'downstream-ack-write'),
        ).toHaveLength(0);
        expect(
          proxy.records(threadId).filter((record) => record.kind === 'request'),
        ).toHaveLength(1);
      }),
    async (incoming, response) => {
      runs++;
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(Buffer.concat([acknowledgement, terminal]));
    },
  );
});

test('candidate proxy malformed stream is derived after actual upstream ACK with original and delivered bytes separate', async () => {
  await withUpstream(
    async (worker) =>
      withProxy(worker, async (proxy) => {
        proxy.armRun(threadId, 'malform-after-upstream-ack');

        const response = await post(`${proxy.origin}/run`);

        const upstream = Buffer.concat(
          proxy
            .records(threadId)
            .filter((record) => record.kind === 'upstream-body')
            .map((record) => record.bytes),
        );
        const delivered = Buffer.concat(
          proxy
            .records(threadId)
            .filter((record) => record.kind === 'delivered-body')
            .map((record) => record.bytes),
        );
        expect(upstream).toEqual(Buffer.concat([acknowledgement, terminal]));
        expect(delivered).toEqual(response.body);
        expect(delivered).not.toEqual(upstream);
        expect(delivered.subarray(0, acknowledgement.length)).toEqual(
          acknowledgement,
        );
        const data = delivered
          .subarray(acknowledgement.length)
          .toString('utf8')
          .split(/\r?\n/)
          .find((line) => line.startsWith('data:'));
        if (!data) throw new Error('Actual malformed frame data required');
        expect(() => JSON.parse(data.slice(5))).toThrow();
        expect(proxy.records(threadId)).toContainEqual(
          expect.objectContaining({ kind: 'mutation' }),
        );
      }),
    async (incoming, response) => {
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(Buffer.concat([acknowledgement, terminal]));
    },
  );
});

test('candidate proxy read variants derive genuine source response and real V1 removes only version negotiation', async () => {
  const versions: Array<string | string[] | undefined> = [];
  const source = {
    schemaVersion: 2,
    disposition: 'Pending',
    serverRevision: 7,
    snapshot: {
      threadId,
      messages: [],
      pendingBrowserRecovery: {
        protocolVersion: 1,
        serverRevision: 7,
        callIds: ['browser-a', 'browser-b'],
      },
    },
  };
  await withUpstream(
    async (worker) =>
      withProxy(worker, async (proxy) => {
        const modes = [
          'unsupported-capability',
          'mismatched-revision',
          'duplicate-call-ids',
          'missing-call-id',
          'extra-capability-field',
          'downgrade-real-v2',
        ] as const;

        for (const mode of modes) {
          proxy.armRead(threadId, mode);
          const response = await post(
            `${proxy.origin}${recoveryPath}`,
            Buffer.from('{"tools":[]}'),
            undefined,
            { 'Hashbrown-Recovery-Version': '2' },
          );
          const altered = JSON.parse(response.body.toString('utf8'));
          expect(altered).not.toEqual(source);
          expect(altered.disposition).toBe(source.disposition);
          expect(altered.snapshot.messages).toEqual(source.snapshot.messages);
          expect(versions.at(-1)).toBe('2');
        }
        proxy.armRead(threadId, 'real-v1');
        const v1 = await post(
          `${proxy.origin}${recoveryPath}`,
          Buffer.from('{"tools":[]}'),
          undefined,
          { 'Hashbrown-Recovery-Version': '2' },
        );

        expect(JSON.parse(v1.body.toString('utf8'))).toEqual({
          schemaVersion: 1,
          disposition: 'Blocked',
          reason: 'actual-node-v1',
        });
        expect(versions.at(-1)).toBeUndefined();
        expect(versions).toHaveLength(modes.length + 1);
        const originals = proxy
          .records(threadId)
          .filter((record) => record.kind === 'upstream-body');
        expect(originals).toHaveLength(modes.length + 1);
        expect(JSON.parse(originals[0].bytes.toString('utf8'))).toEqual(source);
      }),
    async (incoming, response) => {
      await bytes(incoming);
      versions.push(incoming.headers['hashbrown-recovery-version']);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify(
          incoming.headers['hashbrown-recovery-version'] === '2'
            ? source
            : {
                schemaVersion: 1,
                disposition: 'Blocked',
                reason: 'actual-node-v1',
              },
        ),
      );
    },
  );
});

test('candidate proxy forwards real client cancellation while holding response and never starts a second request', async () => {
  let requests = 0;
  await withUpstream(
    async (worker) =>
      withProxy(worker, async (proxy) => {
        proxy.armRun(threadId, 'hold-before-delivery');
        const controller = new AbortController();
        const pending = post(`${proxy.origin}/run`, input, controller.signal);
        const rejected = expect(pending).rejects.toThrow();
        const record = await proxy.waitForThread(
          threadId,
          'upstream-ack',
          new AbortController().signal,
        );

        controller.abort(
          new Error(
            'primitive client signal; not a public Transport deadline proof',
          ),
        );
        await rejected;
        await proxy.waitFor(
          record.requestId,
          'downstream-closed',
          new AbortController().signal,
        );

        expect(requests).toBe(1);
        expect(
          proxy.records(threadId).filter((event) => event.kind === 'request'),
        ).toHaveLength(1);
        expect(
          proxy
            .records(threadId)
            .filter((event) => event.kind === 'downstream-ack-write'),
        ).toHaveLength(0);
      }),
    async (incoming, response) => {
      requests++;
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write(acknowledgement);
    },
  );
});

test('candidate proxy switches only new requests for one registered thread and rejects external targets', async () => {
  await withUpstream(
    async (workerA) =>
      withUpstream(
        async (workerB) =>
          withProxy(workerA, async (proxy) => {
            proxy.registerWorker({
              id: 'node-primitive-b',
              origin: workerB,
              loadedIdentityEvidence: 'unit-node-upstream-only',
            });
            const other = 'other-thread';
            proxy.registerThread({
              scenarioId: 'primitive.other',
              threadId: other,
              workerId: 'node-primitive-a',
              recoveryPath: `/threads/${other}/native-session`,
              principal: 'alice',
            });

            const before = await post(`${proxy.origin}/run`);
            await proxy.switchWorker(threadId, 'node-primitive-b');
            const after = await post(`${proxy.origin}/run`);
            const untouched = await post(
              `${proxy.origin}/run`,
              Buffer.from(JSON.stringify({ threadId: other })),
            );

            expect(before.body.toString()).toBe('worker-a');
            expect(after.body.toString()).toBe('worker-b');
            expect(untouched.body.toString()).toBe('worker-a');
            expect(() =>
              proxy.registerWorker({
                id: 'external',
                origin: 'https://example.com',
                loadedIdentityEvidence: 'not-authority',
              }),
            ).toThrow(/owned|loopback|origin/i);
            await expect(
              proxy.switchWorker(threadId, 'unregistered'),
            ).rejects.toThrow(/worker|register/i);
            expect(
              proxy
                .records(threadId)
                .filter((record) => record.kind === 'request'),
            ).toHaveLength(2);
          }),
        async (incoming, response) => {
          await bytes(incoming);
          response.end('worker-b');
        },
      ),
    async (incoming, response) => {
      await bytes(incoming);
      response.end('worker-a');
    },
  );
});

test('candidate proxy caps incoming bytes and refuses unknown control routes without forwarding', async () => {
  let requests = 0;
  await withUpstream(
    async (worker) =>
      withProxy(
        worker,
        async (proxy) => {
          const control = await post(
            `${proxy.origin}/__test/reset`,
            Buffer.from('{}'),
          );
          const oversized = await post(
            `${proxy.origin}/run`,
            Buffer.from(
              JSON.stringify({ threadId, padding: 'x'.repeat(1024) }),
            ),
          );

          expect(control.status).toBeGreaterThanOrEqual(400);
          expect(oversized.status).toBeGreaterThanOrEqual(400);
          expect(requests).toBe(0);
          expect(proxy.records()).toContainEqual(
            expect.objectContaining({ kind: 'rejected' }),
          );
        },
        { requestBytes: 256 },
      ),
    async (incoming, response) => {
      requests++;
      await bytes(incoming);
      response.end('unexpected-forward');
    },
  );
});

test('candidate proxy closes active held responses and timers idempotently without successful fallback bytes', async () => {
  await withUpstream(
    async (worker) =>
      withProxy(worker, async (proxy, path) => {
        proxy.armRun(threadId, 'hold-before-delivery');
        const pending = post(`${proxy.origin}/run`);
        const rejected = expect(pending).rejects.toThrow();
        await proxy.waitForThread(
          threadId,
          'upstream-ack',
          new AbortController().signal,
        );

        await proxy.close();
        await proxy.close();

        await rejected;
        expect(
          proxy
            .records(threadId)
            .filter((record) => record.kind === 'delivered-body'),
        ).toEqual([]);
        const records = (await readFile(path, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        expect(records).toContainEqual(
          expect.objectContaining({ kind: 'stop-complete' }),
        );
      }),
    async (incoming, response) => {
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write(acknowledgement);
    },
  );
});

test('candidate proxy post-ACK disconnect delivers only actual ACK prefix and never retries', async () => {
  let requests = 0;
  await withUpstream(
    async (worker) =>
      withProxy(worker, async (proxy) => {
        proxy.armRun(threadId, 'disconnect-after-delivered-ack');

        await expect(post(`${proxy.origin}/run`)).rejects.toThrow();

        expect(requests).toBe(1);
        expect(
          Buffer.concat(
            proxy
              .records(threadId)
              .filter((record) => record.kind === 'delivered-body')
              .map((record) => record.bytes),
          ),
        ).toEqual(acknowledgement);
        expect(proxy.records(threadId)).toContainEqual(
          expect.objectContaining({ kind: 'downstream-ack-write' }),
        );
      }),
    async (incoming, response) => {
      requests++;
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(Buffer.concat([acknowledgement, terminal]));
    },
  );
});

test('candidate proxy route switch leaves an already connected request on its original worker', async () => {
  await withUpstream(
    async (workerA) =>
      withUpstream(
        async (workerB) =>
          withProxy(workerA, async (proxy) => {
            proxy.registerWorker({
              id: 'node-primitive-b',
              origin: workerB,
              loadedIdentityEvidence: 'unit-node-upstream-only',
            });
            proxy.armRun(threadId, 'hold-after-delivered-ack');
            const first = post(`${proxy.origin}/run`);
            const connected = await proxy.waitForThread(
              threadId,
              'downstream-ack-write',
              new AbortController().signal,
            );

            await proxy.switchWorker(threadId, 'node-primitive-b');
            const next = await post(`${proxy.origin}/run`);
            proxy.release(connected.requestId);

            expect((await first).body).toEqual(
              Buffer.concat([
                acknowledgement,
                Buffer.from(': worker-a\r\n\r\n'),
                terminal,
              ]),
            );
            expect(next.body).toEqual(
              Buffer.concat([
                acknowledgement,
                Buffer.from(': worker-b\r\n\r\n'),
                terminal,
              ]),
            );
            const requests = proxy
              .records(threadId)
              .filter((record) => record.kind === 'request');
            expect(requests.map((record) => record.workerId)).toEqual([
              'node-primitive-a',
              'node-primitive-b',
            ]);
          }),
        async (incoming, response) => {
          await bytes(incoming);
          response.end(
            Buffer.concat([
              acknowledgement,
              Buffer.from(': worker-b\r\n\r\n'),
              terminal,
            ]),
          );
        },
      ),
    async (incoming, response) => {
      await bytes(incoming);
      response.end(
        Buffer.concat([
          acknowledgement,
          Buffer.from(': worker-a\r\n\r\n'),
          terminal,
        ]),
      );
    },
  );
});

test('candidate proxy read mutation refuses missing genuine Pending source instead of manufacturing a capability', async () => {
  await withUpstream(
    async (worker) =>
      withProxy(worker, async (proxy) => {
        proxy.armRead(threadId, 'missing-call-id');

        const result = await post(
          `${proxy.origin}${recoveryPath}`,
          Buffer.from('{}'),
          undefined,
          { 'Hashbrown-Recovery-Version': '2' },
        );

        expect(result.status).toBeGreaterThanOrEqual(400);
        expect(proxy.records(threadId)).toContainEqual(
          expect.objectContaining({ kind: 'fault' }),
        );
        expect(result.body.toString()).not.toContain('pendingBrowserRecovery');
      }),
    async (incoming, response) => {
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"schemaVersion":2,"disposition":"Busy"}');
    },
  );
});

test('candidate proxy enforces bounded real response capture and does not report truncated success', async () => {
  await withUpstream(
    async (worker) =>
      withProxy(
        worker,
        async (proxy) => {
          const pending = post(`${proxy.origin}/run`);

          await expect(pending).rejects.toThrow();

          expect(proxy.records(threadId)).toContainEqual(
            expect.objectContaining({ kind: 'fault' }),
          );
          expect(
            proxy
              .records(threadId)
              .filter((record) => record.kind === 'complete'),
          ).toEqual([]);
          expect(
            proxy
              .records(threadId)
              .filter((record) => record.kind === 'request'),
          ).toHaveLength(1);
        },
        { responseBytes: 256 },
      ),
    async (incoming, response) => {
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(
        Buffer.concat([
          acknowledgement,
          Buffer.from('x'.repeat(1024)),
          terminal,
        ]),
      );
    },
  );
});

test('candidate proxy finite hold safety deadline is an infrastructure fault rather than a public transport timeout', async () => {
  await withUpstream(
    async (worker) =>
      withProxy(
        worker,
        async (proxy) => {
          proxy.armRun(threadId, 'hold-before-delivery');

          await expect(post(`${proxy.origin}/run`)).rejects.toThrow();

          expect(proxy.records(threadId)).toContainEqual(
            expect.objectContaining({ kind: 'fault', reason: 'hold-deadline' }),
          );
          expect(
            proxy
              .records(threadId)
              .filter((record) => record.kind === 'delivered-body'),
          ).toEqual([]);
          expect(
            proxy
              .records(threadId)
              .filter((record) => record.kind === 'request'),
          ).toHaveLength(1);
        },
        { holdTimeoutMs: 25 },
      ),
    async (incoming, response) => {
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write(acknowledgement);
    },
  );
});

test('candidate proxy aborts a genuinely backpressured socket without stranding drain waiters or retrying', async () => {
  let requests = 0;
  await withUpstream(
    async (worker) =>
      withProxy(
        worker,
        async (proxy) => {
          const incoming = new Promise<IncomingMessage>((resolve, reject) => {
            const outgoing = request(
              `${proxy.origin}/run`,
              {
                method: 'POST',
                headers: {
                  Origin: origin,
                  'Content-Type': 'application/json',
                  'X-Fixture-Principal': 'alice',
                },
              },
              (response) => {
                response.pause();
                resolve(response);
              },
            );
            outgoing.once('error', reject);
            outgoing.end(input);
          });
          const paused = await incoming;

          const trace = await proxy.waitForThread(
            threadId,
            'backpressure',
            new AbortController().signal,
          );
          paused.destroy();
          await proxy.waitFor(
            trace.requestId,
            'downstream-closed',
            new AbortController().signal,
          );
          await proxy.close();

          expect(requests).toBe(1);
          expect(
            proxy
              .records(threadId)
              .filter((record) => record.kind === 'request'),
          ).toHaveLength(1);
        },
        { responseBytes: 32 * 1024 * 1024, frameBytes: 20 * 1024 * 1024 },
      ),
    async (incoming, response) => {
      requests++;
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(
        Buffer.concat([
          acknowledgement,
          Buffer.from(
            `data: ${JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', delta: 'x'.repeat(16 * 1024 * 1024) })}\r\n\r\n`,
          ),
          terminal,
        ]),
      );
    },
  );
});
