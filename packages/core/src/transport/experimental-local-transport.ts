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
import { type DetectionResult, type ModelSpecFactory } from './model-spec';
import {
  type Transport,
  type TransportFactory,
  type TransportRequest,
  type TransportResponse,
} from './transport';
import { TransportError } from './transport-error';

export type LocalPromptAdapterName = 'chrome-local' | 'edge-local';

type ExperimentalLocalTransportEvents =
  ExperimentalChromeLocalTransportOptions['events'];

export interface ExperimentalLocalTransportOptions {
  chrome?: ExperimentalChromeLocalTransportOptions;
  edge?: ExperimentalEdgeLocalTransportOptions;
  events?: ExperimentalLocalTransportEvents;
  order?: LocalPromptAdapterName[];
}

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
    const adapter = await this.selectAdapter(request);

    if (!adapter) {
      throw new TransportError('No local prompt API adapter is available', {
        retryable: false,
        code: 'PLATFORM_UNSUPPORTED',
      });
    }

    return adapter.send(request);
  }

  async teardown() {
    await Promise.allSettled(
      this.adapters.map((adapter) => Promise.resolve(adapter.teardown?.())),
    );
    this.lastAdapter = undefined;
  }

  private async selectAdapter(
    request: TransportRequest,
  ): Promise<LocalPromptAdapter | undefined> {
    const errors: TransportError[] = [];
    const orderedAdapters =
      this.lastAdapter && this.adapters.includes(this.lastAdapter)
        ? [
            this.lastAdapter,
            ...this.adapters.filter((a) => a !== this.lastAdapter),
          ]
        : this.adapters;

    for (const adapter of orderedAdapters) {
      const detection = await safeDetect(adapter, request);

      if (!detection.ok) {
        errors.push(
          new TransportError(
            detection.reason ?? 'Local prompt API adapter unavailable',
            {
              retryable: false,
              code:
                detection.code === 'MODEL_UNAVAILABLE'
                  ? 'PLATFORM_UNSUPPORTED'
                  : detection.code,
            },
          ),
        );
        continue;
      }

      this.lastAdapter = adapter;
      return adapter;
    }

    const featureError = errors.find(
      (err) => err.code === 'FEATURE_UNSUPPORTED',
    );
    if (featureError) {
      throw featureError;
    }

    const platformError = errors.find(
      (err) => err.code === 'PLATFORM_UNSUPPORTED',
    );
    if (platformError) {
      throw platformError;
    }

    return undefined;
  }
}

export function experimentalLocalModelSpec(
  userOptions: ExperimentalLocalTransportOptions = {},
): ModelSpecFactory {
  return (inject) => {
    const adapters = createAdapters({
      ...filterLocalOptions(inject),
      ...userOptions,
    });

    return {
      name: 'local-prompt-api',
      capabilities: { tools: false, structured: true, ui: true },
      detect: () => detectAny(adapters),
      transport: () => new DelegatingLocalTransport(adapters),
    };
  };
}

/**
 * Preferred snake_case helper name for consistency with other transport helpers.
 */
export const experimental_local = experimentalLocalModelSpec;

export function createDelegatingTransport(
  adaptersOrOptions:
    | LocalPromptAdapter[]
    | ExperimentalLocalTransportOptions = {},
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

async function detectAny(
  adapters: LocalPromptAdapter[],
): Promise<DetectionResult> {
  for (const adapter of adapters) {
    const result = await safeDetect(adapter);
    if (result.ok) {
      return result;
    }
  }

  return {
    ok: false,
    code: 'PLATFORM_UNSUPPORTED',
    reason: 'No local prompt API adapters available',
  };
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

function filterLocalOptions(
  config?: Record<string, unknown>,
): Partial<ExperimentalLocalTransportOptions> {
  if (!config) {
    return {};
  }

  const candidate = config as Partial<ExperimentalLocalTransportOptions>;

  return {
    events: candidate.events,
    chrome: candidate.chrome,
    edge: candidate.edge,
    order: candidate.order,
  };
}
