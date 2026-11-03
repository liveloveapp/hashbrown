import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import {
  Agent,
  createServer,
  type IncomingMessage,
  request,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

/** Reads an actual client ACK prefix without treating a proxy socket write as receipt. */
async function consumedAcknowledgement(url: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'X-Fixture-Principal': 'alice',
    },
    body: input,
    signal: AbortSignal.timeout(5000),
  });
  expect(response.status).toBe(200);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Actual response body reader required');
  const chunks: Buffer[] = [];
  let length = 0;
  while (length < acknowledgement.length) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error('Client EOF before complete ACK');
    chunks.push(Buffer.from(chunk.value));
    length += chunk.value.length;
  }
  expect(Buffer.concat(chunks)).toEqual(acknowledgement);
  return reader;
}

/** Drains actual owned HTTP tasks without ever releasing the post-ACK intervention gate. */
async function assertNoPostAckMutationWithoutRelease(
  mode: 'disconnect-after-delivered-ack' | 'malform-after-upstream-ack',
): Promise<void> {
  await withUpstream(
    async (worker) =>
      withProxy(worker, async (proxy) => {
        proxy.armRun(threadId, mode);
        const reader = await consumedAcknowledgement(`${proxy.origin}/run`);
        const ack = await proxy.waitForThread(
          threadId,
          'downstream-ack-write',
          AbortSignal.timeout(5000),
        );

        await proxy.close();
        await reader.cancel().catch(() => undefined);

        const records = proxy
          .records(threadId)
          .filter((record) => record.requestId === ack.requestId);
        expect(
          Buffer.concat(
            records
              .filter((record) => record.kind === 'upstream-body')
              .map((record) => record.bytes),
          ),
        ).toEqual(Buffer.concat([acknowledgement, terminal]));
        expect(records.filter((record) => record.kind === 'mutation')).toEqual(
          [],
        );
        expect(
          Buffer.concat(
            records
              .filter((record) => record.kind === 'delivered-body')
              .map((record) => record.bytes),
          ),
        ).toEqual(acknowledgement);
        expect(
          records.filter((record) => record.kind === 'request'),
        ).toHaveLength(1);
        const stopped = proxy
          .records()
          .filter((record) => record.kind === 'stop-complete');
        expect(stopped).toHaveLength(1);
        expect(stopped[0].seq).toBeGreaterThan(ack.seq);
      }),
    async (incoming, response) => {
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(Buffer.concat([acknowledgement, terminal]));
    },
  );
}

test('candidate proxy drained disconnect cannot mutate after consumed ACK without parent release', async () => {
  await assertNoPostAckMutationWithoutRelease('disconnect-after-delivered-ack');
});

test('candidate proxy drained malformed stream cannot mutate after consumed ACK without parent release', async () => {
  await assertNoPostAckMutationWithoutRelease('malform-after-upstream-ack');
});

