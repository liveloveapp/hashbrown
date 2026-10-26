import type { AGUIEvent, ImagePart, Message } from '@ag-ui/core';
import {
  experimental_webllm,
  type WebLlmImageContent,
  type WebLlmImageMediaOptions,
  type WebLlmRequest,
} from './experimental-webllm-transport';
import type { TransportRequest } from './transport';

function request(
  messages: Message[],
  signal = new AbortController().signal,
): TransportRequest {
  return {
    input: {
      threadId: 'thread',
      runId: 'run',
      tools: [],
      context: [],
      state: {},
      messages,
    },
    signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'request',
  };
}
function image(
  value = 'private-source',
  type: 'url' | 'data' | 'file' = 'url',
): ImagePart {
  return { type: 'image', source: { type, value, mimeType: 'image/png' } };
}
function user(content: Message['content']): Message {
  return { id: 'user', role: 'user', content } as Message;
}
function engine() {
  return {
    chat: {
      completions: {
        create: jest.fn(async function* (
          _input: WebLlmRequest<WebLlmImageContent>,
        ) {
          void _input;
          yield { choices: [{ delta: { content: 'answer' } }] };
        }),
      },
    },
    interruptGenerate: jest.fn(),
    unload: jest.fn(),
    resetChat: jest.fn(),
  };
}
async function collect(events: AsyncIterable<AGUIEvent>) {
  const output: AGUIEvent[] = [];
  for await (const event of events) output.push(event);
  return output;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function decoded(
  run: (decode: jest.Mock, close: jest.Mock) => Promise<void>,
  dimensions = { width: 2, height: 3 },
) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  const close = jest.fn();
  const decode = jest.fn(async () => ({ ...dimensions, close }));
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: decode,
  });
  try {
    await run(decode, close);
  } finally {
    if (old) Object.defineProperty(globalThis, 'createImageBitmap', old);
    else Reflect.deleteProperty(globalThis, 'createImageBitmap');
  }
}
function media(overrides: Partial<WebLlmImageMediaOptions> = {}) {
  const dispose = jest.fn();
  const resolve = jest.fn(() => ({
    blob: new Blob(['resolved'], { type: 'image/png' }),
    dispose,
  }));
  return { images: {}, resolve, ...overrides };
}

test('maps resolved images before exactly joined trailing text across history without source passthrough', async () => {
  await decoded(async (decode, close) => {
    const injected = engine();
    const options = media();
    const input = request([
      { id: 'system', role: 'system', content: 'Rules' },
      user([
        image('secret-url'),
        image('secret-file', 'file'),
        { type: 'text', text: ' a ' },
        { type: 'text', text: '\nb' },
      ]),
      { id: 'assistant', role: 'assistant', content: 'Previous' },
      user([image('eA==', 'data')]),
    ]);

    const response = await experimental_webllm({
      engine: injected,
      media: options,
    })().send(input);
    await collect(response.events);

    const url = 'data:image/png;base64,cmVzb2x2ZWQ=';
    expect(injected.chat.completions.create).toHaveBeenCalledWith({
      stream: true,
      messages: [
        { role: 'system', content: 'Rules' },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url } },
            { type: 'image_url', image_url: { url } },
            { type: 'text', text: ' a \nb' },
          ],
        },
        { role: 'assistant', content: 'Previous' },
        { role: 'user', content: [{ type: 'image_url', image_url: { url } }] },
      ],
    });
    expect(options.resolve).toHaveBeenCalledTimes(3);
    expect(decode).toHaveBeenCalledTimes(3);
    expect(close).toHaveBeenCalledTimes(3);
    expect(injected.unload).not.toHaveBeenCalled();
    expect(injected.resetChat).not.toHaveBeenCalled();
  });
});

