import {
  detectWebLlmSupport,
  experimental_webllm,
  ExperimentalWebLlmLocalTransport,
  type WebLlmCompletionChunk,
  type WebLlmEngine,
} from './experimental-webllm-local-transport';
import { Chat } from '../models';
import { Frame } from '../frames';

const params: Chat.Api.CompletionCreateParams = {
  operation: 'generate',
  model: '' as Chat.Api.CompletionCreateParams['model'],
  system: 'system',
  messages: [{ role: 'user', content: 'Hello' }],
};

function request(signal = new AbortController().signal) {
  return { params, signal, attempt: 1, maxAttempts: 1, requestId: 'test' };
}

async function* chunksOf(...contents: string[]): AsyncIterable<WebLlmCompletionChunk> {
  for (const content of contents) {
    yield { choices: [{ delta: { role: 'assistant', content }, finish_reason: null }] };
  }
}

function fakeEngine(
  stream: AsyncIterable<WebLlmCompletionChunk>,
  overrides: Partial<WebLlmEngine> = {},
): WebLlmEngine & { create: jest.Mock } {
  const create = jest.fn().mockResolvedValue(stream);
  return {
    chat: { completions: { create } },
    interruptGenerate: jest.fn(),
    unload: jest.fn().mockResolvedValue(undefined),
    ...overrides,
    create,
  } as unknown as WebLlmEngine & { create: jest.Mock };
}

async function collect(frames: AsyncGenerator<Frame> | undefined): Promise<Frame[]> {
  const out: Frame[] = [];
  if (frames) {
    for await (const frame of frames) out.push(frame);
  }
  return out;
}

test('streams generation-chunk frames then generation-finish from the engine', async () => {
  const engine = fakeEngine(chunksOf('Hello', ' world'));
  const transport = new ExperimentalWebLlmLocalTransport({ engine });

  const response = await transport.send(request());
  const frames = await collect(response.frames);

  expect(engine.create).toHaveBeenCalledTimes(1);
  const chunkFrames = frames.filter((f) => f.type === 'generation-chunk');
  expect(chunkFrames).toHaveLength(2);
  expect(frames.at(-1)?.type).toBe('generation-finish');
  const first = chunkFrames[0] as Extract<Frame, { type: 'generation-chunk' }>;
  expect(first.chunk.choices[0].delta.content).toBe('Hello');
});

test('forwards system + user messages and responseFormat as response_format', async () => {
  const engine = fakeEngine(chunksOf('ok'));
  const transport = new ExperimentalWebLlmLocalTransport({ engine });

  await collect(
    (
      await transport.send({
        ...request(),
        params: { ...params, responseFormat: { title: { type: 'string' } } },
      })
    ).frames,
  );

  const callArgs = engine.create.mock.calls[0][0];
  expect(callArgs.stream).toBe(true);
  expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'system' });
  expect(callArgs.messages[1]).toEqual({ role: 'user', content: 'Hello' });
  // Bare JSON schema gets wrapped into an OpenAI-compatible json_schema format.
  expect(callArgs.response_format.type).toBe('json_schema');
});

test('aborts mid-stream with a WEBLLM_ABORTED TransportError', async () => {
  const controller = new AbortController();
  const engine = fakeEngine(
    (async function* () {
      yield { choices: [{ delta: { content: 'partial' }, finish_reason: null }] };
      controller.abort();
      yield { choices: [{ delta: { content: 'never' }, finish_reason: null }] };
    })(),
  );
  const transport = new ExperimentalWebLlmLocalTransport({ engine });
  const response = await transport.send(request(controller.signal));

  await expect(collect(response.frames)).rejects.toMatchObject({
    code: 'WEBLLM_ABORTED',
  });
  expect(engine.interruptGenerate).toHaveBeenCalled();
});

test('surfaces engine errors as a TransportError', async () => {
  const create = jest.fn().mockRejectedValue(new Error('webgpu exploded'));
  const engine = { chat: { completions: { create } } } as unknown as WebLlmEngine;
  const transport = new ExperimentalWebLlmLocalTransport({ engine });

  await expect(collect((await transport.send(request())).frames)).rejects.toMatchObject({
    code: 'WEBLLM_ENGINE_ERROR',
  });
});

test('uses an injected createEngine and reports download progress + state', async () => {
  const states: string[] = [];
  const progress: number[] = [];
  const createEngine = jest.fn(async (_model, opts) => {
    opts.initProgressCallback?.({ progress: 0.5, text: 'loading' });
    return fakeEngine(chunksOf('hi'));
  });
  const transport = new ExperimentalWebLlmLocalTransport({
    model: 'Custom-Model-MLC',
    createEngine,
    events: {
      engineState: (s) => states.push(s),
      downloadProgress: (p) => progress.push(p),
    },
  });

  await collect((await transport.send(request())).frames);

  expect(createEngine).toHaveBeenCalledWith('Custom-Model-MLC', expect.any(Object));
  expect(states).toContain('loading');
  expect(states).toContain('ready');
  expect(progress).toContain(50);
});

describe('detectWebLlmSupport', () => {
  const originalNavigator = globalThis.navigator;
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  test('ok when WebGPU is present', async () => {
    (globalThis as { window?: unknown }).window = {};
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: {} },
      configurable: true,
    });
    await expect(detectWebLlmSupport()).resolves.toEqual({ ok: true });
  });

  test('PLATFORM_UNSUPPORTED when WebGPU is absent', async () => {
    (globalThis as { window?: unknown }).window = {};
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });
    await expect(detectWebLlmSupport()).resolves.toMatchObject({
      ok: false,
      code: 'PLATFORM_UNSUPPORTED',
    });
  });
});

test('experimental_webllm model spec advertises ui + structured, not tools', () => {
  const spec = experimental_webllm()({});
  expect(spec.name).toBe('webllm-local');
  expect(spec.capabilities).toMatchObject({ ui: true, structured: true, tools: false });
  expect(typeof spec.detect).toBe('function');
});
