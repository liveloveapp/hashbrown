import { Frame } from '../frames';
import { Chat } from '../models';
import type { RunAgentInput } from '@ag-ui/core';
import { TransportError } from './transport-error';
import {
  ModelResolver,
  type ModelSpec,
  type RequestedFeatures,
} from './model-spec';

const noopFrames = async function* (): AsyncGenerator<Frame> {
  yield { type: 'generation-finish' };
};

const features: RequestedFeatures = {
  tools: true,
  structured: false,
  ui: false,
  threads: false,
};

const input: RunAgentInput = {
  threadId: 'thread-1',
  runId: 'run-1',
  messages: [],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
};

const params: Chat.Api.CompletionCreateParams = {
  operation: 'generate',
  model: '' as Chat.Api.CompletionCreateParams['model'],
  system: '',
  messages: [],
};

function createSseResponse(): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    },
  );
}

test('skips specs without required capabilities', async () => {
  const ineligibleSpec: ModelSpec = {
    name: 'no-tools',
    capabilities: { tools: false },
    transport: {
      name: 'noop',
      send: jest.fn(async () => ({ frames: noopFrames() })),
    },
  };

  const eligibleSpec: ModelSpec = {
    name: 'eligible',
    capabilities: { tools: true },
    transport: {
      name: 'ok',
      send: jest.fn(async () => ({ frames: noopFrames() })),
    },
  };

  const resolver = new ModelResolver([ineligibleSpec, eligibleSpec], {});

  const selection = await resolver.select(features);

  expect(selection?.spec.name).toBe('eligible');
  expect(selection?.metadata.skippedSpecs).toEqual([
    expect.objectContaining({
      name: 'no-tools',
      reason: 'FEATURE_UNSUPPORTED',
    }),
  ]);
});

test('advances after PLATFORM_UNSUPPORTED errors', async () => {
  const failingSpec: ModelSpec = {
    name: 'platform-unavailable',
    capabilities: { tools: true },
    transport: {
      name: 'fail',
      send: jest.fn(async () => {
        throw new TransportError('Missing API', {
          retryable: false,
          code: 'PLATFORM_UNSUPPORTED',
        });
      }),
    },
  };

  const succeedingSpec: ModelSpec = {
    name: 'fallback',
    capabilities: { tools: true },
    transport: {
      name: 'ok',
      send: jest.fn(async () => ({ frames: noopFrames() })),
    },
  };

  const resolver = new ModelResolver([failingSpec, succeedingSpec], {});

  const first = await resolver.select(features);

  expect(first?.spec.name).toBe('platform-unavailable');

  if (first) {
    try {
      await first.transport.send({
        params,
        signal: new AbortController().signal,
        attempt: 1,
        maxAttempts: 1,
        requestId: 'test',
      });
    } catch (err) {
      resolver.skipFromError(first.spec, err);
    }
  }

  const selection = await resolver.select(features);
  expect(selection?.spec.name).toBe('fallback');
});

test.each([undefined, '', ' \n '])(
  'default string models use /run for a missing or blank API URL',
  async (url) => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >(async () => createSseResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const resolver = new ModelResolver('test-model', { url });
      const selection = await resolver.select(features);

      const response = await selection?.transport.send({
        input,
        params,
        signal: new AbortController().signal,
        attempt: 1,
        maxAttempts: 1,
        requestId: 'test-request',
      });
      await response?.dispose?.();

      expect(selection?.spec.name).toBe('test-model');
      expect(fetchMock).toHaveBeenCalledWith('/run', expect.any(Object));
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

test('default string models preserve a non-whitespace API URL exactly', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () => createSseResponse(),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  const endpoint = '  https://example.com/custom-run?x=1  ';

  try {
    const resolver = new ModelResolver('test-model', { url: endpoint });
    const selection = await resolver.select(features);

    const response = await selection?.transport.send({
      input,
      params,
      signal: new AbortController().signal,
      attempt: 1,
      maxAttempts: 1,
      requestId: 'test-request',
    });
    await response?.dispose?.();

    expect(fetchMock).toHaveBeenCalledWith(endpoint, expect.any(Object));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