test('normalizes text-only user arrays only when images are explicitly enabled', async () => {
  const injected = engine();
  const options = media();

  const response = await experimental_webllm({
    engine: injected,
    media: options,
  })().send(
    request([
      user([
        { type: 'text', text: 'one ' },
        { type: 'text', text: 'two' },
      ]),
    ]),
  );
  await collect(response.events);

  expect(injected.chat.completions.create.mock.calls[0][0].messages).toEqual([
    { role: 'user', content: 'one two' },
  ]);
  expect(options.resolve).not.toHaveBeenCalled();
});

for (const [name, content, code] of [
  ['empty arrays', [], 'INVALID_MEDIA'],
  [
    'text before image',
    [{ type: 'text', text: 'hello' }, image()],
    'FEATURE_UNSUPPORTED',
  ],
  [
    'empty text before image',
    [{ type: 'text', text: '' }, image()],
    'FEATURE_UNSUPPORTED',
  ],
  [
    'interleaving',
    [image(), { type: 'text', text: 'hello' }, image()],
    'FEATURE_UNSUPPORTED',
  ],
  [
    'audio',
    [{ type: 'audio', source: { type: 'url', value: 'x' } }],
    'FEATURE_UNSUPPORTED',
  ],
  [
    'video',
    [{ type: 'video', source: { type: 'url', value: 'x' } }],
    'FEATURE_UNSUPPORTED',
  ],
  ['unknown parts', [{ type: 'unknown' }], 'FEATURE_UNSUPPORTED'],
  ['malformed text', [{ type: 'text', text: 42 }], 'INVALID_MEDIA'],
  ['empty source', [image('')], 'INVALID_MEDIA'],
  [
    'invalid source',
    [{ type: 'image', source: { type: 'other', value: 'x' } }],
    'INVALID_MEDIA',
  ],
  ['invalid raw base64', [image('xx', 'data')], 'INVALID_MEDIA'],
  [
    'data URL source',
    [image('data:image/png;base64,eA==', 'data')],
    'INVALID_MEDIA',
  ],
  [
    'unsupported MIME',
    [
      {
        type: 'image',
        source: { type: 'url', value: 'x', mimeType: 'image/gif' },
      },
    ],
    'FEATURE_UNSUPPORTED',
  ],
] as const) {
  test(`preflights complete history before acquiring resources: ${name}`, async () => {
    const injected = engine();
    const options = media();
    const later = user(content as unknown as Message['content']);

    const sent = experimental_webllm({
      engine: injected,
      media: options,
    })().send(request([user([image()]), later]));

    await expect(sent).rejects.toMatchObject({ code, retryable: false });
    expect(options.resolve).not.toHaveBeenCalled();
    expect(injected.chat.completions.create).not.toHaveBeenCalled();
  });
}

for (const role of ['assistant', 'system', 'developer'] as const) {
  test(`rejects ${role} arrays before resolving preceding images`, async () => {
    const options = media();
    const injected = engine();
    const invalid = {
      id: 'bad',
      role,
      content: [image()],
    } as unknown as Message;

    const sent = experimental_webllm({
      engine: injected,
      media: options,
    })().send(request([user([image()]), invalid]));

    await expect(sent).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });
    expect(options.resolve).not.toHaveBeenCalled();
  });
}

