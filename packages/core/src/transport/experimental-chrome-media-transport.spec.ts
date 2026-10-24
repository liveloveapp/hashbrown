import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  ExperimentalChromeLocalTransport,
  type ExperimentalChromeLocalTransportOptions,
} from './experimental-chrome-local-transport';
import type { TransportRequest } from './transport';

/** Supplies a browser session and decoder with observable ownership. */
async function nativeFixture(
  run: (value: ReturnType<typeof fixture>) => Promise<void>,
) {
  const value = fixture();
  const global = globalThis as unknown as Record<string, unknown>;
  const previousModel = global['LanguageModel'];
  const previousDecoder = global['createImageBitmap'];
  global['LanguageModel'] = value.model;
  global['createImageBitmap'] = jest.fn(async () => value.bitmap);
  try {
    await run(value);
  } finally {
    if (previousModel === undefined) delete global['LanguageModel'];
    else global['LanguageModel'] = previousModel;
    if (previousDecoder === undefined) delete global['createImageBitmap'];
    else global['createImageBitmap'] = previousDecoder;
  }
}

/** Creates one deterministic native stream; no inference occurs in unit tests. */
function fixture() {
  const order: string[] = [];
  const bitmap = {
    width: 1,
    height: 1,
    close: jest.fn(() => {
      order.push('image-closed');
    }),
  };
  const session = {
    prompt: jest.fn(async () => 'unused'),
    promptStreaming: jest.fn(
      () =>
        new ReadableStream<string>({
          start(controller) {
            controller.enqueue('Red');
            controller.close();
          },
        }),
    ),
    destroy: jest.fn(() => {
      order.push('session-destroyed');
    }),
  };
  const create = jest.fn<
    Promise<typeof session>,
    [options?: { signal?: AbortSignal }]
  >(async () => session);
  const model: { availability?: jest.Mock; create: typeof create } = {
    availability: jest.fn(async () => 'available'),
    create,
  };
  const dispose = jest.fn(() => {
    order.push('resource-released');
  });
  const resolve = jest.fn(async () => ({
    blob: new Blob(['image'], { type: 'image/png' }),
    dispose,
  }));
  return { order, bitmap, session, model, create, dispose, resolve };
}

/** Builds a serializable image request whose bytes are resolved by application policy. */
function request(): TransportRequest {
  return {
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'request',
    input: {
      threadId: 'thread',
      runId: 'run',
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
      messages: [
        { id: 'system', role: 'system', content: 'Describe the image.' },
        {
          id: 'user',
          role: 'user',
          content: [
            { type: 'text', text: 'What color?' },
            {
              type: 'image',
              source: { type: 'file', value: 'synthetic-image' },
            },
          ],
        },
      ],
    },
  };
}

/** Exercises the proposed media option without weakening unrelated public test types. */
function options(
  value: ReturnType<typeof fixture>,
): ExperimentalChromeLocalTransportOptions {
  return {
    media: { images: {}, resolve: value.resolve },
  } as ExperimentalChromeLocalTransportOptions;
}

/** Consumes the actual local AG-UI lifecycle. */
async function collect(events: AsyncIterable<AGUIEvent>) {
  const result: AGUIEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

test('negotiates image input and keeps resolved resources alive until native generation settles', async () => {
  await nativeFixture(async (value) => {
    const transport = new ExperimentalChromeLocalTransport(options(value));

    const response = await transport.send(request());

    expect(value.model.availability).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedInputs: [
          { type: 'text', languages: ['en'] },
          { type: 'image' },
        ],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      }),
    );
    expect(value.create).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedInputs: [
          { type: 'text', languages: ['en'] },
          { type: 'image' },
        ],
      }),
    );
    expect(value.bitmap.close).not.toHaveBeenCalled();
    const events = await collect(response.events);
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
    expect(value.session.promptStreaming).toHaveBeenCalledWith(
      [
        {
          role: 'user',
          content: [
            { type: 'text', value: 'What color?' },
            { type: 'image', value: value.bitmap },
          ],
        },
      ],
      expect.any(Object),
    );
    expect(value.order).toEqual([
      'session-destroyed',
      'image-closed',
      'resource-released',
    ]);
  });
});

