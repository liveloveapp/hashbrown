import { Frame } from '../frames';
import {
  type Transport,
  type TransportFactory,
  type TransportRequest,
  type TransportResponse,
} from './transport';
import { type DetectionResult, type ModelSpecFactory } from './model-spec';
import { TransportError } from './transport-error';

const WEBLLM_SOURCE = 'web-llm';

/**
 * Default MLC model id. A small, fast, instruction-tuned model that fits the
 * generative-UI / structured-output use case on consumer GPUs. Override via
 * {@link ExperimentalWebLlmLocalTransportOptions.model}.
 * @alpha
 */
export const DEFAULT_WEBLLM_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';

/**
 * Message shape sent to the WebLLM engine (OpenAI chat-completions compatible).
 * @alpha
 */
export interface WebLlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Structured-output / generative-UI constraint forwarded as `response_format`.
 * @alpha
 */
export interface WebLlmResponseFormat {
  type: 'json_object' | 'json_schema' | 'text' | (string & {});
  [key: string]: unknown;
}

/**
 * One streamed chunk from `engine.chat.completions.create({ stream: true })`.
 * @alpha
 */
export interface WebLlmCompletionChunk {
  choices?: Array<{
    delta?: { role?: string; content?: string | null };
    finish_reason?: string | null;
  }>;
}

/**
 * The subset of the `@mlc-ai/web-llm` MLCEngine this transport depends on.
 * Kept structural so `@hashbrownai/core` never hard-depends on the (heavy,
 * WebGPU) web-llm package — apps provide the engine, or it is dynamically
 * imported at runtime.
 * @alpha
 */
export interface WebLlmEngine {
  chat: {
    completions: {
      create(params: {
        stream: true;
        messages: WebLlmChatMessage[];
        response_format?: WebLlmResponseFormat;
        temperature?: number;
      }): Promise<AsyncIterable<WebLlmCompletionChunk>>;
    };
  };
  interruptGenerate?: () => void;
  unload?: () => Promise<void>;
}

/**
 * Progress report emitted while the model weights download / initialize.
 * @alpha
 */
export interface WebLlmInitProgressReport {
  progress: number;
  text?: string;
  timeElapsed?: number;
}

/**
 * Factory that creates an MLC engine — matches `@mlc-ai/web-llm`'s
 * `CreateMLCEngine(model, { initProgressCallback })`.
 * @alpha
 */
export type CreateWebLlmEngine = (
  model: string,
  options: {
    initProgressCallback?: (report: WebLlmInitProgressReport) => void;
  },
) => Promise<WebLlmEngine>;

/**
 * Request produced by {@link ExperimentalWebLlmLocalTransportOptions.transformRequest}.
 * @alpha
 */
export interface WebLlmRequest {
  messages: WebLlmChatMessage[];
  responseFormat?: WebLlmResponseFormat;
  temperature?: number;
}

/**
 * Configuration for the experimental WebLLM local transport.
 * @alpha
 */
export interface ExperimentalWebLlmLocalTransportOptions {
  /** MLC model id to load. Defaults to {@link DEFAULT_WEBLLM_MODEL}. */
  model?: string;
  /**
   * A pre-created engine. Wins over {@link createEngine}. Useful for sharing
   * one loaded model across transports, and for tests.
   */
  engine?: WebLlmEngine;
  /**
   * Engine factory. Defaults to dynamically importing `@mlc-ai/web-llm` and
   * calling `CreateMLCEngine`. Provide your own to preconfigure the engine
   * (app config, worker engine, cached weights, ...).
   */
  createEngine?: CreateWebLlmEngine;
  /** Map a Hashbrown request into the WebLLM call. Defaults to a faithful passthrough. */
  transformRequest?: (request: TransportRequest) => WebLlmRequest;
  /** Sampling temperature forwarded to the engine when the request omits one. */
  temperature?: number;
  events?: {
    /** Weight download / init progress, 0–100. */
    downloadProgress?: (percent: number) => void;
    /** Coarse engine lifecycle signal. */
    engineState?: (state: 'loading' | 'ready' | 'error' | 'destroyed') => void;
  };
}

/**
 * Experimental transport that runs generation fully in the browser via
 * `@mlc-ai/web-llm` (WebGPU). Mirrors the Chrome/Edge local transports: it
 * implements {@link Transport} and returns a `frames` async-generator, so it
 * round-trips through the exact same frame protocol as the HTTP transports.
 *
 * Unlike the Chrome Prompt API, WebLLM exposes an OpenAI-compatible surface,
 * so `responseFormat` (structured output / generative UI) is forwarded as
 * `response_format` and tool schemas can be layered on later.
 * @alpha
 */
