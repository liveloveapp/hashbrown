import { Frame } from '../frames';
import {
  Transport,
  type TransportRequest,
  type TransportResponse,
} from './transport';
import { TransportError } from './transport-error';
import { type DetectionResult, type ModelSpecFactory } from './model-spec';
import {
  PromptMessage,
  PromptOptions,
  PromptRequest,
} from './experimental-chrome-local-transport';

const PROMPT_API_SOURCE = 'edge-prompt-api';

interface LanguageModelSession {
  prompt(
    input: PromptMessage[] | string,
    options?: PromptOptions,
  ): Promise<string>;
  promptStreaming(
    input: PromptMessage[] | string,
    options?: PromptOptions,
  ): Promise<ReadableStream<string>>;
  destroy?: () => void;
}

interface LanguageModelGlobal {
  availability?: (
    options?: EdgeLanguageModelCreateOptions,
  ) => Promise<LanguageModelAvailability>;
  create(
    options?: EdgeLanguageModelCreateOptions,
  ): Promise<LanguageModelSession>;
}

type LanguageModelAvailabilityStatus =
  | 'unavailable'
  | 'available'
  | 'downloadable'
  | 'downloading';

type LanguageModelAvailability =
  | LanguageModelAvailabilityStatus
  | {
      status: LanguageModelAvailabilityStatus;
      message?: string;
    };

/**
 * Configuration for the experimental Edge local transport.
 * @alpha
 */
export interface ExperimentalEdgeLocalTransportOptions {
  transformRequest?: (request: TransportRequest) => PromptRequest;
  events?: {
    downloadRequired?: (
      status: LanguageModelAvailabilityStatus,
    ) => Promise<void> | void;
    downloadProgress?: (percent: number) => void;
    availability?: (status: LanguageModelAvailabilityStatus) => void;
    sessionState?: (state: 'created' | 'destroyed' | 'error') => void;
  };
  createSession?: () => Promise<LanguageModelSession>;
}

/**
 * Experimental transport that targets the Edge Prompt API.
 * @alpha
 */
export class ExperimentalEdgeLocalTransport implements Transport {
  readonly name = 'ExperimentalEdgeLocalTransport';
  private sessionPromise?: Promise<LanguageModelSession>;

  constructor(
    private readonly options: ExperimentalEdgeLocalTransportOptions = {},
  ) {}

  async send(request: TransportRequest): Promise<TransportResponse> {
    const languageModel = getLanguageModel();
    const transformRequest =
      this.options.transformRequest ?? defaultTransformRequest;

    if (!languageModel) {
      throw new TransportError('Edge Prompt API is not available', {
        retryable: false,
        code: 'PLATFORM_UNSUPPORTED',
      });
    }

    const promptRequest = transformRequest(request);
    const availability = await this.ensureAvailability(
      languageModel,
      promptRequest,
    );
    const session = await this.getSession(
      languageModel,
      request.signal,
      promptRequest,
    );
    const frames = this.createFrameGenerator(session, promptRequest, request);
    const dispose = async () => {
      try {
        await session.destroy?.();
        this.options.events?.sessionState?.('destroyed');
      } finally {
        this.sessionPromise = undefined;
      }
    };

    return {
      frames,
      metadata: {
        source: PROMPT_API_SOURCE,
        status: availability,
        promptMode: 'promptStreaming',
        usedResponseConstraint: Boolean(
          promptRequest.options?.responseConstraint,
        ),
        omitResponseConstraintInput: (
          promptRequest.options as { omitResponseConstraintInput?: boolean }
        )?.omitResponseConstraintInput,
        stableSession: true,
      },
      dispose,
    };
  }

  private async ensureAvailability(
    languageModel: LanguageModelGlobal,
    promptRequest: PromptRequest,
  ): Promise<LanguageModelAvailabilityStatus> {
    if (!languageModel.availability) {
      return 'available';
    }

    const availability = await languageModel.availability(
      promptRequest.sessionOptions as
        | EdgeLanguageModelCreateOptions
        | undefined,
    );

    const status =
      typeof availability === 'string' ? availability : availability.status;
    const message =
      typeof availability === 'string' ? undefined : availability.message;

    this.options.events?.availability?.(status);

    if (status === 'unavailable') {
      throw new TransportError(message ?? 'Prompt API unavailable', {
        retryable: false,
        code: 'PLATFORM_UNSUPPORTED',
      });
    }

    if (status === 'downloadable' || status === 'downloading') {
      await this.options.events?.downloadRequired?.(status);
    }

    return status;
  }

  async destroy() {
    const session = await this.sessionPromise;
    try {
      session?.destroy?.();
      this.options.events?.sessionState?.('destroyed');
    } finally {
      // no-op
    }
    this.sessionPromise = undefined;
  }

