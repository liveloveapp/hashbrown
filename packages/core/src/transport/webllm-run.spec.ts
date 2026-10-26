import type { WebLlmChunk } from './experimental-webllm-transport';
import { createWebLlmRun } from './webllm-run';

function chunk(content = '', finish_reason?: string): WebLlmChunk {
  return { choices: [{ delta: { content }, finish_reason }] };
}

function engine() {
  return { interruptGenerate: jest.fn() };
}

function runChunks(chunks: WebLlmChunk[], strictCompletion = true) {
  return createWebLlmRun({
    engine: engine(),
    create: async function* () {
      yield* chunks;
    },
    release: () => undefined,
    strictCompletion,
  });
}

async function collect(run: ReturnType<typeof createWebLlmRun>) {
  try {
    const reader = (await run.start(new AbortController().signal)).getReader();
    let text = '';
    while (true) {
      const result = await reader.read();
      if (result.done) return text;
      text += result.value;
    }
  } finally {
    run.cleanup();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('accepts legacy chunks without finish reasons by default', async () => {
  const run = createWebLlmRun({
    engine: engine(),
    create: async function* () {
      yield chunk('legacy');
    },
    release: () => undefined,
  });

  const result = await collect(run);

  expect(result).toBe('legacy');
});

test('accepts a strict stop carrying final text followed by iterator completion', async () => {
  const run = runChunks([chunk('first'), chunk('final', 'stop')]);

  const result = await collect(run);

  expect(result).toBe('firstfinal');
});

for (const [name, chunks] of [
  ['missing stop', [chunk('text')]],
  ['other finish reason', [chunk('', 'tool_calls')]],
  ['content after stop', [chunk('final', 'stop'), chunk('extra')]],
  ['finish reason after stop', [chunk('final', 'stop'), chunk('', 'stop')]],
  [
    'multiple choices',
    [{ choices: [...chunk('a').choices, ...chunk('b').choices] }],
  ],
] satisfies [string, WebLlmChunk[]][]) {
  test(`rejects strict completion with ${name}`, async () => {
    const run = runChunks([...chunks]);

    const result = collect(run);

    await expect(result).rejects.toMatchObject({
      code: 'WEBLLM_INVALID_COMPLETION',
    });
  });
}

test('rejects truncated strict completion', async () => {
  const run = runChunks([chunk('partial', 'length')]);

  const result = collect(run);

  await expect(result).rejects.toMatchObject({
    code: 'WEBLLM_OUTPUT_TRUNCATED',
  });
});

test('keeps the original engine busy after stop until a gated done', async () => {
  const injected = engine();
  const done = deferred<IteratorResult<WebLlmChunk>>();
  let reads = 0;
  const run = createWebLlmRun({
    engine: injected,
    create: () => ({
      [Symbol.asyncIterator]: () => ({
        next: () =>
          ++reads === 1
            ? Promise.resolve({ done: false, value: chunk('final', 'stop') })
            : done.promise,
      }),
    }),
    release: () => undefined,
    strictCompletion: true,
  });
  const reader = (await run.start(new AbortController().signal)).getReader();

  expect(await reader.read()).toEqual({ done: false, value: 'final' });
  const completion = reader.read();
  let settled = false;
  void completion.then(() => {
    settled = true;
  });
  await Promise.resolve();

  expect(settled).toBe(false);
  expect(() =>
    createWebLlmRun({
      engine: injected,
      create: async function* () {
        /* empty */
      },
      release: () => undefined,
    }),
  ).toThrow('already generating');
  done.resolve({ done: true, value: undefined });
  await expect(completion).resolves.toEqual({ done: true, value: undefined });
  run.cleanup();
  expect(injected.interruptGenerate).not.toHaveBeenCalled();
});

for (const stage of ['create', 'next'] as const) {
  test(`holds engine ownership while draining a late ${stage} after cancellation`, async () => {
    const injected = engine();
    const gate = deferred<IteratorResult<WebLlmChunk>>();
    const setup = deferred<AsyncIterable<WebLlmChunk>>();
    const entered = deferred<void>();
    const iterable = {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          entered.resolve();
          return gate.promise;
        },
      }),
    };
    const run = createWebLlmRun({
      engine: injected,
      create: () => {
        if (stage === 'create') entered.resolve();
        return stage === 'create' ? setup.promise : iterable;
      },
      release: () => undefined,
    });
    const started = run.start(new AbortController().signal);
    await entered.promise;

    run.cleanup();

    expect(injected.interruptGenerate).toHaveBeenCalledTimes(1);
    expect(() =>
      createWebLlmRun({
        engine: injected,
        create: () => iterable,
        release: () => undefined,
      }),
    ).toThrow('already generating');
    setup.resolve(iterable);
    gate.resolve({ done: true, value: undefined });
    if (stage === 'create')
      await expect(started).rejects.toMatchObject({
        code: 'PROMPT_API_ABORTED',
      });
    else await started;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const retry = createWebLlmRun({
      engine: injected,
      create: () => iterable,
      release: () => undefined,
    });
    retry.cleanup();
  });
}

test('setup cancellation releases promptly and late preparation cannot invoke the engine', async () => {
  const injected = engine();
  const prepared = deferred<void>();
  const entered = deferred<void>();
  const create = jest.fn(async function* () {
    yield chunk('late');
  });
  const release = jest.fn();
  const signal = new AbortController();
  const run = createWebLlmRun({
    engine: injected,
    prepare: () => {
      entered.resolve();
      return prepared.promise;
    },
    create,
    release,
  });
  const started = run.start(signal.signal);
  await entered.promise;

  signal.abort();
  const retry = createWebLlmRun({
    engine: injected,
    create,
    release: () => undefined,
  });
  prepared.resolve();
  await expect(started).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });

  expect(create).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
  expect(injected.interruptGenerate).not.toHaveBeenCalled();
  expect(() =>
    createWebLlmRun({ engine: injected, create, release: () => undefined }),
  ).toThrow('already generating');
  retry.cleanup();
});

test('releases a completed iterator synchronously before the next run claims the engine', async () => {
  const injected = engine();
  const release = jest.fn();
  const create = async function* () {
    yield chunk('final', 'stop');
  };
  const run = createWebLlmRun({
    engine: injected,
    create,
    release,
    strictCompletion: true,
  });
  const reader = (await run.start(new AbortController().signal)).getReader();
  await reader.read();
  await reader.read();

  run.cleanup();
  run.cleanup();

  expect(release).toHaveBeenCalledTimes(1);
  const retry = createWebLlmRun({
    engine: injected,
    create,
    release: () => undefined,
  });
  retry.cleanup();
  expect(injected.interruptGenerate).not.toHaveBeenCalled();
});

test('releases engine ownership when resource cleanup throws', () => {
  const injected = engine();
  const create = async function* () {
    yield chunk('unused');
  };
  const run = createWebLlmRun({
    engine: injected,
    create,
    release: () => {
      throw new Error('resource cleanup failed');
    },
  });

  expect(() => run.cleanup()).toThrow('resource cleanup failed');

  const retry = createWebLlmRun({
    engine: injected,
    create,
    release: () => undefined,
  });
  retry.cleanup();
});