for (const bound of [
  'maxBytes',
  'maxPixels',
  'maxImages',
  'maxTotalBytes',
] as const) {
  for (const value of [
    null as unknown as number,
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    test(`rejects invalid ${bound} ${value} before resolution`, async () => {
      const options = media(
        bound === 'maxTotalBytes'
          ? { maxTotalBytes: value }
          : { images: { [bound]: value } },
      );
      const injected = engine();

      const sent = experimental_webllm({
        engine: injected,
        media: options,
      })().send(request([user([image()])]));

      await expect(sent).rejects.toMatchObject({ code: 'INVALID_MEDIA' });
      expect(options.resolve).not.toHaveBeenCalled();
    });
  }
}

test('counts repeated historical images before any resolver call', async () => {
  const injected = engine();
  const options = media();

  const sent = experimental_webllm({ engine: injected, media: options })().send(
    request(Array.from({ length: 9 }, () => user([image()]))),
  );

  await expect(sent).rejects.toMatchObject({ code: 'INVALID_MEDIA' });
  expect(options.resolve).not.toHaveBeenCalled();
});

for (const [name, blob, code] of [
  ['empty', new Blob([], { type: 'image/png' }), 'INVALID_MEDIA'],
  [
    'unsupported',
    new Blob(['x'], { type: 'image/gif' }),
    'FEATURE_UNSUPPORTED',
  ],
  ['mismatch', new Blob(['x'], { type: 'image/jpeg' }), 'INVALID_MEDIA'],
  ['invalid', {}, 'INVALID_MEDIA'],
] as const) {
  test(`rejects ${name} resolved blobs and disposes the resource`, async () => {
    const dispose = jest.fn();
    const injected = engine();
    const options = media({ resolve: () => ({ blob: blob as Blob, dispose }) });

    const response = await experimental_webllm({
      engine: injected,
      media: options,
    })().send(request([user([image()])]));
    const result = collect(response.events);

    await expect(result).rejects.toMatchObject({ code });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(injected.chat.completions.create).not.toHaveBeenCalled();
  });
}

test('checks bytes and complete-history bytes before reading or decoding excess blobs', async () => {
  await decoded(async (decode) => {
    const injected = engine();
    const blob = new Blob(['1234'], { type: 'image/png' });
    const read = jest.spyOn(blob, 'arrayBuffer');
    const dispose = jest.fn();
    const options = media({
      images: { maxBytes: 3 },
      resolve: () => ({ blob, dispose }),
    });
    const transport = experimental_webllm({
      engine: injected,
      media: options,
    })();

    const first = await transport.send(request([user([image()])]));
    await expect(collect(first.events)).rejects.toMatchObject({
      code: 'INVALID_MEDIA',
    });
    const total = await experimental_webllm({
      engine: injected,
      media: { ...options, images: {}, maxTotalBytes: 6 },
    })().send(request([user([image(), image()])]));
    await expect(collect(total.events)).rejects.toMatchObject({
      code: 'INVALID_MEDIA',
    });

    expect(read).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(3);
    expect(injected.chat.completions.create).not.toHaveBeenCalled();
  });
});

for (const dimensions of [
  { width: 0, height: 1 },
  { width: 1.5, height: 2 },
  { width: 4001, height: 4000 },
  { width: Number.MAX_SAFE_INTEGER, height: 2 },
]) {
  test(`rejects invalid decoded dimensions ${dimensions.width}x${dimensions.height} and closes bitmap`, async () => {
    await decoded(async (_decode, close) => {
      const injected = engine();
      const options = media();

      const response = await experimental_webllm({
        engine: injected,
        media: options,
      })().send(request([user([image()])]));

      await expect(collect(response.events)).rejects.toMatchObject({
        code: 'INVALID_MEDIA',
      });
      expect(close).toHaveBeenCalledTimes(1);
      expect(injected.chat.completions.create).not.toHaveBeenCalled();
    }, dimensions);
  });
}

test('reports rejected image decoding and does not read bytes or generate', async () => {
  await decoded(async (decode) => {
    decode.mockRejectedValue(new Error('broken image'));
    const blob = new Blob(['x'], { type: 'image/png' });
    const read = jest.spyOn(blob, 'arrayBuffer');
    const injected = engine();

    const response = await experimental_webllm({
      engine: injected,
      media: media({ resolve: () => ({ blob }) }),
    })().send(request([user([image()])]));

    await expect(collect(response.events)).rejects.toMatchObject({
      code: 'INVALID_MEDIA',
    });
    expect(read).not.toHaveBeenCalled();
    expect(injected.chat.completions.create).not.toHaveBeenCalled();
  });
});

for (const phase of ['resolve', 'decode', 'read'] as const) {
  for (const cancellation of ['abort', 'dispose'] as const) {
    test(`cancels pending ${phase} via ${cancellation}, releases ownership and cleans late acquisition once`, async () => {
      await decoded(async (decode, close) => {
        const entered = deferred<void>();
        const late = deferred<void>();
        const dispose = jest.fn(async () => {
          throw new Error('cleanup failure is contained');
        });
        const controller = new AbortController();
        const injected = engine();
        const blob = new Blob(['resolved'], { type: 'image/png' });
        if (phase === 'decode')
          decode.mockImplementation(async () => {
            entered.resolve();
            await late.promise;
            return { width: 2, height: 3, close };
          });
        if (phase === 'read')
          jest.spyOn(blob, 'arrayBuffer').mockImplementation(async () => {
            entered.resolve();
            await late.promise;
            return new TextEncoder().encode('resolved').buffer;
          });
        const resolve = jest.fn(async () => {
          if (phase === 'resolve') {
            entered.resolve();
            await late.promise;
          }
          return { blob, dispose };
        });
        const transport = experimental_webllm({
          engine: injected,
          media: { images: {}, resolve },
        })();
        const response = await transport.send(
          request([user([image()])], controller.signal),
        );
        const collecting = collect(response.events);
        await entered.promise;

        await expect(
          experimental_webllm({ engine: injected })().send(
            request([user('overlap')]),
          ),
        ).rejects.toMatchObject({ code: 'MODEL_BUSY' });
        if (cancellation === 'abort') controller.abort();
        else await response.dispose?.();
        await expect(collecting).rejects.toMatchObject({
          code: 'PROMPT_API_ABORTED',
        });
        const reused = await experimental_webllm({ engine: injected })().send(
          request([user('reuse')]),
        );
        await collect(reused.events);
        late.resolve();
        await new Promise<void>((resolve) => setImmediate(resolve));
        await response.dispose?.();

        expect(injected.chat.completions.create).toHaveBeenCalledTimes(1);
        expect(injected.interruptGenerate).not.toHaveBeenCalled();
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledTimes(phase === 'resolve' ? 0 : 1);
      });
    });
  }
}

test('releases preceding resources and engine ownership after a later resolver fails synchronously', async () => {
  await decoded(async () => {
    const dispose = jest.fn();
    const injected = engine();
    let calls = 0;
    const resolve = jest.fn(() => {
      if (++calls === 2) throw new Error('application refusal');
      return { blob: new Blob(['x'], { type: 'image/png' }), dispose };
    });
    const transport = experimental_webllm({
      engine: injected,
      media: { images: {}, resolve },
    })();

    const response = await transport.send(request([user([image(), image()])]));
    await expect(collect(response.events)).rejects.toThrow(
      'application refusal',
    );
    const reused = await experimental_webllm({ engine: injected })().send(
      request([user('reuse')]),
    );
    await collect(reused.events);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(injected.chat.completions.create).toHaveBeenCalledTimes(1);
    expect(injected.interruptGenerate).not.toHaveBeenCalled();
  });
});

test('canonicalizes supported MIME without fetching source URLs or forwarding extra image fields', async () => {
  await decoded(async () => {
    const fetch = jest.spyOn(globalThis, 'fetch');
    const injected = engine();
    const dispose = jest.fn();
    const part: ImagePart = {
      type: 'image',
      source: {
        type: 'url',
        value: 'https://private.invalid/image',
        mimeType: 'IMAGE/WEBP',
      },
    };
    const resolve = () => ({
      blob: new Blob(['webp'], { type: 'image/webp;parameter=value' }),
      dispose,
    });
    try {
      const response = await experimental_webllm({
        engine: injected,
        media: { images: {}, resolve },
      })().send(request([user([part])]));
      await collect(response.events);

      expect(
        injected.chat.completions.create.mock.calls[0][0].messages,
      ).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'data:image/webp;base64,d2VicA==' },
            },
          ],
        },
      ]);
      expect(fetch).not.toHaveBeenCalled();
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      fetch.mockRestore();
    }
  });
});

