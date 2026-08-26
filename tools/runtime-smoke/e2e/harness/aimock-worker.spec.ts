import type { AimockHandle } from '@hashbrownai/testing/aimock';
import { runAimockWorker } from './aimock-worker';

function createAimockHandle(stop: () => Promise<void>): AimockHandle {
  return {
    port: 3000,
    url: 'http://localhost:3000',
    aguiRunUrl: 'http://localhost:3000/run',
    aguiMock: {} as AimockHandle['aguiMock'],
    openAiBaseUrl: 'http://localhost:3000/v1',
    anthropicBaseUrl: 'http://localhost:3000',
    ollamaHost: 'http://localhost:3000',
    stop,
  };
}

test('stops aimock after worker body succeeds', async () => {
  const events: string[] = [];
  const originalStop = jest.fn(async () => {
    events.push('stop');
  });
  const originalHandle = createAimockHandle(originalStop);
  let workerHandle: AimockHandle | undefined;

  await runAimockWorker(
    async () => originalHandle,
    async (handle) => {
      workerHandle = handle;
      events.push('use');
    },
  );

  expect(events).toEqual(['use', 'stop']);
  expect(workerHandle?.stop).toEqual(expect.any(Function));
  expect(workerHandle?.stop).not.toBe(originalStop);
  expect(originalStop).toHaveBeenCalledTimes(1);
});

test('stops aimock after worker body fails and preserves the exact body error', async () => {
  const bodyError = new Error('body failed');
  const stop = jest.fn(async () => undefined);
  const handle = createAimockHandle(stop);

  const result = runAimockWorker(
    async () => handle,
    async () => {
      throw bodyError;
    },
  );

  await expect(result).rejects.toBe(bodyError);
  expect(stop).toHaveBeenCalledTimes(1);
});

test('surfaces a shutdown failure after a successful body', async () => {
  const shutdownError = new Error('shutdown failed');
  const stop = jest.fn(async () => {
    throw shutdownError;
  });
  const handle = createAimockHandle(stop);

  const result = runAimockWorker(
    async () => handle,
    async () => undefined,
  );

  await expect(result).rejects.toBe(shutdownError);
  expect(stop).toHaveBeenCalledTimes(1);
});

test('preserves body failure while awaiting a rejected shutdown', async () => {
  const bodyError = new Error('body failed');
  const shutdownError = new Error('shutdown failed');
  let rejectShutdown: (error: Error) => void = () => undefined;
  let signalShutdownStarted: () => void = () => undefined;
  const shutdownStarted = new Promise<void>((resolve) => {
    signalShutdownStarted = resolve;
  });
  const stop = jest.fn(() => {
    signalShutdownStarted();
    return new Promise<void>((_resolve, reject) => {
      rejectShutdown = reject;
    });
  });
  const handle = createAimockHandle(stop);
  let settled = false;

  const result = runAimockWorker(
    async () => handle,
    async () => {
      throw bodyError;
    },
  );
  void result.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await shutdownStarted;

  expect(stop).toHaveBeenCalledTimes(1);
  expect(settled).toBe(false);

  rejectShutdown(shutdownError);

  await expect(result).rejects.toBe(bodyError);
});

test('makes teardown idempotent when the body stops twice and the finalizer runs', async () => {
  const stop = jest.fn(async () => undefined);
  const originalHandle = createAimockHandle(stop);

  await runAimockWorker(
    async () => originalHandle,
    async (handle) => {
      await handle.stop();
      await handle.stop();
    },
  );

  expect(stop).toHaveBeenCalledTimes(1);
});
