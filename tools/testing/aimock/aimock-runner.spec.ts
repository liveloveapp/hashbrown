import { LLMock } from '@copilotkit/aimock';
import type { AGUIEvent } from '@copilotkit/aimock/agui';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  let settledBeforeRelease: boolean[] = [];
  let stopResults: PromiseSettledResult<void>[] = [];
  let stopCallCount = 0;

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
    let firstSettled = false;
    let secondSettled = false;
    void firstStop.then(
      () => {
        firstSettled = true;
      },
      () => {
        firstSettled = true;
      },
    );
    void secondStop.then(
      () => {
        secondSettled = true;
      },
      () => {
        secondSettled = true;
      },
    );

    await Promise.resolve();

    settledBeforeRelease = [firstSettled, secondSettled];
    releaseStop();
    stopResults = await Promise.allSettled([firstStop, secondStop]);
    stopCallCount = stopSpy.mock.calls.length;
  } finally {
    releaseStop();
    stopSpy?.mockRestore();
    await handle?.stop();
    rmSync(workDir, { recursive: true, force: true });
  }

  expect(settledBeforeRelease).toEqual([false, false]);
  expect(stopResults).toEqual([
    { status: 'fulfilled', value: undefined },
    { status: 'fulfilled', value: undefined },
  ]);
  expect(stopCallCount).toBe(1);
  expect(existsSync(workDir)).toBe(false);
});

test('AimockHandle shares a concurrent shutdown failure and permits a later retry', async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'hashbrown-aimock-'));
  const fixturePath = createFixtureFile(workDir, 'text.json', 'say hi briefly');
  const originalStop = LLMock.prototype.stop;
  const shutdownFailure = new Error('stop failed');
  let releaseStop: () => void = () => undefined;
  const stopGate = new Promise<void>((resolve) => {
    releaseStop = resolve;
  });
  let stopAttempt = 0;
  let handle: AimockHandle | null = null;
  let stopSpy: jest.SpiedFunction<LLMock['stop']> | undefined;
  let settledBeforeRelease: boolean[] = [];
  let failureResults: PromiseSettledResult<void>[] = [];
  let retryResults: PromiseSettledResult<void>[] = [];
  let stopCallCountAfterFailure = 0;
  let stopCallCountAfterRetry = 0;

  try {
    handle = await startAimock({ fixturePath });
    stopSpy = jest
      .spyOn(LLMock.prototype, 'stop')
      .mockImplementation(async function (this: LLMock) {
        stopAttempt += 1;
        if (stopAttempt === 1) {
          await stopGate;
          throw shutdownFailure;
        }

        await originalStop.call(this);
      });

    const firstStop = handle.stop();
    const secondStop = handle.stop();
    let firstSettled = false;
    let secondSettled = false;
    void firstStop.then(
      () => {
        firstSettled = true;
      },
      () => {
        firstSettled = true;
      },
    );
    void secondStop.then(
      () => {
        secondSettled = true;
      },
      () => {
        secondSettled = true;
      },
    );

    await Promise.resolve();

    settledBeforeRelease = [firstSettled, secondSettled];
    releaseStop();
    failureResults = await Promise.allSettled([firstStop, secondStop]);
    stopCallCountAfterFailure = stopSpy.mock.calls.length;
    retryResults = await Promise.allSettled([handle.stop()]);
    stopCallCountAfterRetry = stopSpy.mock.calls.length;
  } finally {
    releaseStop();
    stopSpy?.mockRestore();
    await handle?.stop();
    rmSync(workDir, { recursive: true, force: true });
  }

  expect(settledBeforeRelease).toEqual([false, false]);
  expect(failureResults).toHaveLength(2);
  for (const result of failureResults) {
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason).toBe(shutdownFailure);
    }
  }
  expect(stopCallCountAfterFailure).toBe(1);
  expect(retryResults).toEqual([{ status: 'fulfilled', value: undefined }]);
  expect(stopCallCountAfterRetry).toBe(2);
  expect(existsSync(workDir)).toBe(false);
});