test('candidate proxy closes each downstream response so a keepalive client uses a fresh socket for its next request', async () => {
  let reads = 0;
  await withUpstream(
    async (worker) =>
      withProxy(worker, async (proxy) => {
        const agent = new Agent({ keepAlive: true, maxSockets: 1 });
        const read = () =>
          new Promise<{
            localPort: number;
            connection: string | undefined;
            body: Buffer;
          }>((resolve, reject) => {
            const outgoing = request(
              `${proxy.origin}${recoveryPath}`,
              {
                method: 'POST',
                agent,
                headers: {
                  Origin: origin,
                  'Content-Type': 'application/json',
                  'Content-Length': '2',
                  'X-Fixture-Principal': 'alice',
                },
              },
              (response) => {
                const localPort = response.socket.localPort;
                if (typeof localPort !== 'number') {
                  reject(new Error('Actual client socket local port required'));
                  response.resume();
                  return;
                }
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) =>
                  chunks.push(Buffer.from(chunk)),
                );
                response.once('error', reject);
                response.once('end', () =>
                  resolve({
                    localPort,
                    connection: response.headers.connection,
                    body: Buffer.concat(chunks),
                  }),
                );
              },
            );
            outgoing.once('error', reject);
            outgoing.setTimeout(5000, () =>
              outgoing.destroy(new Error('Owned sequential read timeout')),
            );
            outgoing.end('{}');
          });

        try {
          const first = await read();
          const second = await read();

          expect(JSON.parse(first.body.toString('utf8'))).toEqual({ read: 1 });
          expect(JSON.parse(second.body.toString('utf8'))).toEqual({ read: 2 });
          expect(second.localPort).not.toBe(first.localPort);
          expect(first.connection).toBe('close');
          expect(second.connection).toBe('close');
          expect(reads).toBe(2);
          expect(
            proxy
              .records(threadId)
              .filter((record) => record.kind === 'request'),
          ).toHaveLength(2);
        } finally {
          agent.destroy();
        }
      }),
    async (incoming, response) => {
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ read: ++reads }));
    },
  );
});

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

        const reader = await consumedAcknowledgement(`${proxy.origin}/run`);
        const ack = await proxy.waitForThread(
          threadId,
          'downstream-ack-write',
          AbortSignal.timeout(5000),
        );
        proxy.release('unrelated-request');
        expect(
          proxy
            .records(threadId)
            .filter(
              (record) =>
                record.kind === 'mutation' ||
                record.kind === 'downstream-closed',
            ),
        ).toEqual([]);
        expect(
          Buffer.concat(
            proxy
              .records(threadId)
              .filter((record) => record.kind === 'delivered-body')
              .map((record) => record.bytes),
          ),
        ).toEqual(acknowledgement);

        proxy.release(ack.requestId);
        const received: Buffer[] = [acknowledgement];
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          received.push(Buffer.from(chunk.value));
        }
        const receivedBody = Buffer.concat(received);

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
        expect(delivered).toEqual(receivedBody);
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

        const reader = await consumedAcknowledgement(`${proxy.origin}/run`);
        const ack = await proxy.waitForThread(
          threadId,
          'downstream-ack-write',
          AbortSignal.timeout(5000),
        );
        proxy.release('unrelated-request');
        expect(
          proxy
            .records(threadId)
            .filter(
              (record) =>
                record.kind === 'mutation' ||
                record.kind === 'downstream-closed',
            ),
        ).toEqual([]);
        expect(
          Buffer.concat(
            proxy
              .records(threadId)
              .filter((record) => record.kind === 'delivered-body')
              .map((record) => record.bytes),
          ),
        ).toEqual(acknowledgement);

        proxy.release(ack.requestId);
        await expect(reader.read()).rejects.toThrow();
        await proxy.waitFor(
          ack.requestId,
          'downstream-closed',
          AbortSignal.timeout(5000),
        );

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