test('requires checkable modality support instead of assuming media is available', async () => {
  await nativeFixture(async (value) => {
    delete value.model.availability;
    const transport = new ExperimentalChromeLocalTransport(options(value));

    const pending = transport.send(request());

    await expect(pending).rejects.toMatchObject({
      code: 'FEATURE_UNSUPPORTED',
    });
    expect(value.create).not.toHaveBeenCalled();
    expect(value.dispose).toHaveBeenCalledTimes(1);
  });
});

test.each(['unavailable', 'create failure'] as const)(
  'releases media after native %s',
  async (failure) => {
    await nativeFixture(async (value) => {
      if (failure === 'unavailable')
        value.model.availability?.mockResolvedValue('unavailable');
      else value.create.mockRejectedValue(new Error('create failure'));
      const transport = new ExperimentalChromeLocalTransport(options(value));

      const pending = transport.send(request());

      await expect(pending).rejects.toThrow();
      expect(value.bitmap.close).toHaveBeenCalledTimes(1);
      expect(value.dispose).toHaveBeenCalledTimes(1);
    });
  },
);

test('disposes media when a prepared response is explicitly disposed before iteration', async () => {
  await nativeFixture(async (value) => {
    const transport = new ExperimentalChromeLocalTransport(options(value));
    const response = await transport.send(request());

    await response.dispose?.();
    await response.dispose?.();

    expect(value.session.promptStreaming).not.toHaveBeenCalled();
    expect(value.session.destroy).toHaveBeenCalledTimes(1);
    expect(value.bitmap.close).toHaveBeenCalledTimes(1);
    expect(value.dispose).toHaveBeenCalledTimes(1);
  });
});

test('transport destruction disposes outstanding media responses', async () => {
  await nativeFixture(async (value) => {
    const transport = new ExperimentalChromeLocalTransport(options(value));
    const response = await transport.send(request());

    await transport.destroy();
    await response.dispose?.();

    expect(value.session.destroy).toHaveBeenCalledTimes(1);
    expect(value.bitmap.close).toHaveBeenCalledTimes(1);
    expect(value.dispose).toHaveBeenCalledTimes(1);
  });
});

test('does not silently ignore a custom transform when media is opted in', async () => {
  await nativeFixture(async (value) => {
    const transport = new ExperimentalChromeLocalTransport({
      ...options(value),
      transformRequest: () => ({ messages: 'Silently lost image' }),
    });

    const pending = transport.send(request());

    await expect(pending).rejects.toMatchObject({
      code: 'FEATURE_UNSUPPORTED',
    });
    expect(value.resolve).not.toHaveBeenCalled();
    expect(value.create).not.toHaveBeenCalled();
  });
});

test('releases media after a native streaming failure without replacing the original error', async () => {
  await nativeFixture(async (value) => {
    value.session.promptStreaming.mockImplementationOnce(() => {
      throw new Error('Native read failed');
    });
    const transport = new ExperimentalChromeLocalTransport(options(value));
    const response = await transport.send(request());

    await expect(collect(response.events)).rejects.toThrow(
      'Native read failed',
    );

    expect(value.order).toEqual([
      'session-destroyed',
      'image-closed',
      'resource-released',
    ]);
  });
});

test('transport destruction cancels pending resolution and owns a late returned resource', async () => {
  await nativeFixture(async (value) => {
    let finish!: (resource: { blob: Blob; dispose: jest.Mock }) => void;
    value.resolve.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const transport = new ExperimentalChromeLocalTransport(options(value));
    const sending = transport.send(request());
    const rejected = expect(sending).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });
    while (!finish) await Promise.resolve();

    await transport.destroy();
    await rejected;
    finish({
      blob: new Blob(['image'], { type: 'image/png' }),
      dispose: value.dispose,
    });
    for (let index = 0; index < 10; index++) await Promise.resolve();

    expect(value.create).not.toHaveBeenCalled();
    expect(value.dispose).toHaveBeenCalledTimes(1);
    expect(value.bitmap.close).not.toHaveBeenCalled();
  });
});

