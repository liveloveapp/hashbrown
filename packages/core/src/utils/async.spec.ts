import { forwardMapped, sleep } from './async';

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

test('forwardMapped re-yields events and returns the mapper result', async () => {
  async function* mapper(): AsyncGenerator<string, number> {
    yield 'a';
    yield 'b';
    return 42;
  }
  const seen: string[] = [];

  const forwarding = forwardMapped(mapper());
  let next = await forwarding.next();
  while (!next.done) {
    seen.push(next.value);
    next = await forwarding.next();
  }

  expect(seen).toEqual(['a', 'b']);
  expect(next.value).toBe(42);
});

test('forwardMapped stops after the event during which the signal aborted', async () => {
  const controller = new AbortController();
  const finalized = jest.fn();
  async function* mapper(): AsyncGenerator<string, number> {
    try {
      yield 'start';
      yield 'content';
      return 42;
    } finally {
      finalized();
    }
  }
  const seen: string[] = [];

  const forwarding = forwardMapped(mapper(), controller.signal);
  let next = await forwarding.next();
  while (!next.done) {
    seen.push(next.value);
    controller.abort();
    next = await forwarding.next();
  }

  expect(seen).toEqual(['start']);
  expect(next.value).toBeUndefined();
  expect(finalized).toHaveBeenCalledTimes(1);
});
