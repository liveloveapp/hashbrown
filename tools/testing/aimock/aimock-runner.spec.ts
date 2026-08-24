import { LLMock } from '@copilotkit/aimock';
import type { AGUIEvent } from '@copilotkit/aimock/agui';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AimockHandle, startAimock } from './aimock-runner';

function createFixtureFile(workDir: string, name: string, userMessage: string) {
  const fixturePath = join(workDir, name);
  writeFileSync(
    fixturePath,
    JSON.stringify({
      fixtures: [
        {
          match: { userMessage },
          response: { content: 'Hello from aimock.' },
        },
      ],
    }),
  );
  return fixturePath;
}

test('startAimock boots a replay server backed by one fixture file', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-aimock-'));
  const fixturePath = createFixtureFile(workDir, 'text.json', 'say hi briefly');
  let handle: AimockHandle | null = null;

  try {
    handle = await startAimock({ fixturePath });

    expect(handle.port).toBeGreaterThan(0);
    expect(handle.url).toMatch(/^http:\/\/.+/);
    expect(handle.openAiBaseUrl).toBe(`${handle.url}/v1`);
    expect(handle.anthropicBaseUrl).toBe(handle.url);
    expect(handle.ollamaHost).toBe(handle.url);
  } finally {
    await handle?.stop();
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('startAimock loads sorted JSON fixture files from a directory', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-aimock-'));
  createFixtureFile(workDir, 'b.json', 'two');
  createFixtureFile(workDir, 'a.json', 'one');
  writeFileSync(join(workDir, 'README.md'), '# ignored');
  let handle: AimockHandle | null = null;

  try {
    handle = await startAimock({ fixturePath: workDir });

    expect(handle.port).toBeGreaterThan(0);
  } finally {
    await handle?.stop();
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('startAimock serves fixture-backed AG-UI events from /run', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-aimock-'));
  const fixturePath = createFixtureFile(workDir, 'text.json', 'say hi briefly');
  let handle: AimockHandle | null = null;

  try {
    handle = await startAimock({ fixturePath });
    const events = [
      {
        type: 'RUN_STARTED',
        threadId: 'thread-runner',
        runId: 'run-runner',
        timestamp: 1_700_000_000_000,
      },
      {
        type: 'RUN_FINISHED',
        threadId: 'thread-runner',
        runId: 'run-runner',
        timestamp: 1_700_000_000_001,
      },
    ] satisfies AGUIEvent[];
    handle.aguiMock.onPredicate(() => true, events);

    const response = await fetch(handle.aguiRunUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: 'thread-runner',
        runId: 'run-runner',
        messages: [],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    await expect(response.text()).resolves.toBe(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    );
  } finally {
    await handle?.stop();
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('AimockHandle stop is idempotent', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-aimock-'));
  const fixturePath = createFixtureFile(workDir, 'text.json', 'say hi briefly');
  let handle: AimockHandle | null = null;

  try {
    handle = await startAimock({ fixturePath });

    await handle.stop();
    await handle.stop();

    expect(handle.port).toBeGreaterThan(0);
  } finally {
    await handle?.stop();
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('AimockHandle shares an in-flight shutdown across concurrent stop calls', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-aimock-'));
  const fixturePath = createFixtureFile(workDir, 'text.json', 'say hi briefly');
  const originalStop = LLMock.prototype.stop;
  let releaseStop: () => void = () => undefined;
  const stopGate = new Promise<void>((resolve) => {
    releaseStop = resolve;
  });
  let handle: AimockHandle | null = null;
  let stopSpy: jest.SpiedFunction<LLMock['stop']> | undefined;

  try {
    handle = await startAimock({ fixturePath });
    stopSpy = jest
      .spyOn(LLMock.prototype, 'stop')
      .mockImplementation(async function (this: LLMock) {
        await stopGate;
        await originalStop.call(this);
      });

    const firstStop = handle.stop();
    const secondStop = handle.stop();
    const stopCallCount = stopSpy.mock.calls.length;
    releaseStop();
    await Promise.allSettled([firstStop, secondStop]);

    expect(stopCallCount).toBe(1);
  } finally {
    releaseStop();
    stopSpy?.mockRestore();
    await handle?.stop();
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('AimockHandle retries shutdown after a failed stop', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-aimock-'));
  const fixturePath = createFixtureFile(workDir, 'text.json', 'say hi briefly');
  const originalStop = LLMock.prototype.stop;
  let handle: AimockHandle | null = null;
  let stopSpy: jest.SpiedFunction<LLMock['stop']> | undefined;

  try {
    handle = await startAimock({ fixturePath });
    stopSpy = jest
      .spyOn(LLMock.prototype, 'stop')
      .mockRejectedValueOnce(new Error('stop failed'))
      .mockImplementation(function (this: LLMock) {
        return originalStop.call(this);
      });

    await expect(handle.stop()).rejects.toThrow('stop failed');
    await expect(handle.stop()).resolves.toBeUndefined();

    expect(stopSpy).toHaveBeenCalledTimes(2);
  } finally {
    stopSpy?.mockRestore();
    await handle?.stop();
    rmSync(workDir, { recursive: true, force: true });
  }
});