/** Exercises the same real persisted-byte race with or without an already-started parent shutdown. */
async function exercisePrewriteDisposal(shutdownFirst: boolean): Promise<void> {
  let upstreamRequests = 0;
  let allowFrame: () => void = () => undefined;
  let allowLater: () => void = () => undefined;
  let finishUpstream: () => void = () => undefined;
  const frameAllowed = new Promise<void>((resolve) => {
    allowFrame = resolve;
  });
  const laterAllowed = new Promise<void>((resolve) => {
    allowLater = resolve;
  });
  const upstreamFinished = new Promise<void>((resolve) => {
    finishUpstream = resolve;
  });
  const frame = Buffer.from(
    'data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"primitive-message","delta":"actual source"}\r\n\r\n',
  );

  await withUpstream(
    async (worker) => {
      const directory = await mkdtemp(
        join(tmpdir(), 'candidate-proxy-owned-disposal-'),
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
      let ownedResponse: ServerResponse | undefined;
      let releaseAppend: () => void = () => undefined;
      let appendPersisted: () => void = () => undefined;
      let responseClosed: () => void = () => undefined;
      const appendReleased = new Promise<void>((resolve) => {
        releaseAppend = resolve;
      });
      const persisted = new Promise<void>((resolve) => {
        appendPersisted = resolve;
      });
      const closed = new Promise<void>((resolve) => {
        responseClosed = resolve;
      });
      const deadline = AbortSignal.timeout(5000);
      const bounded = async <T>(promise: Promise<T>): Promise<T> => {
        deadline.throwIfAborted();
        let aborted: () => void = () => undefined;
        const failure = new Promise<never>((_, reject) => {
          aborted = () => reject(deadline.reason);
          deadline.addEventListener('abort', aborted, { once: true });
        });
        try {
          return await Promise.race([promise, failure]);
        } finally {
          deadline.removeEventListener('abort', aborted);
        }
      };
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
          server.on('request', (incoming, response) => {
            if (incoming.url !== '/run') return;
            ownedResponse = response;
            response.once('close', responseClosed);
          });
          return server;
        });
      let appendBarrier: jest.SpyInstance | undefined;
      let proxy:
        Awaited<ReturnType<typeof startCandidateRecoveryProxy>> | undefined;
      let outgoing: ReturnType<typeof request> | undefined;
      let client: IncomingMessage | undefined;
      let parsedAck: () => void = () => undefined;
      let parsedMalformed: () => void = () => undefined;
      const ackConsumed = new Promise<void>((resolve) => {
        parsedAck = resolve;
      });
      const malformedConsumed = new Promise<void>((resolve) => {
        parsedMalformed = resolve;
      });
      const parserErrors: unknown[] = [];
      const parsedEvents: unknown[] = [];
      const unexpectedClientErrors: Error[] = [];
      let buffered = '';
      let targetedAppends = 0;
      let primaryFailure: unknown;
      const cleanupFailures: unknown[] = [];

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
        if (!ownedHandle)
          throw new Error('Actual owned evidence handle required');
        const realAppend = ownedHandle.appendFile.bind(ownedHandle);
        appendBarrier = jest
          .spyOn(ownedHandle, 'appendFile')
          .mockImplementation(
            async (...args: Parameters<typeof realAppend>) => {
              await realAppend(...args);
              if (typeof args[0] !== 'string') return;
              const record = JSON.parse(args[0]);
              if (
                record.kind === 'upstream-body' &&
                record.bytesBase64 === terminal.toString('base64')
              ) {
                targetedAppends++;
                appendPersisted();
                await appendReleased;
              }
            },
          );
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
        proxy.armRun(threadId, 'malform-after-upstream-ack');
        outgoing = request(
          proxy.origin + '/run',
          {
            method: 'POST',
            headers: {
              Origin: origin,
              'Content-Type': 'application/json',
              'X-Fixture-Principal': 'alice',
            },
          },
          (response) => {
            client = response;
            response.on('error', (error: Error) => {
              if (!parserErrors.length) unexpectedClientErrors.push(error);
            });
            response.on('data', (chunk: Buffer) => {
              buffered += chunk.toString('utf8');
              for (;;) {
                const boundary = buffered.indexOf('\r\n\r\n');
                if (boundary < 0) break;
                const actualFrame = buffered.slice(0, boundary);
                buffered = buffered.slice(boundary + 4);
                const data = actualFrame
                  .split('\r\n')
                  .filter((line) => line.startsWith('data:'))
                  .map((line) => line.slice(5).trimStart())
                  .join('\n');
                try {
                  const actual: unknown = JSON.parse(data);
                  parsedEvents.push(actual);
                  if (
                    typeof actual === 'object' &&
                    actual !== null &&
                    'type' in actual &&
                    actual.type === 'RUN_STARTED'
                  )
                    parsedAck();
                } catch (error) {
                  parserErrors.push(error);
                  parsedMalformed();
                }
              }
            });
          },
        );
        outgoing.on('error', (error: Error) => {
          if (!parserErrors.length) unexpectedClientErrors.push(error);
        });
        outgoing.end(input);
        await bounded(ackConsumed);
        const ack = await proxy.waitForThread(
          threadId,
          'downstream-ack-write',
          deadline,
        );
        allowFrame();
        proxy.release(ack.requestId);
        await bounded(malformedConsumed);
        expect(parserErrors).toHaveLength(1);
        expect(parserErrors[0]).toBeInstanceOf(SyntaxError);
        expect(parsedEvents).toEqual([
          { type: 'RUN_STARTED', threadId, runId: 'primitive-run' },
        ]);
        allowLater();
        await bounded(persisted);
        if (!client || !ownedResponse)
          throw new Error('Actual client and owned response required');

        const stopping = shutdownFirst ? proxy.close() : undefined;
        client.destroy();
        await bounded(closed);
        expect(ownedResponse.destroyed).toBe(true);
        releaseAppend();
        if (stopping) await stopping;
        else {
          await proxy.waitFor(ack.requestId, 'fault', deadline);
          await proxy.close();
        }

        const records = proxy
          .records(threadId)
          .filter((record) => record.requestId === ack.requestId);
        const closeRecords = records.filter(
          (record) => record.kind === 'downstream-closed',
        );
        const faults = records.filter((record) => record.kind === 'fault');
        const late = records.find(
          (record) =>
            record.kind === 'upstream-body' && record.bytes.equals(terminal),
        );
        const mutation = records.find((record) => record.kind === 'mutation');
        expect(closeRecords).toHaveLength(1);
        expect(faults).toHaveLength(1);
        expect(late).toBeDefined();
        expect(mutation).toBeDefined();
        if (!late || !mutation)
          throw new Error('Actual malformed source and later append required');
        expect(targetedAppends).toBe(1);
        expect(upstreamRequests).toBe(1);
        expect(unexpectedClientErrors).toEqual([]);
        expect(
          records.filter((record) => record.kind === 'request'),
        ).toHaveLength(1);
        expect(
          Buffer.concat(
            records
              .filter((record) => record.kind === 'upstream-body')
              .map((record) => record.bytes),
          ),
        ).toEqual(Buffer.concat([acknowledgement, frame, terminal]));
        const delivered = Buffer.concat(
          records
            .filter((record) => record.kind === 'delivered-body')
            .map((record) => record.bytes),
        );
        const actualSourcePrefix = Buffer.concat([acknowledgement, frame]);
        const offset = acknowledgement.length + frame.indexOf('{');
        const corrupted = Buffer.from(actualSourcePrefix);
        corrupted[offset] = 33;
        expect(delivered).toEqual(corrupted);
        expect(mutation.seq).toBeGreaterThan(ack.seq);
        expect(late.seq).toBeGreaterThan(mutation.seq);
        expect(closeRecords[0].seq).toBeGreaterThan(late.seq);
        expect(faults[0].seq).toBeGreaterThan(closeRecords[0].seq);
        expect(
          records.filter(
            (record) =>
              ['upstream-body', 'delivered-body'].includes(record.kind) &&
              record.seq > closeRecords[0].seq,
          ),
        ).toEqual([]);
        expect(records.filter((record) => record.kind === 'complete')).toEqual(
          [],
        );
        expect(faults[0].reason).toBe('Downstream closed');
        if (shutdownFirst) {
          const stop = proxy
            .records()
            .filter((record) => record.kind === 'stop-start');
          expect(stop).toHaveLength(1);
          expect(stop[0].seq).toBeLessThan(closeRecords[0].seq);
          expect(faults[0]).not.toHaveProperty('faultCause');
          expect(faults[0]).not.toHaveProperty('faultStage');
          expect(faults[0]).not.toHaveProperty('downstreamCloseSeq');
        } else {
          expect(faults[0]).toMatchObject({
            faultCause: 'downstream-closed',
            faultStage: 'before-write',
            downstreamCloseSeq: closeRecords[0].seq,
          });
        }
      } catch (error) {
        primaryFailure = error;
      } finally {
        releaseAppend();
        allowFrame();
        allowLater();
        finishUpstream();
        outgoing?.destroy();
        client?.destroy();
        opening.mockRestore();
        creating.mockRestore();
        appendBarrier?.mockRestore();
        for (const cleanup of [
          async () => {
            await proxy?.close();
          },
          async () => {
            if (!ownedServer) return;
            const server = ownedServer;
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
          },
          async () => {
            await rm(directory, { recursive: true, force: true });
          },
        ]) {
          try {
            await cleanup();
          } catch (error) {
            cleanupFailures.push(error);
          }
        }
      }
      if (primaryFailure !== undefined) {
        if (cleanupFailures.length)
          throw new AggregateError(
            [primaryFailure, ...cleanupFailures],
            'Disposal regression and owned cleanup failed',
          );
        throw primaryFailure;
      }
      if (cleanupFailures.length)
        throw new AggregateError(
          cleanupFailures,
          'Owned disposal regression cleanup failed',
        );
    },
    async (incoming, response) => {
      upstreamRequests++;
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write(acknowledgement);
      await frameAllowed;
      response.write(frame);
      await laterAllowed;
      response.write(terminal);
      await upstreamFinished;
      response.end();
    },
  );
}

