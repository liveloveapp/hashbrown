import { sleep } from './async';

test('sleep settles when its abort signal is aborted', async () => {
  const abortController = new AbortController();
  const sleeping = sleep(60_000, abortController.signal).then(
    () => 'settled' as const,
  );

  abortController.abort();

  await expect(
    Promise.race([
      sleeping,
      new Promise<'timed-out'>((resolve) =>
        setTimeout(() => resolve('timed-out'), 100),
      ),
    ]),
  ).resolves.toBe('settled');
});