  private async getSession(
    languageModel: LanguageModelGlobal | undefined,
    signal: AbortSignal,
    promptRequest: PromptRequest,
  ): Promise<LanguageModelSession> {
    if (this.sessionPromise) {
      return this.sessionPromise;
    }

    if (this.options.createSession) {
      this.sessionPromise = this.options.createSession();
      return this.sessionPromise;
    }

    if (!languageModel) {
      throw new TransportError('Prompt API is unavailable', {
        retryable: false,
        code: 'PROMPT_API_MISSING',
      });
    }

    this.sessionPromise = this.createLanguageModelSession(
      languageModel,
      signal,
      promptRequest,
    );

    return this.sessionPromise;
  }

  private async createLanguageModelSession(
    languageModel: LanguageModelGlobal,
    signal: AbortSignal,
    promptRequest: PromptRequest,
  ) {
    const sessionOptions = {
      ...(promptRequest.sessionOptions as
        | EdgeLanguageModelCreateOptions
        | undefined),
    };
    const userMonitor = sessionOptions?.monitor;
    const monitor = composeMonitor(
      userMonitor,
      this.options.events?.downloadProgress,
    );

    delete (sessionOptions as { monitor?: unknown }).monitor;

    const createOptions: EdgeLanguageModelCreateOptions = {
      ...sessionOptions,
      signal,
      monitor,
    };

    try {
      const session = await languageModel.create(createOptions);
      this.options.events?.sessionState?.('created');
      return session;
    } catch (err) {
      this.options.events?.sessionState?.('error');
      throw err;
    }
  }

  private createFrameGenerator(
    session: LanguageModelSession,
    promptRequest: PromptRequest,
    request: TransportRequest,
  ): AsyncGenerator<Frame> {
    const options: PromptOptions = {
      ...(promptRequest.options ?? {}),
      signal: request.signal,
    };

    return this.streamPromptToFrames(session, promptRequest.messages, options);
  }

