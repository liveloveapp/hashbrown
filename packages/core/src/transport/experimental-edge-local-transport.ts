import {
  type Transport,
  type TransportRequest,
  type TransportResponse,
} from './transport';
import { TransportError } from './transport-error';
import { type DetectionResult, type ModelSpecFactory } from './model-spec';
import {
  type PromptMessage,
  type PromptOptions,
  type PromptRequest,
} from './experimental-chrome-local-transport';
import { createLocalTextEventStream } from './local-text-event-stream';

const PROMPT_API_SOURCE = 'edge-prompt-api';

interface LanguageModelSession {
  prompt(
    input: PromptMessage[] | string,
    options?: PromptOptions,
  ): Promise<string>;
  promptStreaming(
    input: PromptMessage[] | string,
    options?: PromptOptions,
  ): ReadableStream<string> | Promise<ReadableStream<string>>;
  destroy?: () => void;
}

interface LanguageModelSessionRecord {
  promise: Promise<LanguageModelSession>;
  owners: number;
  destructionPromise?: Promise<void>;
}

interface LanguageModelSessionLease {
  record: LanguageModelSessionRecord;
  session: LanguageModelSession;
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
  'unavailable' | 'available' | 'downloadable' | 'downloading';

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
  private sessionRecord?: LanguageModelSessionRecord;
  private readonly sessionDestructionPromises = new Set<Promise<void>>();

  constructor(
    private readonly options: ExperimentalEdgeLocalTransportOptions = {},
  ) {}

  async send(request: TransportRequest): Promise<TransportResponse> {
    if (!request.input) {
      throw new TransportError('Missing AG-UI run input', {
        retryable: false,
      });
    }

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
    const sessionLease = await this.acquireSession(
      languageModel,
      request.signal,
      promptRequest,
    );
    const { session } = sessionLease;
    const localStream = createLocalTextEventStream({
      input: request.input,
      signal: request.signal,
      start: (signal) =>
        Promise.resolve(
          session.promptStreaming(promptRequest.messages, {
            ...promptRequest.options,
            signal,
          }),
        ),
      destroy: () => this.releaseSession(sessionLease),
    });

    return {
      events: localStream.events,
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
      dispose: localStream.dispose,
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
        EdgeLanguageModelCreateOptions | undefined,
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
    const destructionPromises = new Set(this.sessionDestructionPromises);
    const sessionRecord = this.sessionRecord;

    if (sessionRecord) {
      const currentDestructionPromise =
        sessionRecord.destructionPromise ??
        sessionRecord.promise.then((session) =>
          this.destroySessionRecord(sessionRecord, session),
        );
      destructionPromises.add(currentDestructionPromise);
    } else if (destructionPromises.size === 0) {
      return;
    }

    const results = await Promise.allSettled(destructionPromises);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
      throw failure.reason;
    }
  }

  private async acquireSession(
    languageModel: LanguageModelGlobal | undefined,
    signal: AbortSignal,
    promptRequest: PromptRequest,
  ): Promise<LanguageModelSessionLease> {
    const sessionRecord = this.getSessionRecord(
      languageModel,
      signal,
      promptRequest,
    );
    sessionRecord.owners += 1;

    let session: LanguageModelSession;
    try {
      session = await sessionRecord.promise;
    } catch (error) {
      sessionRecord.owners = Math.max(0, sessionRecord.owners - 1);
      throw error;
    }

    return { record: sessionRecord, session };
  }

  private getSessionRecord(
    languageModel: LanguageModelGlobal | undefined,
    signal: AbortSignal,
    promptRequest: PromptRequest,
  ): LanguageModelSessionRecord {
    if (this.sessionRecord && !this.sessionRecord.destructionPromise) {
      return this.sessionRecord;
    }

    let promise: Promise<LanguageModelSession>;

    if (this.options.createSession) {
      promise = this.options.createSession();
    } else if (!languageModel) {
      throw new TransportError('Prompt API is unavailable', {
        retryable: false,
        code: 'PROMPT_API_MISSING',
      });
    } else {
      promise = this.createLanguageModelSession(
        languageModel,
        signal,
        promptRequest,
      );
    }

    const sessionRecord = { promise, owners: 0 };
    this.sessionRecord = sessionRecord;
    void promise.catch(() => {
      if (this.sessionRecord === sessionRecord) {
        this.sessionRecord = undefined;
      }
    });

    return sessionRecord;
  }

  private releaseSession(lease: LanguageModelSessionLease): Promise<void> {
    const { record, session } = lease;
    record.owners = Math.max(0, record.owners - 1);

    if (record.destructionPromise) {
      return record.destructionPromise;
    }

    if (record.owners > 0) {
      return Promise.resolve();
    }

    return this.destroySessionRecord(record, session);
  }

  private destroySessionRecord(
    record: LanguageModelSessionRecord,
    session: LanguageModelSession,
  ): Promise<void> {
    if (record.destructionPromise) {
      return record.destructionPromise;
    }

    record.destructionPromise = (async () => {
      try {
        await session.destroy?.();
        this.options.events?.sessionState?.('destroyed');
      } finally {
        if (this.sessionRecord === record) {
          this.sessionRecord = undefined;
        }
      }
    })();
    const destructionPromise = record.destructionPromise;
    this.sessionDestructionPromises.add(destructionPromise);
    void destructionPromise.then(
      () => this.sessionDestructionPromises.delete(destructionPromise),
      () => this.sessionDestructionPromises.delete(destructionPromise),
    );

    return destructionPromise;
  }

  private async createLanguageModelSession(
    languageModel: LanguageModelGlobal,
    signal: AbortSignal,
    promptRequest: PromptRequest,
  ) {
    const sessionOptions = {
      ...(promptRequest.sessionOptions as
        EdgeLanguageModelCreateOptions | undefined),
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

function defaultTransformRequest(request: TransportRequest): PromptRequest {
  const input = request.input as NonNullable<TransportRequest['input']>;

  if (input.tools.length > 0) {
    throw new TransportError(
      'Edge Prompt API transport does not support tool calls',
      {
        retryable: false,
        code: 'FEATURE_UNSUPPORTED',
      },
    );
  }

  const messages: PromptMessage[] = [];
  const initialPrompts: PromptMessage[] = [];

  for (const message of input.messages) {
    if (
      message.role !== 'system' &&
      message.role !== 'user' &&
      message.role !== 'assistant'
    ) {
      continue;
    }
    const content =
      typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content ?? '');
    const promptMessage = { role: message.role, content };
    if (message.role === 'system') {
      initialPrompts.push(promptMessage);
    } else {
      messages.push(promptMessage);
    }
  }

  const options: PromptOptions = {};
  const responseSchema = input.hashbrown?.responseSchema;
  if (responseSchema) {
    if (!isSupportedResponseConstraint(responseSchema)) {
      throw new TransportError(
        'Edge Prompt API transport does not support the provided response schema.',
        { retryable: false, code: 'FEATURE_UNSUPPORTED' },
      );
    }
    options.responseConstraint = responseSchema;
  }

  return {
    messages,
    options,
    sessionOptions: initialPrompts.length > 0 ? { initialPrompts } : undefined,
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