test('keeps image resources and ownership through pending worker creation and iterator drain', async () => {
  await decoded(async () => {
    const created = deferred<void>();
    const setup =
      deferred<
        AsyncIterable<import('./experimental-webllm-transport').WebLlmChunk>
      >();
    const drain =
      deferred<
        IteratorResult<import('./experimental-webllm-transport').WebLlmChunk>
      >();
    const dispose = jest.fn();
    const injected = {
      chat: {
        completions: {
          create: jest.fn((_request: WebLlmRequest<WebLlmImageContent>) => {
            void _request;
            created.resolve();
            return setup.promise;
          }),
        },
      },
      interruptGenerate: jest.fn(),
    };
    const controller = new AbortController();
    const transport = experimental_webllm({
      engine: injected,
      media: media({
        resolve: () => ({
          blob: new Blob(['x'], { type: 'image/png' }),
          dispose,
        }),
      }),
    })();
    const response = await transport.send(
      request([user([image()])], controller.signal),
    );
    const collecting = collect(response.events);
    await created.promise;

    controller.abort();
    await expect(collecting).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
    });
    await expect(transport.send(request([user('busy')]))).rejects.toMatchObject(
      { code: 'MODEL_BUSY' },
    );
    setup.resolve({
      [Symbol.asyncIterator]: () => ({ next: () => drain.promise }),
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(dispose).not.toHaveBeenCalled();
    await expect(
      transport.send(request([user('still busy')])),
    ).rejects.toMatchObject({ code: 'MODEL_BUSY' });
    drain.resolve({ done: true, value: undefined });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const reused = await transport.send(request([user('available')]));
    await reused.dispose?.();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(injected.interruptGenerate).toHaveBeenCalledTimes(1);
  });
});