test('isolates overlapping media sessions and releases only the disposed response', async () => {
  await nativeFixture(async (value) => {
    const secondBitmap = { width: 1, height: 1, close: jest.fn() };
    const secondSession = { ...value.session, destroy: jest.fn() };
    value.create
      .mockResolvedValueOnce(value.session)
      .mockResolvedValueOnce(secondSession);
    (
      globalThis as unknown as { createImageBitmap: jest.Mock }
    ).createImageBitmap
      .mockResolvedValueOnce(value.bitmap)
      .mockResolvedValueOnce(secondBitmap);
    const transport = new ExperimentalChromeLocalTransport(options(value));
    const first = await transport.send(request());
    const second = await transport.send(request());

    await first.dispose?.();

    expect(value.create).toHaveBeenCalledTimes(2);
    expect(value.session.destroy).toHaveBeenCalledTimes(1);
    expect(secondSession.destroy).not.toHaveBeenCalled();
    expect(value.bitmap.close).toHaveBeenCalledTimes(1);
    expect(secondBitmap.close).not.toHaveBeenCalled();
    await second.dispose?.();
    expect(secondSession.destroy).toHaveBeenCalledTimes(1);
    expect(secondBitmap.close).toHaveBeenCalledTimes(1);
    expect(value.dispose).toHaveBeenCalledTimes(2);
  });
});

test.each(['downloadable', 'downloading', 'unknown-result'])(
  'does not create a media session for %s without explicit verified support',
  async (availability) => {
    await nativeFixture(async (value) => {
      value.model.availability?.mockResolvedValue(availability);
      const transport = new ExperimentalChromeLocalTransport(options(value));

      await expect(transport.send(request())).rejects.toMatchObject({
        retryable: false,
      });

      expect(value.create).not.toHaveBeenCalled();
      expect(value.bitmap.close).toHaveBeenCalledTimes(1);
      expect(value.dispose).toHaveBeenCalledTimes(1);
    });
  },
);

test('uses declared input languages independently from output language', async () => {
  await nativeFixture(async (value) => {
    const transport = new ExperimentalChromeLocalTransport({
      ...options(value),
      outputLanguage: 'fr',
      media: { ...options(value).media, inputLanguages: ['de'] },
    } as ExperimentalChromeLocalTransportOptions);

    const response = await transport.send(request());

    expect(value.model.availability).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedInputs: [
          { type: 'text', languages: ['de'] },
          { type: 'image' },
        ],
        expectedOutputs: [{ type: 'text', languages: ['fr'] }],
      }),
    );
    await response.dispose?.();
  });
});

test('cancelling pending media session creation cannot reject another active request', async () => {
  await nativeFixture(async (value) => {
    const controller = new AbortController();
    const pending: ((session: typeof value.session) => void)[] = [];
    value.create.mockImplementation(
      (options) =>
        new Promise((resolve, reject) => {
          pending.push(resolve);
          options?.signal?.addEventListener(
            'abort',
            () => reject(new Error('Native create aborted')),
            { once: true },
          );
        }),
    );
    const transport = new ExperimentalChromeLocalTransport(options(value));
    const first = transport.send({ ...request(), signal: controller.signal });
    const rejected = expect(first).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });
    while (pending.length === 0) await Promise.resolve();
    const second = transport.send(request()).then(
      (response) => ({ response, error: undefined }),
      (error: unknown) => ({ response: undefined, error }),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    controller.abort();
    await rejected;
    pending[1]?.(value.session);
    const result = await second;

    expect(result.error).toBeUndefined();
    expect(value.create).toHaveBeenCalledTimes(2);
    await result.response?.dispose?.();
  });
});