test('candidate proxy brands actual downstream disposal before a later write after malformed delivery', async () => {
  await exercisePrewriteDisposal(false);
});

test('candidate proxy does not brand disposal after shutdown has begun', async () => {
  await exercisePrewriteDisposal(true);
});

test('candidate proxy brands actual downstream disposal while delivered headers await persistence', async () => {
  let upstreamRequests = 0;
  await withUpstream(
    async (worker) => {
      const filesystem =
        jest.requireActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );
      const http = jest.requireActual<typeof import('node:http')>('node:http');
      const realOpen = filesystem.open;
      const realCreateServer = http.createServer;
      let handle: Awaited<ReturnType<typeof realOpen>> | undefined;
      let openedPath: string | undefined;
      let server: ReturnType<typeof realCreateServer> | undefined;
      const opening = jest
        .spyOn(filesystem, 'open')
        .mockImplementation(async (...args: Parameters<typeof realOpen>) => {
          const actual = await realOpen(...args);
          handle = actual;
          openedPath = String(args[0]);
          return actual;
        });
      const creating = jest
        .spyOn(http, 'createServer')
        .mockImplementation((...args: Parameters<typeof realCreateServer>) => {
          const actual = realCreateServer(...args);
          server = actual;
          return actual;
        });
      try {
        await withProxy(worker, async (proxy, path) => {
          opening.mockRestore();
          creating.mockRestore();
          if (!handle || !server)
            throw new Error('Actual owned handle/server required');
          expect(openedPath).toBe(path);
          const deadline = AbortSignal.timeout(5000);
          const incoming = once(server, 'request', {
            signal: deadline,
          }) as Promise<[IncomingMessage, ServerResponse]>;
          let releaseHeaders: () => void = () => undefined;
          let persistedHeaders: () => void = () => undefined;
          const released = new Promise<void>((resolve) => {
            releaseHeaders = resolve;
          });
          const persisted = new Promise<void>((resolve, reject) => {
            persistedHeaders = resolve;
            deadline.addEventListener('abort', () => reject(deadline.reason), {
              once: true,
            });
          });
          let headerRequestId: string | undefined;
          let gatedHeaders = 0;
          const realAppend = handle.appendFile.bind(handle);
          const appending = jest
            .spyOn(handle, 'appendFile')
            .mockImplementation(
              async (...args: Parameters<typeof realAppend>) => {
                await realAppend(...args);
                if (typeof args[0] !== 'string') return;
                const record = JSON.parse(args[0]);
                if (
                  record.kind === 'delivered-headers' &&
                  record.threadId === threadId
                ) {
                  gatedHeaders++;
                  headerRequestId = record.requestId;
                  persistedHeaders();
                  await released;
                }
              },
            );
          let outgoing: ReturnType<typeof request> | undefined;
          let explicitClientAbort = false;
          let clientResponses = 0;
          const unexpectedClientErrors: Error[] = [];
          try {
            outgoing = request(
              proxy.origin + '/run',
              {
                method: 'POST',
                headers: {
                  Origin: origin,
                  'Content-Type': 'application/json',
                  'X-Fixture-Principal': 'alice',
                },
              },
              (response) => {
                clientResponses++;
                response.on('error', (error: Error) => {
                  if (!explicitClientAbort) unexpectedClientErrors.push(error);
                });
                response.resume();
              },
            );
            outgoing.on('error', (error: Error) => {
              if (!explicitClientAbort) unexpectedClientErrors.push(error);
            });
            outgoing.end(input);
            const [, actualResponse] = await incoming;
            const actualClosed = once(actualResponse, 'close', {
              signal: deadline,
            });
            await persisted;
            expect(actualResponse.destroyed).toBe(false);
            expect(clientResponses).toBe(0);
            expect(gatedHeaders).toBe(1);

            explicitClientAbort = true;
            outgoing.destroy();
            await actualClosed;
            expect(actualResponse.destroyed).toBe(true);
            releaseHeaders();
            if (!headerRequestId)
              throw new Error('Actual persisted header request required');
            await proxy.waitFor(headerRequestId, 'fault', deadline);
            await proxy.close();

            const records = proxy
              .records(threadId)
              .filter((record) => record.requestId === headerRequestId);
            const closes = records.filter(
              (record) => record.kind === 'downstream-closed',
            );
            const faults = records.filter((record) => record.kind === 'fault');
            expect(closes).toHaveLength(1);
            expect(faults).toHaveLength(1);
            expect(upstreamRequests).toBe(1);
            expect(unexpectedClientErrors).toEqual([]);
            expect(
              records.filter((record) => record.kind === 'request'),
            ).toHaveLength(1);
            expect(
              records.filter((record) => record.kind === 'delivered-headers'),
            ).toHaveLength(1);
            expect(
              Buffer.concat(
                records
                  .filter((record) => record.kind === 'upstream-body')
                  .map((record) => record.bytes),
              ),
            ).toEqual(Buffer.concat([acknowledgement, terminal]));
            expect(
              records.filter((record) => record.kind === 'delivered-body'),
            ).toEqual([]);
            expect(
              records.filter((record) => record.kind === 'complete'),
            ).toEqual([]);
            expect(faults[0].seq).toBeGreaterThan(closes[0].seq);
            expect(faults[0]).toMatchObject({
              reason: 'Downstream closed',
              faultCause: 'downstream-closed',
              faultStage: 'before-write',
              downstreamCloseSeq: closes[0].seq,
            });
          } finally {
            releaseHeaders();
            outgoing?.destroy();
            appending.mockRestore();
          }
        });
      } finally {
        opening.mockRestore();
        creating.mockRestore();
      }
    },
    async (incoming, response) => {
      upstreamRequests++;
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(Buffer.concat([acknowledgement, terminal]));
    },
  );
});

