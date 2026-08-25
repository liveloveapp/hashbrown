import { raceTransportOperationWithAbort } from './race-transport-operation-with-abort';

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

async function flushTasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function settleWithinTask<T>(promise: Promise<T>) {
  return Promise.race([
    promise.then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason: unknown) => ({ status: 'rejected' as const, reason }),
    ),
    new Promise<{ status: 'pending' }>((resolve) => {
      setImmediate(() => resolve({ status: 'pending' }));
    }),
  ]);
}

test('does not start an operation when the signal is already aborted', async () => {
  const abortError = new Error('aborted');
  const controller = new AbortController();
  controller.abort(abortError);
  const operation = jest.fn(async () => 'late');

  const result = raceTransportOperationWithAbort(
    operation,
    controller.signal,
    () => abortError,
  );

  await expect(result).rejects.toBe(abortError);
  expect(operation).not.toHaveBeenCalled();
});

test.each(['resolve', 'reject'] as const)(
  'settles on abort and owns a late operation %s',
  async (lateSettlement) => {
    const operationResult = createDeferred<string>();
    const abortError = new Error('aborted');
    const lateError = new Error('late failure');
    const controller = new AbortController();
    const removeEventListener = jest.spyOn(
      controller.signal,
      'removeEventListener',
    );

    const result = raceTransportOperationWithAbort(
      () => operationResult.promise,
      controller.signal,
      () => abortError,
    );
    controller.abort();

    await expect(settleWithinTask(result)).resolves.toEqual({
      status: 'rejected',
      reason: abortError,
    });
    expect(removeEventListener).toHaveBeenCalledWith(
      'abort',
      expect.any(Function),
    );

    if (lateSettlement === 'resolve') {
      operationResult.resolve('late');
    } else {
      operationResult.reject(lateError);
    }
    await flushTasks();

    await expect(result).rejects.toBe(abortError);
  },
);