test('retains the missing-input TransportError before image preflight', async () => {
  const injected = engine();
  const input = {
    ...request([]),
    input: undefined,
  } as unknown as TransportRequest;

  const sent = experimental_webllm({ engine: injected, media: media() })().send(
    input,
  );

  await expect(sent).rejects.toMatchObject({
    name: 'TransportError',
    retryable: false,
  });
});

test('retains the default text request snapshot captured synchronously by send', async () => {
  const injected = engine();
  const schema = { type: 'object', properties: { answer: { type: 'string' } } };
  const input = request([
    { id: 'system', role: 'system', content: 'Original rules' },
    user('original'),
  ]);
  input.input.forwardedProps = { hashbrown: { responseSchema: schema } };
  const sent = experimental_webllm({ engine: injected })().send(input);
  input.input.messages = [user('later mutation')];
  input.input.tools = [
    { name: 'later_tool', description: 'changed', parameters: {} },
  ];
  schema.properties.answer.type = 'number';

  const response = await sent;
  await collect(response.events);

  expect(injected.chat.completions.create.mock.calls[0][0]).toMatchObject({
    messages: [
      { role: 'system', content: 'Original rules' },
      { role: 'user', content: 'original' },
    ],
    response_format: {
      type: 'json_object',
      schema: '{"type":"object","properties":{"answer":{"type":"string"}}}',
    },
  });
});

