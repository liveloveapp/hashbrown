import {
  detectChromePromptApi,
  ExperimentalChromeLocalTransport,
  type ExperimentalChromeLocalTransportOptions,
} from './experimental-chrome-local-transport';
import {
  detectEdgePromptApi,
  ExperimentalEdgeLocalTransport,
  type ExperimentalEdgeLocalTransportOptions,
} from './experimental-edge-local-transport';
import {
  type DetectionResult,
  type Transport,
  type TransportFactory,
  type TransportRequest,
  type TransportResponse,
} from './transport';
import { TransportError } from './transport-error';

/**
 * Supported local prompt adapters.
 * @alpha
 */
export type LocalPromptAdapterName = 'chrome-local' | 'edge-local';

type ExperimentalLocalTransportEvents =
  ExperimentalChromeLocalTransportOptions['events'];

/**
 * Configuration for the experimental local transport delegator.
 * @alpha
 */
export interface ExperimentalLocalTransportOptions {
  chrome?: ExperimentalChromeLocalTransportOptions;
  edge?: ExperimentalEdgeLocalTransportOptions;
  events?: ExperimentalLocalTransportEvents;
  order?: LocalPromptAdapterName[];
}

/**
 * Adapter contract for local prompt transports.
 * @alpha
 */
export interface LocalPromptAdapter {
  readonly name: LocalPromptAdapterName;
  detect(request?: TransportRequest): Promise<DetectionResult>;
  send(request: TransportRequest): Promise<TransportResponse>;
  teardown?(): void | Promise<void>;
}

class DelegatingLocalTransport implements Transport {
  readonly name = 'DelegatingLocalPromptTransport';
  private readonly adapters: LocalPromptAdapter[];
  private lastAdapter?: LocalPromptAdapter;

  constructor(adapters: LocalPromptAdapter[]) {
    this.adapters = adapters;
  }

  async send(request: TransportRequest): Promise<TransportResponse> {
    const errors: TransportError[] = [];
    const orderedAdapters =
      this.lastAdapter && this.adapters.includes(this.lastAdapter)
        ? [
            this.lastAdapter,
            ...this.adapters.filter((adapter) => adapter !== this.lastAdapter),
          ]
        : this.adapters;

    for (const adapter of orderedAdapters) {
      const detection = await safeDetect(adapter, request);

      if (!detection.ok) {
        errors.push(toDetectionError(detection));
        continue;
      }

      let response: TransportResponse;
      try {
        response = await adapter.send(request);
      } catch (error) {
        if (!isTerminalUnsupportedError(error)) {
          throw error;
        }

        errors.push(error);
        continue;
      }

      this.lastAdapter = adapter;
      return response;
    }

    const preferredError = selectPreferredUnsupportedError(errors);
    if (preferredError) {
      throw preferredError;
    }

    throw new TransportError('No local prompt API adapter is available', {
      retryable: false,
      code: 'PLATFORM_UNSUPPORTED',
    });
  }

  async teardown() {
    await Promise.allSettled(
      this.adapters.map((adapter) => Promise.resolve(adapter.teardown?.())),
    );
    this.lastAdapter = undefined;
  }
}

function toDetectionError(
  detection: Extract<DetectionResult, { ok: false }>,
): TransportError {
  return new TransportError(
    detection.reason ?? 'Local prompt API adapter unavailable',
    {
      retryable: false,
      code:
        detection.code === 'MODEL_UNAVAILABLE'
          ? 'PLATFORM_UNSUPPORTED'
          : detection.code,
    },
  );
}

function isTerminalUnsupportedError(error: unknown): error is TransportError {
  return (
    error instanceof TransportError &&
    !error.retryable &&
    (error.code === 'FEATURE_UNSUPPORTED' ||
      error.code === 'PLATFORM_UNSUPPORTED')
  );
}

function selectPreferredUnsupportedError(
  errors: TransportError[],
): TransportError | undefined {
  return (
    errors.find((error) => error.code === 'FEATURE_UNSUPPORTED') ??
    errors.find((error) => error.code === 'PLATFORM_UNSUPPORTED')
  );
}

/**
 * Creates a transport factory that delegates to available local prompt adapters.
 * @alpha
 */
export function experimental_local(
  userOptions: ExperimentalLocalTransportOptions = {},
): TransportFactory {
  return createDelegatingTransport(userOptions);
}

/**
 * Builds a TransportFactory that delegates to local prompt adapters.
 * @alpha
 */
export function createDelegatingTransport(
  adaptersOrOptions:
    LocalPromptAdapter[] | ExperimentalLocalTransportOptions = {},
): TransportFactory {
  const adapters = Array.isArray(adaptersOrOptions)
    ? adaptersOrOptions
    : createAdapters(adaptersOrOptions);

  return () => new DelegatingLocalTransport(adapters);
}

function createAdapters(
  options: ExperimentalLocalTransportOptions = {},
): LocalPromptAdapter[] {
  const order =
    options.order ??
    (['chrome-local', 'edge-local'] satisfies LocalPromptAdapterName[]);

  return order
    .map((name) => {
      if (name === 'chrome-local') {
        return createChromeAdapter(options);
      }
      if (name === 'edge-local') {
        return createEdgeAdapter(options);
      }
      return undefined;
    })
    .filter(Boolean) as LocalPromptAdapter[];
}

async function safeDetect(
  adapter: LocalPromptAdapter,
  request?: TransportRequest,
): Promise<DetectionResult> {
  try {
    return await adapter.detect(request);
  } catch (err) {
    return {
      ok: false,
      code: 'PLATFORM_UNSUPPORTED',
      reason: err instanceof Error ? err.message : 'Detection failed',
    };
  }
}

function createChromeAdapter(
  options: ExperimentalLocalTransportOptions,
): LocalPromptAdapter {
  const chromeOptions: ExperimentalChromeLocalTransportOptions = {
    ...(options.chrome ?? {}),
    events: mergeEvents(options.events, options.chrome?.events),
  };

  const transport = new ExperimentalChromeLocalTransport(chromeOptions);

  return {
    name: 'chrome-local',
    detect: () =>
      detectChromePromptApi(undefined, {
        outputLanguage: chromeOptions.outputLanguage,
        onAvailabilityChange: chromeOptions.events?.availability,
      }),
    send: (request) => transport.send(request),
    teardown: () => transport.destroy?.(),
  };
}

function createEdgeAdapter(
  options: ExperimentalLocalTransportOptions,
): LocalPromptAdapter {
  const edgeOptions: ExperimentalEdgeLocalTransportOptions = {
    ...(options.edge ?? {}),
    events: mergeEvents(options.events, options.edge?.events),
  };

  const transport = new ExperimentalEdgeLocalTransport(edgeOptions);

  return {
    name: 'edge-local',
    detect: () =>
      detectEdgePromptApi(undefined, {
        onAvailabilityChange: edgeOptions.events?.availability,
      }),
    send: (request) => transport.send(request),
    teardown: () => transport.destroy?.(),
  };
}

function mergeEvents(
  shared?: ExperimentalLocalTransportEvents,
  scoped?: ExperimentalLocalTransportEvents,
): ExperimentalLocalTransportEvents | undefined {
  if (!shared && !scoped) {
    return undefined;
  }

  return {
    ...(shared ?? {}),
    ...(scoped ?? {}),
  };
}
