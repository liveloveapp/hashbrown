import { Chat } from '../models';
import { KnownModelIds } from '../utils';
import {
  createHttpTransport,
  type HttpTransportOptions,
} from './http-transport';
import {
  resolveTransport,
  type Transport,
  type TransportFactory,
  type TransportOrFactory,
} from './transport';
import { TransportError } from './transport-error';

/**
 * Capability flags describing what a model/transport can satisfy.
 *
 * @public
 */
export interface ModelCapabilities {
  tools?: boolean;
  structured?: boolean;
  ui?: boolean;
  threads?: boolean;
}

/**
 * Result of a platform/environment detection probe.
 *
 * @public
 */
export type DetectionResult =
  | { ok: true }
  | {
      ok: false;
      code: 'PLATFORM_UNSUPPORTED' | 'MODEL_UNAVAILABLE';
      reason?: string;
    };

/**
 * Model specification consumed by the resolver.
 *
 * @public
 */
export interface ModelSpec {
  name: string;
  transport: Transport | TransportFactory;
  options?: Record<string, unknown>;
  capabilities?: ModelCapabilities;
  detect?: () => Promise<DetectionResult>;
}

/**
 * Factory variant that allows config injection.
 *
 * @public
 */
export type ModelSpecFactory = (config?: ModelSpecConfig) => ModelSpec;

/**
 * Accepted input when selecting a model.
 *
 * @public
 */
export type ModelInput =
  | KnownModelIds
  | ModelSpec
  | ModelSpecFactory
  | Array<KnownModelIds | ModelSpec | ModelSpecFactory | string>
  | string;

/**
 * Configuration injected into model spec factories.
 *
 * @public
 */
export interface ModelSpecConfig {
  url?: string;
  middleware?: Chat.Middleware[];
  transport?: TransportOrFactory;
  [key: string]: unknown;
}

/**
 * Features required by the current request.
 *
 * @public
 */
export interface RequestedFeatures {
  tools: boolean;
  structured: boolean;
  ui: boolean;
  threads: boolean;
}

/**
 * Reasons a spec was skipped during resolution.
 *
 * @public
 */
export interface SkippedSpec {
  name: string;
  reason: 'FEATURE_UNSUPPORTED' | 'PLATFORM_UNSUPPORTED';
  details?: string;
}

/**
 * Metadata describing the chosen spec and any skipped candidates.
 *
 * @public
 */
export interface ModelSelectionMetadata {
  chosenSpec?: string;
  skippedSpecs: SkippedSpec[];
}

/**
 * Resolved model spec paired with the chosen transport.
 * @public
 */
export interface ResolvedModelSpec {
  spec: ModelSpec;
  transport: Transport;
  metadata: ModelSelectionMetadata;
}

/**
 * Resolver that selects a transport based on model specs, capability gating,
 * and optional platform detection.
 *
 * @public
 */
export class ModelResolver {
  private readonly candidates: Array<string | ModelSpec | ModelSpecFactory>;
  private readonly skipped = new Map<string, SkippedSpec>();
  private readonly config: ModelSpecConfig;

  constructor(model: ModelInput | undefined, config: ModelSpecConfig) {
    this.config = normalizeConfig(config);
    this.candidates = normalizeModelInput(model);
  }

  /**
   * Attempts to select the next compatible spec. Specs that previously failed
   * capability checks or platform detection are skipped. A TransportError
   * with FEATURE_UNSUPPORTED or PLATFORM_UNSUPPORTED can be fed back into
   * {@link ModelResolver.skipFromError} to advance the resolver.
   */
  async select(
    features: RequestedFeatures,
  ): Promise<ResolvedModelSpec | undefined> {
    for (const candidate of this.candidates) {
      const spec = await this.materializeSpec(candidate);
      if (!spec) {
        continue;
      }

      if (this.skipped.has(spec.name)) {
        continue;
      }

      const capabilityReason = getCapabilityFailure(features, spec);
      if (capabilityReason) {
        this.skipped.set(spec.name, {
          name: spec.name,
          reason: 'FEATURE_UNSUPPORTED',
          details: capabilityReason,
        });
        continue;
      }

      const detection = await runDetection(spec);
      if (detection && detection.ok === false) {
        this.skipped.set(spec.name, {
          name: spec.name,
          reason: 'PLATFORM_UNSUPPORTED',
          details: detection.reason ?? detection.code,
        });
        continue;
      }

      const transport = this.resolveTransport(spec);

      return {
        spec,
        transport,
        metadata: {
          chosenSpec: spec.name,
          skippedSpecs: Array.from(this.skipped.values()),
        },
      };
    }

    return undefined;
  }

