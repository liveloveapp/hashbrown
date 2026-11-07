import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLiveRecoveryHandlerObserver } from '../harness/live-recovery-handler-observer';
import { startLiveRecoveryProxy } from '../harness/live-recovery-transport';

test('live browser proof primitives accept no evidence path and persist no raw observations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'recovery-no-raw-'));
  const filesystem =
    jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  const open = jest.spyOn(filesystem, 'open');
  const observer = await startLiveRecoveryHandlerObserver({
    ownedOrigins: ['http://127.0.0.1:3000'],
    limits: {
      requestBytes: 8192,
      resultBytes: 8192,
      records: 32,
      holdTimeoutMs: 1000,
    },
  });
  const proxy = await startLiveRecoveryProxy({
    ownedOrigins: ['http://127.0.0.1:3000'],
    limits: {
      requestBytes: 8192,
      responseBytes: 8192,
      frameBytes: 8192,
      records: 32,
      holdTimeoutMs: 1000,
    },
  });

  try {
    const entry = observer.register({
      scope: { scenarioId: 'memory-control', threadId: 'thread' },
      operations: [
        {
          correlation: 'canary-argument',
          toolName: 'getWeather',
          arguments: { city: 'canary-argument' },
          compute: () => ({ value: 'canary-private-result' }),
        },
      ],
    });
    const response = await fetch(entry.entryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correlation: 'canary-argument',
        toolName: 'getWeather',
        arguments: { city: 'canary-argument' },
      }),
    });

    expect(response.status).toBe(201);
    expect(
      observer.entries({ scenarioId: 'memory-control', threadId: 'thread' })[0]
        .result,
    ).toEqual({ value: 'canary-private-result' });
    expect(await readdir(directory)).toEqual([]);
    expect(open).not.toHaveBeenCalled();
  } finally {
    await proxy.close();
    await observer.close();
    open.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});