test('a late cancelled preparation cannot release a newer generation engine lock', async () => {
  const acquired = deferred<void>();
  const late =
    deferred<import('./experimental-webllm-transport').WebLlmImageResource>();
  const generated = deferred<void>();
  const drain =
    deferred<
      IteratorResult<import('./experimental-webllm-transport').WebLlmChunk>
    >();
  const dispose = jest.fn();
  const injected = {
    chat: {
      completions: {
        create: jest.fn((_request: WebLlmRequest<WebLlmImageContent>) => {
          void _request;
          generated.resolve();
          return {
            [Symbol.asyncIterator]: () => ({ next: () => drain.promise }),
          };
        }),
      },
    },
    interruptGenerate: jest.fn(),
  };
  const controller = new AbortController();
  const options = media({
    resolve: () => {
      acquired.resolve();
      return late.promise;
    },
  });
  const first = await experimental_webllm({
    engine: injected,
    media: options,
  })().send(request([user([image()])], controller.signal));
  const firstResult = collect(first.events);
  await acquired.promise;
  controller.abort();
  await expect(firstResult).rejects.toMatchObject({
    code: 'PROMPT_API_ABORTED',
  });
  const secondTransport = experimental_webllm({ engine: injected })();
  const second = await secondTransport.send(request([user('second')]));
  const secondResult = collect(second.events);
  await generated.promise;

  late.resolve({ blob: new Blob(['late'], { type: 'image/png' }), dispose });
  await new Promise<void>((resolve) => setImmediate(resolve));
  await expect(
    secondTransport.send(request([user('third')])),
  ).rejects.toMatchObject({ code: 'MODEL_BUSY' });
  drain.resolve({ done: true, value: undefined });
  await secondResult;

  expect(dispose).toHaveBeenCalledTimes(1);
  expect(injected.interruptGenerate).not.toHaveBeenCalled();
});

test('retains image history and schema preflight snapshots through asynchronous resolution', async () => {
  await decoded(async () => {
    const injected = engine();
    const part = image('original-source');
    const input = request([
      { id: 'system', role: 'system', content: 'Original rules' },
      user([part, { type: 'text', text: 'original text' }]),
    ]);
    input.input.forwardedProps = {
      hashbrown: { responseSchema: { type: 'string' } },
    };
    const resolve = jest.fn((part: ImagePart) => {
      expect(part.source.value).toBe('original-source');
      return { blob: new Blob(['x'], { type: 'image/png' }) };
    });
    const sent = experimental_webllm({
      engine: injected,
      media: { images: {}, resolve },
    })().send(input);
    part.source.value = 'mutated source';
    input.input.messages = [user('mutated text')];
    input.input.forwardedProps = {
      hashbrown: { responseSchema: { type: 'number' } },
    };
    input.input.tools = [
      { name: 'later', description: 'later', parameters: {} },
    ];

    const response = await sent;
    await collect(response.events);

    expect(injected.chat.completions.create.mock.calls[0][0]).toMatchObject({
      messages: [
        { role: 'system', content: 'Original rules' },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,eA==' },
            },
            { type: 'text', text: 'original text' },
          ],
        },
      ],
      response_format: { schema: '{"type":"string"}' },
    });
  });
});

test('counts repeated message references as separate resolved image occurrences for total bytes', async () => {
  await decoded(async () => {
    const injected = engine();
    const repeated = user([image()]);
    const dispose = jest.fn();
    const resolve = jest.fn(() => ({
      blob: new Blob(['1234'], { type: 'image/png' }),
      dispose,
    }));

    const response = await experimental_webllm({
      engine: injected,
      media: { images: {}, maxTotalBytes: 6, resolve },
    })().send(request([repeated, repeated]));

    await expect(collect(response.events)).rejects.toMatchObject({
      code: 'INVALID_MEDIA',
    });
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(injected.chat.completions.create).not.toHaveBeenCalled();
  });
});

test('preserves independently resolved bytes for repeated message references in occurrence order', async () => {
  await decoded(async () => {
    const injected = engine();
    const repeated = user([image()]);
    let calls = 0;
    const dispose = jest.fn();
    const resolve = jest.fn(() => ({
      blob: new Blob([++calls === 1 ? 'one' : 'two'], { type: 'image/png' }),
      dispose,
    }));

    const response = await experimental_webllm({
      engine: injected,
      media: { images: {}, resolve },
    })().send(request([repeated, repeated]));
    await collect(response.events);

    expect(injected.chat.completions.create.mock.calls[0][0].messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,b25l' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,dHdv' },
          },
        ],
      },
    ]);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledTimes(2);
  });
});
