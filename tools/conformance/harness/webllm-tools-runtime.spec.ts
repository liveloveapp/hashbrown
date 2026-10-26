import {
  captureWebLlmToolsRequest,
  disposeWebLlmWorker,
} from '../local-models/webllm-runtime';

test('tools evidence clones full text request including schema and application settings', () => {
  const request = {
    stream: true as const,
    messages: [{ role: 'user' as const, content: 'private marker' }],
    response_format: {
      type: 'json_object' as const,
      schema: '{"type":"object"}',
    },
  };

  const evidence = captureWebLlmToolsRequest(request, 256);
  request.messages[0].content = 'changed';

  expect(evidence).toEqual({
    request: {
      ...request,
      messages: [{ role: 'user', content: 'private marker' }],
      max_tokens: 256,
      temperature: 0,
      seed: 1,
    },
    responseText: '',
    chunks: [],
  });
});

test('tools evidence refuses media without serializing image data', () => {
  const request = {
    stream: true as const,
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'image_url' as const,
            image_url: { url: 'data:image/png;base64,c2VjcmV0' },
          },
        ],
      },
    ],
  };

  expect(() => captureWebLlmToolsRequest(request, 256)).toThrow('text');
});

test('worker cleanup interrupts and drains before unloading and releases worker resources', async () => {
  const events: string[] = [];
  let drain!: () => void;
  const pending = new Promise<void>((resolve) => {
    drain = resolve;
  });
  const engine = {
    interruptGenerate: () => {
      events.push('interrupt');
    },
    unload: async () => {
      events.push('unload');
    },
  };

  const disposal = disposeWebLlmWorker({
    ready: Promise.resolve(engine),
    pending: new Set([pending]),
    drain: true,
    timeoutMs: 1000,
    unloaded: () => {
      events.push('unloaded');
    },
    terminate: () => {
      events.push('terminate');
    },
    revoke: () => {
      events.push('revoke');
    },
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(events).toEqual(['interrupt']);
  drain();
  await disposal;

  expect(events).toEqual([
    'interrupt',
    'unload',
    'unloaded',
    'terminate',
    'revoke',
  ]);
});

for (const failure of ['load', 'unload']) {
  test(`worker cleanup releases resources after ${failure} fails`, async () => {
    const events: string[] = [];
    const engine = {
      interruptGenerate: () => undefined,
      unload: async () => {
        throw new Error('unload');
      },
    };
    const ready =
      failure === 'load'
        ? Promise.reject(new Error('load'))
        : Promise.resolve(engine);

    await expect(
      disposeWebLlmWorker({
        ready,
        pending: new Set(),
        drain: true,
        timeoutMs: 1000,
        unloaded: () => {
          events.push('unloaded');
        },
        terminate: () => {
          events.push('terminate');
        },
        revoke: () => {
          events.push('revoke');
        },
      }),
    ).rejects.toThrow(failure);

    expect(events).toEqual(['terminate', 'revoke']);
  });
}

test('installed tools worker separates full evidence from metadata and owns final cleanup', async () => {
  const { installWebLlmWorker } =
    await import('../local-models/webllm-runtime');
  const events: string[] = [];
  const engine = {
    chat: {
      completions: {
        create: async function* () {
          yield {
            choices: [
              {
                delta: { content: '{"record":"alpha"}' },
                finish_reason: 'stop',
              },
            ],
          };
        },
      },
    },
    interruptGenerate: () => {
      events.push('interrupt');
    },
    unload: async () => {
      events.push('unload');
    },
  };
  const originalFunction = globalThis.Function;
  const functionSpy = jest
    .spyOn(globalThis, 'Function')
    .mockImplementation((...args: string[]) => {
      if (args[1] === 'return import(url)')
        return async () => ({
          CreateWebWorkerMLCEngine: async () => engine,
          prebuiltAppConfig: { model_list: [] },
        });
      return originalFunction(...args);
    });
  const workerDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'Worker',
  );
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  );
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    value: class {
      terminate() {
        events.push('terminate');
      }
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'test', hardwareConcurrency: 1 },
  });
  const createUrl = jest
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:test');
  const revokeUrl = jest
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {
      events.push('revoke');
    });
  const runtime = globalThis as unknown as {
    __hashbrownWebLlm: {
      chat: {
        completions: { create(request: object): AsyncIterable<unknown> };
      };
    };
    __localWebLlmMetrics: {
      requests: object[];
      activeRequests: number;
      unloaded: boolean;
      workerTerminated: boolean;
    };
    __localWebLlmToolsEvidence: {
      request: object;
      responseText: string;
      chunks: unknown[];
    }[];
    __localWebLlmVisionEvidence: unknown[];
    __localWebLlmDispose(): Promise<void>;
  };
  const page = {
    addInitScript: async (callback: (args: unknown) => void, args: unknown) =>
      callback(args),
  };
  try {
    await installWebLlmWorker(
      page as never,
      'http://fixture/webllm.js',
      'test-model',
      { toolsEvidence: true },
    );
    const request = {
      stream: true,
      messages: [{ role: 'user', content: 'private prompt' }],
      response_format: { type: 'json_object', schema: 'private schema' },
    };

    for await (const chunk of runtime.__hashbrownWebLlm.chat.completions.create(
      request,
    ))
      expect(chunk).toBeDefined();
    await runtime.__localWebLlmDispose();
    await runtime.__localWebLlmDispose();

    expect(runtime.__localWebLlmToolsEvidence).toEqual([
      {
        request: { ...request, max_tokens: 256, temperature: 0, seed: 1 },
        responseText: '{"record":"alpha"}',
        chunks: [
          {
            choices: [
              {
                delta: { content: '{"record":"alpha"}' },
                finish_reason: 'stop',
              },
            ],
          },
        ],
      },
    ]);
    expect(runtime.__localWebLlmVisionEvidence).toEqual([]);
    expect(JSON.stringify(runtime.__localWebLlmMetrics)).not.toMatch(
      /private prompt|private schema|alpha/,
    );
    expect(runtime.__localWebLlmMetrics).toMatchObject({
      activeRequests: 0,
      loadedEngines: 1,
      unloaded: true,
      workerTerminated: true,
      workerUrlRevoked: true,
      requests: [{ drained: true, finishReason: 'stop', maxTokens: 256 }],
    });
    expect(events).toEqual(['unload', 'terminate', 'revoke']);
  } finally {
    functionSpy.mockRestore();
    createUrl.mockRestore();
    revokeUrl.mockRestore();
    if (workerDescriptor)
      Object.defineProperty(globalThis, 'Worker', workerDescriptor);
    else Reflect.deleteProperty(globalThis, 'Worker');
    if (navigatorDescriptor)
      Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('worker cleanup timeout still terminates and revokes without claiming unload', async () => {
  const events: string[] = [];

  await expect(
    disposeWebLlmWorker({
      ready: new Promise(() => undefined),
      pending: new Set(),
      drain: true,
      timeoutMs: 1,
      unloaded: () => {
        events.push('unloaded');
      },
      terminate: () => {
        events.push('terminate');
      },
      revoke: () => {
        events.push('revoke');
      },
    }),
  ).rejects.toThrow('timed out');

  expect(events).toEqual(['terminate', 'revoke']);
});

for (const maxTokens of ['0', '2049', '1.5', 'NaN']) {
  test(`worker refuses invalid application max_tokens ${maxTokens} before browser initialization`, async () => {
    const { installWebLlmWorker } =
      await import('../local-models/webllm-runtime');
    const original = process.env['WEBLLM_MAX_TOKENS'];
    process.env['WEBLLM_MAX_TOKENS'] = maxTokens;
    const addInitScript = jest.fn();
    try {
      await expect(
        installWebLlmWorker({ addInitScript } as never, 'fixture', 'model', {
          toolsEvidence: true,
        }),
      ).rejects.toThrow('1 to 2048');

      expect(addInitScript).not.toHaveBeenCalled();
    } finally {
      if (original === undefined) delete process.env['WEBLLM_MAX_TOKENS'];
      else process.env['WEBLLM_MAX_TOKENS'] = original;
    }
  });
}
