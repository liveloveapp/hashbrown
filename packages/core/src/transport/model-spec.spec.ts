import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { experimental_local } from './experimental-local-transport';
import { TransportError } from './transport-error';
import {
  ModelResolver,
  type ModelSpec,
  type RequestedFeatures,
} from './model-spec';

const noopEvents = async function* (
  requestInput: RunAgentInput,
): AsyncGenerator<AGUIEvent> {
  const identity = {
    threadId: requestInput.threadId,
    runId: requestInput.runId,
  };

  yield { type: EventType.RUN_STARTED, ...identity } as AGUIEvent;
  yield { type: EventType.RUN_FINISHED, ...identity } as AGUIEvent;
};

const features: RequestedFeatures = {
  tools: true,
  structured: false,
  ui: false,
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
      send: jest.fn(async ({ input: requestInput }) => ({
        events: noopEvents(requestInput as RunAgentInput),
      })),
    },
  };

  const eligibleSpec: ModelSpec = {
    name: 'eligible',
    capabilities: { tools: true },
    transport: {
      name: 'ok',
      send: jest.fn(async ({ input: requestInput }) => ({
        events: noopEvents(requestInput as RunAgentInput),
      })),
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
      send: jest.fn(async ({ input: requestInput }) => ({
        events: noopEvents(requestInput as RunAgentInput),
      })),
    },
  };

  const resolver = new ModelResolver([failingSpec, succeedingSpec], {});

  const first = await resolver.select(features);

  expect(first?.spec.name).toBe('platform-unavailable');

  if (first) {
    try {
      await first.transport.send({
        input,
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
        signal: new AbortController().signal,
        attempt: 1,
        maxAttempts: 1,
        requestId: 'test-request',
      });
      await response?.dispose?.();

      expect(selection?.spec.name).toBe('test-model');
      expect(selection?.spec.capabilities).not.toHaveProperty('threads');
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

test('selects a local spec when the later request input has a configured thread ID', async () => {
  const localSend = jest.fn(async ({ input: requestInput }) => ({
    events: noopEvents(requestInput as RunAgentInput),
  }));
  const localSpec: ModelSpec = {
    ...experimental_local({ order: [] })({}),
    detect: async () => ({ ok: true }),
    transport: { name: 'local', send: localSend },
  };
  const fallbackSpec: ModelSpec = {
    name: 'fallback',
    capabilities: { tools: false, structured: true, ui: true },
    transport: { name: 'fallback', send: jest.fn() },
  };
  const resolver = new ModelResolver([localSpec, fallbackSpec], {});
  const laterInput = { ...input, threadId: 'configured-thread' };

  const selection = await resolver.select({
    tools: false,
    structured: false,
    ui: false,
  });
  await selection?.transport.send({
    input: laterInput,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: laterInput.runId,
  });

  expect(selection?.spec.name).toBe('local-prompt-api');
  expect(localSend).toHaveBeenCalledWith(
    expect.objectContaining({ input: laterInput }),
  );
});