  private streamPromptToFrames(
    session: LanguageModelSession,
    messages: PromptMessage[] | string,
    options: PromptOptions,
  ): AsyncGenerator<Frame> {
    const controller = new AbortController();
    const signal = options.signal;

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          controller.abort(signal.reason);
        },
        { once: true },
      );
    }

    return this.readStream(session, messages, options, controller);
  }

  private async *readStream(
    session: LanguageModelSession,
    messages: PromptMessage[] | string,
    options: PromptOptions,
    abortController: AbortController,
  ): AsyncGenerator<Frame> {
    const stream = await session.promptStreaming(messages, options);
    const reader = stream.getReader();

    try {
      while (true) {
        if (abortController.signal.aborted) {
          await reader.cancel();
          session.destroy?.();
          throw new TransportError('Prompt aborted', {
            retryable: false,
            code: 'PROMPT_API_ABORTED',
          });
        }

        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        if (typeof value === 'string' && value.length > 0) {
          yield createChunkFrame(value);
        }
      }

      yield { type: 'generation-finish' };
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * Detects whether the Edge Prompt API is available.
 * @alpha
 */
export function detectEdgePromptApi(
  sessionOptions?: EdgeLanguageModelCreateOptions,
  opts?: {
    onAvailabilityChange?: (status: LanguageModelAvailabilityStatus) => void;
  },
): Promise<DetectionResult> {
  const languageModel = getLanguageModel();

  if (!languageModel) {
    return Promise.resolve({
      ok: false,
      code: 'PLATFORM_UNSUPPORTED',
      reason: 'Edge Prompt API is missing',
    });
  }

  if (typeof languageModel.availability !== 'function') {
    return Promise.resolve({ ok: true });
  }

  return languageModel.availability(sessionOptions).then((availability) => {
    const status =
      typeof availability === 'string' ? availability : availability.status;
    const message =
      typeof availability === 'string' ? undefined : availability.message;

    opts?.onAvailabilityChange?.(status);

    if (status === 'unavailable') {
      return {
        ok: false,
        code: 'PLATFORM_UNSUPPORTED',
        reason: message,
      };
    }

    return { ok: true };
  });
}

/**
 * Model spec factory for Edge Prompt API transport.
 * @alpha
 */
export function experimentalEdgeLocalModelSpec(
  userOptions: ExperimentalEdgeLocalTransportOptions = {},
): ModelSpecFactory {
  return (inject) => {
    const mergedOptions: ExperimentalEdgeLocalTransportOptions = {
      ...filterEdgeOptions(inject),
      ...userOptions,
    };

    return {
      name: 'edge-local',
      capabilities: {
        tools: false,
        structured: true,
        ui: true,
        threads: false,
      },
      detect: () =>
        detectEdgePromptApi(undefined, {
          onAvailabilityChange: mergedOptions.events?.availability,
        }),
      transport: () => new ExperimentalEdgeLocalTransport(mergedOptions),
    };
  };
}

/**
 * Preferred snake_case helper name for consistency with other transport helpers.
 * Kept alongside the legacy `experimentalEdgeLocalModelSpec`.
 * @alpha
 */
export const experimental_edge = experimentalEdgeLocalModelSpec;

function filterEdgeOptions(
  config?: Record<string, unknown>,
): Partial<ExperimentalEdgeLocalTransportOptions> {
  if (!config) {
    return {};
  }

  const candidate = config as Partial<ExperimentalEdgeLocalTransportOptions>;

  return {
    events: candidate.events,
    createSession: candidate.createSession,
    transformRequest: candidate.transformRequest,
  };
}

function getLanguageModel(): LanguageModelGlobal | undefined {
  const candidate = (globalThis as { LanguageModel?: LanguageModelGlobal })
    .LanguageModel;
  if (!candidate || typeof candidate.create !== 'function') {
    return undefined;
  }

  return candidate;
}

function defaultTransformRequest({ params }: TransportRequest): PromptRequest {
  if (params.tools && params.tools.length > 0) {
    throw new TransportError(
      'Edge Prompt API transport does not support tool calls',
      {
        retryable: false,
        code: 'FEATURE_UNSUPPORTED',
      },
    );
  }

  if (
    params.responseFormat &&
    !isSupportedResponseConstraint(params.responseFormat)
  ) {
    throw new TransportError(
      'Edge Prompt API transport does not support the provided response schema.',
      { retryable: false, code: 'FEATURE_UNSUPPORTED' },
    );
  }

  const messages: PromptMessage[] = [];
  const initialPrompts = params.system
    ? [{ role: 'system', content: params.system }]
    : undefined;

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

  const options: PromptOptions = {};
  if (params.responseFormat) {
    options.responseConstraint = params.responseFormat;
  }

  return {
    messages,
    options,
    sessionOptions: initialPrompts ? { initialPrompts } : undefined,
  };
}

function isSupportedResponseConstraint(constraint: unknown): boolean {
  if (!constraint) {
    return true;
  }

  if (constraint instanceof RegExp) {
    return true;
  }

  if (typeof constraint === 'object') {
    return true;
  }

  return false;
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

type EdgeLanguageModelCreateOptions = {
  signal?: AbortSignal;
  monitor?: EdgeMonitorCallback;
  initialPrompts?: PromptMessage[];
  [key: string]: unknown;
};

type EdgeMonitorCallback =
  | ((monitor: EdgeLanguageModelDownloadMonitor) => void)
  | ((event: DownloadProgressEvent) => void);

interface EdgeLanguageModelDownloadMonitor {
  addEventListener?: (
    type: 'downloadprogress',
    listener: (event: DownloadProgressEvent) => void,
  ) => void;
}

interface DownloadProgressEvent extends Event {
  loaded?: number;
  total?: number;
}

function isDownloadMonitor(
  obj: unknown,
): obj is EdgeLanguageModelDownloadMonitor {
  return !!(
    obj &&
    typeof (obj as EdgeLanguageModelDownloadMonitor).addEventListener ===
      'function'
  );
}

function isDownloadEvent(obj: unknown): obj is DownloadProgressEvent {
  return typeof (obj as DownloadProgressEvent)?.loaded === 'number';
}

function percentFromEvent(event: DownloadProgressEvent): number | undefined {
  const { loaded, total } = event;
  if (typeof loaded === 'number' && typeof total === 'number' && total > 0) {
    return Math.round((loaded / total) * 100);
  }
  return undefined;
}

function composeMonitor(
  userMonitor?: EdgeMonitorCallback,
  onDownloadProgress?: (percent: number) => void,
): EdgeMonitorCallback | undefined {
  if (!userMonitor && !onDownloadProgress) {
    return undefined;
  }

  return (
    monitor: EdgeLanguageModelDownloadMonitor | DownloadProgressEvent,
  ) => {
    // Forward to user monitor regardless of shape.
    userMonitor?.(monitor as never);

    if (!onDownloadProgress) {
      return;
    }

    if (isDownloadMonitor(monitor)) {
      monitor.addEventListener?.(
        'downloadprogress',
        (event: DownloadProgressEvent) => {
          const pct = percentFromEvent(event);
          if (typeof pct === 'number') {
            onDownloadProgress(pct);
          }
        },
      );
      return;
    }

    if (isDownloadEvent(monitor)) {
      const pct = percentFromEvent(monitor);
      if (typeof pct === 'number') {
        onDownloadProgress(pct);
      }
    }
  };
}

// Expose helper for tests
export { composeMonitor };
