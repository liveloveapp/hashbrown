import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  experimental_local,
  type LocalPromptAdapter,
  type LocalPromptAdapterName,
} from './experimental-local-transport';
import { type DetectionResult } from './transport';
import { Transport, type TransportRequest } from './transport';
import { TransportError } from './transport-error';
import { createDelegatingTransport } from './experimental-local-transport';

function eventResponse(request: TransportRequest): {
  events: AsyncIterable<AGUIEvent>;
} {
  if (!request.input) {
    throw new Error('Expected AG-UI input');
  }

  const { runId, threadId } = request.input;
  const events = (async function* (): AsyncGenerator<AGUIEvent> {
    yield { type: EventType.RUN_STARTED, runId, threadId };
    yield { type: EventType.RUN_FINISHED, runId, threadId };
  })();

  return { events };
}

function makeRequest(
  overrides: Partial<TransportRequest> = {},
): TransportRequest {
  const input: NonNullable<TransportRequest['input']> = {
    threadId: 'thread-1',
    runId: 'run-1',
    messages: [],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };

  return {
    input,
    signal: new AbortController().signal,
    attempt: 1,
    maxAttempts: 1,
    requestId: 'req',
    ...overrides,
  };
}

function makeAdapter(
  name: LocalPromptAdapterName,
  opts: {
    detect?: () => Promise<DetectionResult>;
    send?: (
      request: TransportRequest,
    ) => Promise<{ events: AsyncIterable<AGUIEvent> }>;
  } = {},
): LocalPromptAdapter {
  const detectFn: () => Promise<DetectionResult> =
    opts.detect ?? (async () => ({ ok: true }));

  return {
    name,
    detect: jest.fn(detectFn),
    send: jest.fn(
      opts.send ??
        (async (request: TransportRequest) => eventResponse(request)),
    ),
  };
}

test('experimental_local creates a delegating local transport factory', () => {
  const factory = experimental_local({ order: [] });

  const transport = factory();

  expect(transport.name).toBe('DelegatingLocalPromptTransport');
});

test('uses the first adapter whose detection succeeds', async () => {
  const primary = makeAdapter('chrome-local');
  const fallback = makeAdapter('edge-local');
  const transport = createDelegatingTransport([
    primary,
    fallback,
  ])() as Transport;

  await transport.send(makeRequest());

  expect(primary.detect).toHaveBeenCalled();
  expect(fallback.detect).not.toHaveBeenCalled();
  expect((primary.send as jest.Mock).mock.calls.length).toBe(1);
});

test('falls back when the first adapter detection fails', async () => {
  const primary = makeAdapter('chrome-local', {
    detect: async () => ({ ok: false, code: 'PLATFORM_UNSUPPORTED' }),
  });
  const fallback = makeAdapter('edge-local');
  const transport = createDelegatingTransport([
    primary,
    fallback,
  ])() as Transport;

  await transport.send(makeRequest());

  expect(primary.detect).toHaveBeenCalled();
  expect(fallback.detect).toHaveBeenCalled();
  expect((fallback.send as jest.Mock).mock.calls.length).toBe(1);
});

test('throws PLATFORM_UNSUPPORTED when no adapters are available', async () => {
  const primary = makeAdapter('chrome-local', {
    detect: async () => ({ ok: false, code: 'PLATFORM_UNSUPPORTED' }),
  });
  const fallback = makeAdapter('edge-local', {
    detect: async () => ({ ok: false, code: 'PLATFORM_UNSUPPORTED' }),
  });
  const transport = createDelegatingTransport([
    primary,
    fallback,
  ])() as Transport;

  await expect(transport.send(makeRequest())).rejects.toHaveProperty(
    'code',
    'PLATFORM_UNSUPPORTED',
  );
});

test('falls back when the first detected adapter cannot send a supported request', async () => {
  const primary = makeAdapter('chrome-local', {
    send: async () => {
      throw new TransportError('Chrome feature unavailable', {
        retryable: false,
        code: 'FEATURE_UNSUPPORTED',
      });
    },
  });
  const fallback = makeAdapter('edge-local');
  const transport = createDelegatingTransport([
    primary,
    fallback,
  ])() as Transport;

  const response = await transport.send(makeRequest());
  const events: AGUIEvent[] = [];
  for await (const event of response.events) {
    events.push(event);
  }

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.RUN_FINISHED,
  ]);
  expect(primary.detect).toHaveBeenCalledTimes(1);
  expect(primary.send).toHaveBeenCalledTimes(1);
  expect(fallback.detect).toHaveBeenCalledTimes(1);
  expect(fallback.send).toHaveBeenCalledTimes(1);
});

test('prefers a feature error when all detected adapters reject as unsupported', async () => {
  const platformError = new TransportError('Chrome platform unavailable', {
    retryable: false,
    code: 'PLATFORM_UNSUPPORTED',
  });
  const featureError = new TransportError('Edge feature unavailable', {
    retryable: false,
    code: 'FEATURE_UNSUPPORTED',
  });
  const primary = makeAdapter('chrome-local', {
    send: async () => Promise.reject(platformError),
  });
  const fallback = makeAdapter('edge-local', {
    send: async () => Promise.reject(featureError),
  });
  const transport = createDelegatingTransport([
    primary,
    fallback,
  ])() as Transport;

  const sendPromise = transport.send(makeRequest());

  await expect(sendPromise).rejects.toBe(featureError);
  expect(primary.send).toHaveBeenCalledTimes(1);
  expect(fallback.send).toHaveBeenCalledTimes(1);
});

test('makes the successfully sent adapter sticky after fallback', async () => {
  const primary = makeAdapter('chrome-local', {
    send: async () => {
      throw new TransportError('Chrome platform unavailable', {
        retryable: false,
        code: 'PLATFORM_UNSUPPORTED',
      });
    },
  });
  const fallback = makeAdapter('edge-local');
  const transport = createDelegatingTransport([
    primary,
    fallback,
  ])() as Transport;

  await transport.send(makeRequest());
  await transport.send(makeRequest({ requestId: 'req-2' }));

  expect(primary.detect).toHaveBeenCalledTimes(1);
  expect(primary.send).toHaveBeenCalledTimes(1);
  expect(fallback.detect).toHaveBeenCalledTimes(2);
  expect(fallback.send).toHaveBeenCalledTimes(2);
});

test.each([
  {
    label: 'arbitrary',
    error: new Error('send failed'),
  },
  {
    label: 'retryable unsupported',
    error: new TransportError('temporarily unavailable', {
      retryable: true,
      code: 'PLATFORM_UNSUPPORTED',
    }),
  },
  {
    label: 'other transport',
    error: new TransportError('prompt failed', {
      retryable: false,
      code: 'PROMPT_FAILED',
    }),
  },
] as const)('does not fall back for a $label send error', async ({ error }) => {
  const primary = makeAdapter('chrome-local', {
    send: async () => Promise.reject(error),
  });
  const fallback = makeAdapter('edge-local');
  const transport = createDelegatingTransport([
    primary,
    fallback,
  ])() as Transport;

  const sendPromise = transport.send(makeRequest());

  await expect(sendPromise).rejects.toBe(error);
  expect(primary.send).toHaveBeenCalledTimes(1);
  expect(fallback.detect).not.toHaveBeenCalled();
  expect(fallback.send).not.toHaveBeenCalled();
});
