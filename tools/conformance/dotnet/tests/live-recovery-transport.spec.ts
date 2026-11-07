import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { startLiveRecoveryProxy } from '../harness/live-recovery-transport';

const threadId = 'recovery-transport-control';
const ack =
  'data: {"type":"RUN_STARTED","threadId":"recovery-transport-control","runId":"actual-run"}\n\n';
const final =
  'data: {"type":"RUN_FINISHED","threadId":"recovery-transport-control","runId":"actual-run"}\n\n';

/** Owns a genuine HTTP source for transport controls; this is not a native or provider qualification. */
async function source() {
  let calls = 0;
  const server = createServer(async (incoming, response) => {
    for await (const _chunk of incoming) {
      /* drain actual request */
    }
    calls++;
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(ack);
    response.end(final);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    calls: () => calls,
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: async () => {
      const closed = once(server, 'close');
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

test('withholding completion drains the entire actual source before awaiting physical commit', async () => {
  const worker = await source();
  const proxy = await startLiveRecoveryProxy({
    ownedOrigins: ['http://127.0.0.1:3000'],
    limits: {
      requestBytes: 8192,
      responseBytes: 65536,
      frameBytes: 8192,
      records: 256,
      holdTimeoutMs: 2000,
    },
  });
  let release!: () => void;
  const committed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let observedSourceComplete = false;
  let clientClosed = false;

  try {
    proxy.registerWorker({
      id: 'worker-a',
      origin: worker.origin,
      loadedIdentityEvidence: '/private/owned-worker-proof.json',
    });
    proxy.registerThread({
      scenarioId: 'control',
      threadId,
      workerId: 'worker-a',
      recoveryPath: `/threads/${threadId}/native-session`,
      principal: 'alice',
    });
    proxy.armCommittedLoss(threadId, async () => {
      const records = proxy.records(threadId);
      observedSourceComplete = records.some(
        (record) => record.kind === 'upstream-complete',
      );
      expect(observedSourceComplete).toBe(true);
      expect(
        Buffer.concat(
          records
            .filter((record) => record.kind === 'upstream-body')
            .map((record) => record.bytes),
        ).toString(),
      ).toBe(ack + final);
      await committed;
    });
    const request = fetch(`${proxy.origin}/run`, {
      method: 'POST',
      body: JSON.stringify({ threadId, messages: [] }),
      headers: {
        'Content-Type': 'application/json',
        'X-Fixture-Principal': 'alice',
      },
      signal: AbortSignal.timeout(2000),
    });
    const delivered = request
      .then((response) => response.text())
      .then(
        () => {
          clientClosed = true;
        },
        () => {
          clientClosed = true;
        },
      );
    await proxy.waitForThread(
      threadId,
      'upstream-complete',
      AbortSignal.timeout(1000),
    );

    expect(worker.calls()).toBe(1);
    expect(clientClosed).toBe(false);
    expect(
      proxy
        .records(threadId)
        .filter((record) => record.kind === 'delivered-body')
        .some((record) => record.bytes.includes(Buffer.from('RUN_FINISHED'))),
    ).toBe(false);
    release();
    await delivered;

    expect(observedSourceComplete).toBe(true);
    const records = proxy.records(threadId);
    const commit = records.find((record) => record.kind === 'commit-verified');
    const loss = records.find((record) => record.kind === 'post-commit-loss');
    expect(commit).toBeDefined();
    expect(loss).toBeDefined();
    expect(commit!.seq).toBeLessThan(loss!.seq);
  } finally {
    release();
    await proxy.close();
    await worker.close();
  }
});

test('failed physical commit or teardown validation cannot produce successful post-commit loss evidence', async () => {
  const worker = await source();
  const proxy = await startLiveRecoveryProxy({
    ownedOrigins: ['http://127.0.0.1:3000'],
    limits: {
      requestBytes: 8192,
      responseBytes: 65536,
      frameBytes: 8192,
      records: 256,
      holdTimeoutMs: 2000,
    },
  });

  let validatorEntered = false;

  try {
    proxy.registerWorker({
      id: 'worker-a',
      origin: worker.origin,
      loadedIdentityEvidence: '/private/owned-worker-proof.json',
    });
    proxy.registerThread({
      scenarioId: 'control',
      threadId,
      workerId: 'worker-a',
      recoveryPath: `/threads/${threadId}/native-session`,
      principal: 'alice',
    });
    proxy.armCommittedLoss(threadId, async () => {
      validatorEntered = true;
      throw new Error('CONTROL_PHYSICAL_COMMIT_MISSING');
    });

    await fetch(`${proxy.origin}/run`, {
      method: 'POST',
      body: JSON.stringify({ threadId, messages: [] }),
      headers: {
        'Content-Type': 'application/json',
        'X-Fixture-Principal': 'alice',
      },
      signal: AbortSignal.timeout(2000),
    })
      .then((response) => response.text())
      .catch(() => undefined);

    expect(worker.calls()).toBe(1);
    expect(validatorEntered).toBe(true);
    expect(
      proxy
        .records(threadId)
        .some((record) => record.kind === 'post-commit-loss'),
    ).toBe(false);
    expect(
      proxy
        .records(threadId)
        .some(
          (record) =>
            record.kind === 'fault' &&
            record.reason === 'CONTROL_PHYSICAL_COMMIT_MISSING',
        ),
    ).toBe(true);
    await expect(proxy.close()).rejects.toThrow();
  } finally {
    await proxy.close().catch(() => undefined);
    await worker.close();
  }
});

/** Owns a real chunked response whose HTTP EOF is independently gated after a terminal frame. */
async function terminalSource(
  mode:
    | 'normal'
    | 'wrong-run'
    | 'wrong-thread'
    | 'partial-terminal'
    | 'before-terminal'
    | 'truncated'
    | 'extra'
    | 'non-200' = 'normal',
) {
  let release!: () => void;
  let releaseTerminal!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const terminalGate = new Promise<void>((done) => {
    releaseTerminal = done;
  });
  let prematureClose = false;
  let reachedEof = false;
  const server = createServer(async (incoming, response) => {
    for await (const _chunk of incoming) {
      /* drain the actual request */
    }
    response.on('error', () => undefined);
    response.once('close', () => {
      if (!response.writableFinished) prematureClose = true;
    });
    response.writeHead(mode === 'non-200' ? 503 : 200, {
      'Content-Type': 'text/event-stream',
    });
    response.write(ack);
    await terminalGate;
    const terminal =
      mode === 'wrong-run'
        ? final.replace('actual-run', 'wrong-run')
        : mode === 'wrong-thread'
          ? final.replace(threadId, 'wrong-thread')
          : final;
    if (mode !== 'before-terminal')
      response.write(
        mode === 'partial-terminal' ? terminal.slice(0, -5) : terminal,
      );
    await gate;
    reachedEof = true;
    if (mode === 'truncated') response.destroy();
    else
      response.end(
        mode === 'extra'
          ? 'data: {"type":"CUSTOM","name":"illegal-after-terminal"}\n\n'
          : '',
      );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    release,
    releaseTerminal,
    prematureClose: () => prematureClose,
    reachedEof: () => reachedEof,
    close: async () => {
      releaseTerminal();
      release();
      const closed = once(server, 'close');
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

/** Registers exact thread/run identity for real HTTP cancellation controls. */
async function terminalControl(mode: Parameters<typeof terminalSource>[0]) {
  const worker = await terminalSource(mode);
  let proxy: Awaited<ReturnType<typeof startLiveRecoveryProxy>> | undefined;
  try {
    proxy = await startLiveRecoveryProxy({
      ownedOrigins: ['http://127.0.0.1:3000'],
      limits: {
        requestBytes: 8192,
        responseBytes: 65536,
        frameBytes: 8192,
        records: 256,
        holdTimeoutMs: 2000,
      },
    });
    proxy.registerWorker({
      id: 'terminal-worker',
      origin: worker.origin,
      loadedIdentityEvidence: 'owned-terminal-control',
    });
    proxy.registerThread({
      scenarioId: 'terminal-control',
      threadId,
      workerId: 'terminal-worker',
      recoveryPath: `/threads/${threadId}/native-session`,
      principal: 'alice',
    });
    const response = await fetch(`${proxy.origin}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fixture-Principal': 'alice',
      },
      body: JSON.stringify({ threadId, runId: 'actual-run', messages: [] }),
      signal: AbortSignal.timeout(2000),
    });
    if (!response.body) throw new Error('Actual response reader missing');
    const reader = response.body.getReader();
    worker.releaseTerminal();
    return { worker, proxy, reader };
  } catch (error) {
    const errors: unknown[] = [error];
    worker.releaseTerminal();
    worker.release();
    try {
      await proxy?.close();
    } catch (closeError) {
      errors.push(closeError);
    }
    try {
      await worker.close();
    } catch (closeError) {
      errors.push(closeError);
    }
    if (errors.length > 1)
      throw new AggregateError(errors, 'TERMINAL_CONTROL_ACQUISITION_FAILED');
    throw error;
  }
}

/** Reads only until the actual complete terminal has arrived, mirroring the installed SDK's terminal disposal. */
async function readTerminal(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let text = '';
  while (!text.includes(final)) {
    const value = await reader.read();
    if (value.done) throw new Error('Actual terminal missing');
    text += Buffer.from(value.value).toString('utf8');
  }
}

test('normal client terminal cancellation keeps the real upstream alive until its independently released HTTP EOF', async () => {
  const { worker, proxy, reader } = await terminalControl('normal');

  try {
    await readTerminal(reader);
    await reader.cancel();
    await proxy.waitForThread(
      threadId,
      'downstream-terminal-write',
      AbortSignal.timeout(1000),
    );
    await proxy.waitForThread(
      threadId,
      'downstream-closed',
      AbortSignal.timeout(1000),
    );

    expect(worker.reachedEof()).toBe(false);
    expect(worker.prematureClose()).toBe(false);
    expect(
      proxy
        .records(threadId)
        .some((record) => record.kind === 'upstream-complete'),
    ).toBe(false);
    worker.release();
    const complete = await proxy.waitForThread(
      threadId,
      'complete',
      AbortSignal.timeout(1000),
    );
    const source = proxy
      .records(threadId)
      .find((record) => record.kind === 'upstream-complete');

    expect(source).toBeDefined();
    expect(source!.seq).toBeLessThan(complete.seq);
    expect(worker.reachedEof()).toBe(true);
    expect(
      proxy.records(threadId).filter((record) => record.kind === 'fault'),
    ).toEqual([]);
    await expect(proxy.close()).resolves.toBeUndefined();
  } finally {
    worker.release();
    await proxy.close().catch(() => undefined);
    await worker.close();
  }
});

for (const mode of [
  'wrong-run',
  'wrong-thread',
  'partial-terminal',
  'before-terminal',
  'non-200',
] as const)
  test(`client closure after ${mode} cannot certify a successful terminal drain`, async () => {
    const { worker, proxy, reader } = await terminalControl(mode);

    try {
      if (mode === 'wrong-run' || mode === 'wrong-thread') {
        const fault = await proxy.waitForThread(
          threadId,
          'fault',
          AbortSignal.timeout(1000),
        );
        expect(fault.reason).toBe('Recovery source terminal identity mismatch');
      } else if (mode === 'non-200') await readTerminal(reader);
      else {
        let bytes = '';
        const wanted =
          mode === 'partial-terminal' ? 'RUN_FINISHED' : 'RUN_STARTED';
        while (!bytes.includes(wanted)) {
          const next = await reader.read();
          if (next.done)
            throw new Error('Actual preterminal control source missing');
          bytes += Buffer.from(next.value).toString('utf8');
        }
      }
      await reader.cancel().catch(() => undefined);
      await proxy.waitForThread(threadId, 'fault', AbortSignal.timeout(1000));

      expect(
        proxy
          .records(threadId)
          .some((record) => record.kind === 'downstream-terminal-write'),
      ).toBe(false);
      expect(
        proxy
          .records(threadId)
          .some((record) => record.kind === 'upstream-complete'),
      ).toBe(false);
      await expect(proxy.close()).rejects.toThrow();
    } finally {
      worker.release();
      await proxy.close().catch(() => undefined);
      await worker.close();
    }
  });

for (const mode of ['truncated', 'extra'] as const)
  test(`a fully delivered terminal does not hide genuine ${mode} upstream failure`, async () => {
    const { worker, proxy, reader } = await terminalControl(mode);

    try {
      await readTerminal(reader);
      await reader.cancel();
      await proxy.waitForThread(
        threadId,
        'downstream-terminal-write',
        AbortSignal.timeout(1000),
      );
      worker.release();
      await proxy.waitForThread(threadId, 'fault', AbortSignal.timeout(1000));

      expect(
        proxy
          .records(threadId)
          .some((record) => record.kind === 'upstream-complete'),
      ).toBe(false);
      await expect(proxy.close()).rejects.toThrow();
    } finally {
      worker.release();
      await proxy.close().catch(() => undefined);
      await worker.close();
    }
  });