export class ExperimentalWebLlmLocalTransport implements Transport {
  readonly name = 'ExperimentalWebLlmLocalTransport';
  private enginePromise?: Promise<WebLlmEngine>;

  constructor(
    private readonly options: ExperimentalWebLlmLocalTransportOptions = {},
  ) {}

  async send(request: TransportRequest): Promise<TransportResponse> {
    const transformRequest =
      this.options.transformRequest ?? defaultTransformRequest;
    const webllmRequest = transformRequest(request);

    const engine = await this.getEngine();
    const frames = this.createFrameGenerator(engine, webllmRequest, request);

    return {
      frames,
      metadata: {
        source: WEBLLM_SOURCE,
        model: this.options.model ?? DEFAULT_WEBLLM_MODEL,
        promptMode: 'chatCompletionsStream',
      },
      dispose: async () => {
        try {
          await engine.unload?.();
          this.options.events?.engineState?.('destroyed');
        } finally {
          this.enginePromise = undefined;
        }
      },
    };
  }

  async destroy() {
    const engine = await this.enginePromise?.catch(() => undefined);
    try {
      await engine?.unload?.();
    } finally {
      this.enginePromise = undefined;
    }
  }

  private getEngine(): Promise<WebLlmEngine> {
    if (this.options.engine) {
      return Promise.resolve(this.options.engine);
    }
    if (this.enginePromise) {
      return this.enginePromise;
    }

    const model = this.options.model ?? DEFAULT_WEBLLM_MODEL;
    const create = this.options.createEngine ?? defaultCreateEngine;

    this.options.events?.engineState?.('loading');
    this.enginePromise = create(model, {
      initProgressCallback: (report) => {
        const percent = Math.round((report.progress ?? 0) * 100);
        this.options.events?.downloadProgress?.(percent);
      },
    })
      .then((engine) => {
        this.options.events?.engineState?.('ready');
        return engine;
      })
      .catch((err) => {
        this.options.events?.engineState?.('error');
        this.enginePromise = undefined;
        throw asTransportError(err);
      });

    return this.enginePromise;
  }

  private async *createFrameGenerator(
    engine: WebLlmEngine,
    webllmRequest: WebLlmRequest,
    request: TransportRequest,
  ): AsyncGenerator<Frame> {
    let stream: AsyncIterable<WebLlmCompletionChunk>;
    try {
      stream = await engine.chat.completions.create({
        stream: true,
        messages: webllmRequest.messages,
        response_format: webllmRequest.responseFormat,
        temperature: webllmRequest.temperature ?? this.options.temperature,
      });
    } catch (err) {
      throw asTransportError(err);
    }

    try {
      for await (const chunk of stream) {
        if (request.signal.aborted) {
          engine.interruptGenerate?.();
          throw new TransportError('WebLLM generation aborted', {
            retryable: false,
            code: 'WEBLLM_ABORTED',
          });
        }
        const content = chunk.choices?.[0]?.delta?.content;
        if (typeof content === 'string' && content.length > 0) {
          yield createChunkFrame(content);
        }
      }
      yield { type: 'generation-finish' };
    } catch (err) {
      if (err instanceof TransportError) {
        throw err;
      }
      throw asTransportError(err);
    }
  }
}

/**
 * Factory for the experimental WebLLM local transport.
 * @alpha
 */
export function createExperimentalWebLlmLocalTransport(
  options: ExperimentalWebLlmLocalTransportOptions = {},
): TransportFactory {
  return () => new ExperimentalWebLlmLocalTransport(options);
}

/**
 * Detects whether WebLLM can run — i.e. a browser context exposing WebGPU
 * (`navigator.gpu`). Cheap and synchronous-ish; no model download.
 * @alpha
 */
export async function detectWebLlmSupport(): Promise<DetectionResult> {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return {
      ok: false,
      code: 'PLATFORM_UNSUPPORTED',
      reason: 'WebLLM requires a browser context.',
    };
  }
  const gpu = (navigator as Navigator & { gpu?: unknown }).gpu;
  if (!gpu) {
    return {
      ok: false,
      code: 'PLATFORM_UNSUPPORTED',
      reason: 'WebGPU (navigator.gpu) is unavailable in this browser.',
    };
  }
  return { ok: true };
}