test('candidate proxy preserves a genuine callback error before close even when its raw message matches disposal', async () => {
  let upstreamRequests = 0;
  const injected = new Error('Downstream closed');
  const http = jest.requireActual<typeof import('node:http')>('node:http');
  const realCreateServer = http.createServer;
  let creating: jest.SpyInstance | undefined;
  let writing: jest.SpyInstance | undefined;
  let callbackInjections = 0;
  const destroyedAtCallback: boolean[] = [];
  const unexpectedWriteErrors: Error[] = [];
  const unexpectedClientErrors: Error[] = [];

  await withUpstream(
    async (worker) => {
      creating = jest
        .spyOn(http, 'createServer')
        .mockImplementation((...args: Parameters<typeof realCreateServer>) => {
          const server = realCreateServer(...args);
          server.on('request', (incoming, response) => {
            if (incoming.url !== '/run') return;
            const realWrite = response.write.bind(response);
            type Callback = (error?: Error | null) => void;
            writing = jest
              .spyOn(response, 'write')
              .mockImplementation(
                (
                  chunk: Uint8Array | string,
                  encodingOrCallback?: BufferEncoding | Callback,
                  callback?: Callback,
                ) => {
                  const originalCallback =
                    typeof encodingOrCallback === 'function'
                      ? encodingOrCallback
                      : callback;
                  const observedCallback: Callback = (actualError) => {
                    if (actualError) {
                      unexpectedWriteErrors.push(actualError);
                      originalCallback?.(actualError);
                      return;
                    }
                    callbackInjections++;
                    destroyedAtCallback.push(response.destroyed);
                    // Only the real completed write's callback result is deliberately fault-injected.
                    originalCallback?.(injected);
                  };
                  return typeof encodingOrCallback === 'string'
                    ? realWrite(chunk, encodingOrCallback, observedCallback)
                    : realWrite(chunk, observedCallback);
                },
              );
          });
          return server;
        });
      try {
        await withProxy(worker, async (proxy) => {
          creating?.mockRestore();
          const deadline = AbortSignal.timeout(5000);
          let outgoing: ReturnType<typeof request> | undefined;
          try {
            outgoing = request(
              proxy.origin + '/run',
              {
                method: 'POST',
                headers: {
                  Origin: origin,
                  'Content-Type': 'application/json',
                  'X-Fixture-Principal': 'alice',
                },
              },
              (response) => {
                response.on('error', (error: Error) => {
                  if (!callbackInjections) unexpectedClientErrors.push(error);
                });
                response.resume();
              },
            );
            outgoing.on('error', (error: Error) => {
              if (!callbackInjections) unexpectedClientErrors.push(error);
            });
            outgoing.end(input);
            const fault = await proxy.waitForThread(
              threadId,
              'fault',
              deadline,
            );
            await proxy.waitFor(fault.requestId, 'downstream-closed', deadline);
            const closed = proxy
              .records(threadId)
              .find(
                (record) =>
                  record.requestId === fault.requestId &&
                  record.kind === 'downstream-closed',
              );
            if (!closed)
              throw new Error('Actual downstream close receipt required');
            await proxy.close();

            const records = proxy
              .records(threadId)
              .filter((record) => record.requestId === fault.requestId);
            expect(upstreamRequests).toBe(1);
            expect(callbackInjections).toBe(1);
            expect(destroyedAtCallback).toEqual([false]);
            expect(unexpectedWriteErrors).toEqual([]);
            expect(unexpectedClientErrors).toEqual([]);
            expect(
              records.filter((record) => record.kind === 'request'),
            ).toHaveLength(1);
            expect(
              records.filter((record) => record.kind === 'fault'),
            ).toHaveLength(1);
            expect(fault.reason).toBe(injected.message);
            expect(fault.seq).toBeLessThan(closed.seq);
            expect(fault).not.toHaveProperty('faultCause');
            expect(fault).not.toHaveProperty('faultStage');
            expect(fault).not.toHaveProperty('downstreamCloseSeq');
          } finally {
            outgoing?.destroy();
            writing?.mockRestore();
          }
        });
      } finally {
        creating?.mockRestore();
        writing?.mockRestore();
      }
    },
    async (incoming, response) => {
      upstreamRequests++;
      await bytes(incoming);
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(Buffer.concat([acknowledgement, terminal]));
    },
  );
});

