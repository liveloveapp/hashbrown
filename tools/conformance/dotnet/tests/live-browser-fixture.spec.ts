import {
  readLiveCoordinator,
  withSafeLiveCase,
} from '../harness/live-browser-fixture';

test('live browser coordinator accepts only a loopback origin and opaque capability', () => {
  const valid = {
    HASHBROWN_LIVE_COORDINATOR: 'http://127.0.0.1:49213',
    HASHBROWN_LIVE_CAPABILITY: 'a'.repeat(64),
  };

  const coordinator = readLiveCoordinator(valid);

  expect(coordinator).toEqual({
    origin: valid.HASHBROWN_LIVE_COORDINATOR,
    capability: valid.HASHBROWN_LIVE_CAPABILITY,
  });
  for (const origin of [
    'https://remote.invalid',
    'http://127.0.0.1:49213/secret',
    'http://user:secret@127.0.0.1:49213',
    'http://localhost:49213',
  ]) {
    expect(() =>
      readLiveCoordinator({ ...valid, HASHBROWN_LIVE_COORDINATOR: origin }),
    ).toThrow('LIVE_COORDINATOR_INVALID');
  }
});

test('case guard removes assertion messages, stacks and causes before Playwright can persist them', async () => {
  const annotations: Array<{ type: string; description: string }> = [];
  const raw = new Error('secret-canary', { cause: new Error('nested-secret') });
  let caught: unknown;

  try {
    await withSafeLiveCase(
      async () => {
        throw raw;
      },
      (annotation) => annotations.push(annotation),
    );
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).name).toBe('');
  expect((caught as Error).message).toBe('');
  expect((caught as Error).stack).toBe('');
  expect((caught as Error).cause).toBeUndefined();
  expect(JSON.stringify(caught)).not.toMatch(/secret|canary/);
  expect(annotations).toEqual([
    { type: 'live-failure', description: 'LIVE_ASSERTION_FAILED' },
  ]);
});

test('case deadline aborts and drains its owned callback before throwing a blank error', async () => {
  const events: string[] = [];

  await expect(
    withSafeLiveCase(
      async (signal) => {
        await new Promise<void>((resolve) =>
          signal.addEventListener(
            'abort',
            () => {
              events.push('aborted');
              resolve();
            },
            { once: true },
          ),
        );
        events.push('drained');
      },
      () => undefined,
      5,
    ),
  ).rejects.toMatchObject({ name: '', message: '', stack: '' });

  expect(events).toEqual(['aborted', 'drained']);
});