/**
 * Model spec factory for the WebLLM transport. Drop it into a `model: [...]`
 * fallback array exactly like `experimental_chrome` / `experimental_edge`.
 *
 * ```ts
 * chatResource({
 *   system: '...',
 *   model: [experimental_webllm(), experimental_chrome(), 'gpt-4.1'],
 * });
 * ```
 * @alpha
 */
export function experimentalWebLlmLocalModelSpec(
  userOptions: ExperimentalWebLlmLocalTransportOptions = {},
): ModelSpecFactory {
  return (inject) => {
    const mergedOptions: ExperimentalWebLlmLocalTransportOptions = {
      ...filterWebLlmOptions(inject),
      ...userOptions,
    };

    return {
      name: 'webllm-local',
      capabilities: {
        tools: false,
        structured: true,
        ui: true,
        threads: false,
      },
      detect: detectWebLlmSupport,
      transport: () => new ExperimentalWebLlmLocalTransport(mergedOptions),
    };
  };
}

/**
 * Preferred snake_case helper, consistent with `experimental_chrome` /
 * `experimental_edge`.
 * @alpha
 */
export const experimental_webllm = experimentalWebLlmLocalModelSpec;

function filterWebLlmOptions(
  config?: Record<string, unknown>,
): Partial<ExperimentalWebLlmLocalTransportOptions> {
  if (!config) {
    return {};
  }
  const candidate =
    config as unknown as Partial<ExperimentalWebLlmLocalTransportOptions>;
  return {
    model: candidate.model,
    engine: candidate.engine,
    createEngine: candidate.createEngine,
    transformRequest: candidate.transformRequest,
    temperature: candidate.temperature,
    events: candidate.events,
  };
}

function defaultTransformRequest({ params }: TransportRequest): WebLlmRequest {
  const messages: WebLlmChatMessage[] = [];
  if (params.system) {
    messages.push({ role: 'system', content: params.system });
  }
  for (const message of params.messages) {
    if (message.role === 'tool' || message.role === 'error') {
      continue;
    }
    const content =
      typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content ?? '');
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    messages.push({ role, content });
  }

  const request: WebLlmRequest = { messages };
  if (params.responseFormat) {
    request.responseFormat = toResponseFormat(params.responseFormat);
  }
  return request;
}

/**
 * Hashbrown carries the structured-output schema as a plain JSON Schema object
 * on `responseFormat`. WebLLM (OpenAI-compatible) wants
 * `{ type: 'json_object' | 'json_schema', ... }`. Wrap accordingly.
 */
function toResponseFormat(responseFormat: object): WebLlmResponseFormat {
  if (
    typeof responseFormat === 'object' &&
    responseFormat !== null &&
    'type' in responseFormat
  ) {
    return responseFormat as WebLlmResponseFormat;
  }
  return {
    type: 'json_schema',
    json_schema: { name: 'hashbrown_response', schema: responseFormat },
  };
}

async function defaultCreateEngine(
  model: string,
  options: { initProgressCallback?: (report: WebLlmInitProgressReport) => void },
): Promise<WebLlmEngine> {
  // Non-literal specifier so `@hashbrownai/core` does not statically depend on
  // the (heavy, WebGPU) web-llm package. Apps that use this transport install
  // `@mlc-ai/web-llm` themselves (declared as an optional peer dependency).
  const specifier = '@mlc-ai/web-llm';
  let mod: { CreateMLCEngine?: CreateWebLlmEngine };
  try {
    mod = (await import(/* @vite-ignore */ /* webpackIgnore: true */ specifier)) as {
      CreateMLCEngine?: CreateWebLlmEngine;
    };
  } catch {
    throw new TransportError(
      'The WebLLM transport requires the "@mlc-ai/web-llm" package. Install it in your app: npm i @mlc-ai/web-llm',
      { retryable: false, code: 'PLATFORM_UNSUPPORTED' },
    );
  }
  if (typeof mod.CreateMLCEngine !== 'function') {
    throw new TransportError(
      '"@mlc-ai/web-llm" did not export CreateMLCEngine.',
      { retryable: false, code: 'PLATFORM_UNSUPPORTED' },
    );
  }
  return mod.CreateMLCEngine(model, options);
}

function asTransportError(err: unknown): TransportError {
  if (err instanceof TransportError) {
    return err;
  }
  return new TransportError(
    err instanceof Error ? err.message : 'WebLLM transport failure',
    { retryable: false, code: 'WEBLLM_ENGINE_ERROR' },
  );
}

function createChunkFrame(content: string): Frame {
  return {
    type: 'generation-chunk',
    chunk: {
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            content,
          },
          finishReason: null,
        },
      ],
    },
  };
}