  /**
   * Mark the provided spec as skipped after a send failure.
   */
  skipFromError(spec: ModelSpec, error: unknown) {
    if (!(error instanceof TransportError)) {
      return;
    }

    const reason =
      error.code === 'FEATURE_UNSUPPORTED' ||
      error.code === 'PLATFORM_UNSUPPORTED'
        ? error.code
        : undefined;

    if (!reason) {
      return;
    }

    this.skipped.set(spec.name, {
      name: spec.name,
      reason,
      details: error.message,
    });
  }

  getMetadata(): ModelSelectionMetadata {
    return {
      skippedSpecs: Array.from(this.skipped.values()),
    };
  }

  private resolveTransport(spec: ModelSpec): Transport {
    const transport = resolveTransport(spec.transport);
    if (!transport) {
      throw new TransportError(
        `Transport for spec "${spec.name}" could not be resolved`,
        { retryable: false },
      );
    }

    return transport;
  }

  private async materializeSpec(
    candidate: string | ModelSpec | ModelSpecFactory,
  ): Promise<ModelSpec | undefined> {
    if (typeof candidate === 'string') {
      const transport = this.buildDefaultTransport();
      if (!transport) {
        return undefined;
      }

      return {
        name: candidate,
        capabilities: {
          tools: true,
          structured: true,
          ui: true,
          threads: true,
        },
        transport,
      };
    }

    if (typeof candidate === 'function') {
      const spec = await Promise.resolve(candidate(this.config));
      return spec ?? undefined;
    }

    return candidate;
  }

  private buildDefaultTransport(): TransportFactory | Transport | undefined {
    if (this.config.transport) {
      return this.config.transport;
    }

    const baseUrl =
      typeof this.config.url === 'string' ? this.config.url : undefined;

    if (!baseUrl) {
      console.warn(
        'No url provided for default transport; string model specs will be skipped.',
      );
      return undefined;
    }

    const options: HttpTransportOptions = {
      baseUrl,
      middleware: this.config.middleware,
    };

    return () => createHttpTransport(options);
  }
}

function normalizeModelInput(
  model: ModelInput | undefined,
): Array<string | ModelSpec | ModelSpecFactory> {
  if (!model) {
    return [];
  }

  const maybeArray = model as Array<string | ModelSpec | ModelSpecFactory>;
  if (Array.isArray(maybeArray)) {
    return maybeArray.flat().filter(Boolean) as Array<
      string | ModelSpec | ModelSpecFactory
    >;
  }

  return [model as string | ModelSpec | ModelSpecFactory];
}

function normalizeConfig(config: ModelSpecConfig): ModelSpecConfig {
  return {
    ...config,
    url: config.url,
  };
}

function getCapabilityFailure(
  features: RequestedFeatures,
  spec: ModelSpec,
): string | undefined {
  const capabilities = spec.capabilities ?? {};
  if (features.tools && capabilities.tools === false) {
    return 'tools requested but not supported';
  }
  if (features.structured && capabilities.structured === false) {
    return 'structured output requested but not supported';
  }
  if (features.ui && capabilities.ui === false) {
    return 'ui output requested but not supported';
  }
  if (features.threads && capabilities.threads === false) {
    return 'threads requested but not supported';
  }
  return undefined;
}

async function runDetection(spec: ModelSpec): Promise<DetectionResult | void> {
  if (!spec.detect) {
    return;
  }

  try {
    return await spec.detect();
  } catch (err) {
    return {
      ok: false,
      code: 'PLATFORM_UNSUPPORTED',
      reason: err instanceof Error ? err.message : 'Detection failed',
    };
  }
}
