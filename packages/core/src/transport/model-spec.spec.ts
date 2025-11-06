import { Frame } from '../frames';
import { Chat } from '../models';
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
    const params: Chat.Api.CompletionCreateParams = {
      operation: 'generate',
      model: '' as Chat.Api.CompletionCreateParams['model'],
      system: '',
      messages: [],
    };

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