test('candidate proxy close rejects a real record-cap failure that lost downstream-close evidence', async () => {
  let upstreamRequests = 0;
  let ownedDirectory: string | undefined;
  let callbackFailure: unknown;
  let observedProxy:
    Awaited<ReturnType<typeof startCandidateRecoveryProxy>> | undefined;

  try {
    await withUpstream(
      async (worker) => {
        await expect(
          withProxy(
            worker,
            async (proxy, path) => {
              observedProxy = proxy;
              ownedDirectory = dirname(path);
              try {
                const clientAborted = post(proxy.origin + '/run').then(
                  () => false,
                  () => true,
                );
                await proxy.waitForThread(
                  threadId,
                  'fault',
                  AbortSignal.timeout(5000),
                );
                expect(await clientAborted).toBe(true);
                // Drain queued real response-close rejection handlers, without a timing delay.
                await new Promise<void>((resolve) => setImmediate(resolve));

                const records = proxy.records(threadId);
                const faults = records.filter(
                  (record) => record.kind === 'fault',
                );
                expect(faults).toHaveLength(1);
                expect(faults[0].reason).toBe('Proxy evidence record limit');
                expect(faults[0]).not.toHaveProperty('faultCause');
                expect(faults[0]).not.toHaveProperty('faultStage');
                expect(faults[0]).not.toHaveProperty('downstreamCloseSeq');
                expect(
                  records.filter(
                    (record) => record.kind === 'downstream-closed',
                  ),
                ).toEqual([]);
                expect(
                  records.filter((record) => record.kind === 'request'),
                ).toHaveLength(1);
                expect(upstreamRequests).toBe(1);
              } catch (error) {
                callbackFailure = error;
                throw error;
              }
            },
            { records: 5 },
          ),
        ).rejects.toThrow('Proxy evidence record limit');
        if (callbackFailure !== undefined) throw callbackFailure;

        if (!observedProxy) throw new Error('Actual owned proxy required');
        const final = observedProxy.records();
        expect(
          final.filter((record) => record.kind === 'stop-start'),
        ).toHaveLength(1);
        expect(
          final.filter((record) => record.kind === 'stop-complete'),
        ).toHaveLength(1);
        expect(final.at(-1)?.kind).toBe('stop-complete');
      },
      async (incoming, response) => {
        upstreamRequests++;
        await bytes(incoming);
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.end(Buffer.concat([acknowledgement, terminal]));
      },
    );
  } finally {
    // withProxy's rm follows close and is skipped when close correctly rejects.
    if (ownedDirectory)
      await rm(ownedDirectory, { recursive: true, force: true });
  }
});
