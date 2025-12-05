import { Frame } from '../frames';
import { Chat } from '../models';
import {
  type LocalPromptAdapter,
  type LocalPromptAdapterName,
} from './experimental-local-transport';
import { type DetectionResult } from './model-spec';
import { Transport, type TransportRequest } from './transport';
import { createDelegatingTransport } from './experimental-local-transport';

const noopFrames = async function* (): AsyncGenerator<Frame> {
  yield { type: 'finish' };
};

function makeRequest(
  overrides: Partial<TransportRequest> = {},
): TransportRequest {
  const params: Chat.Api.CompletionCreateParams = {
    model: '' as Chat.Api.CompletionCreateParams['model'],
    messages: [],
    system: '',
  };

  return {
    params,
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
    send?: () => Promise<{ frames: AsyncGenerator<Frame> }>;
  } = {},
): LocalPromptAdapter {
  const detectFn: () => Promise<DetectionResult> =
    opts.detect ?? (async () => ({ ok: true }));

  return {
    name,
    detect: jest.fn(detectFn),
    send: jest.fn(opts.send ?? (async () => ({ frames: noopFrames() }))),
  };
}

describe('Delegating local transport', () => {
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
});
