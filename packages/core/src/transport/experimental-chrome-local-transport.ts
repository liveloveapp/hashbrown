import {
  type Transport,
  type TransportFactory,
  type TransportRequest,
  type TransportResponse,
} from './transport';
import { type DetectionResult, type ModelSpecFactory } from './model-spec';
import { createLocalTextEventStream } from './local-text-event-stream';
import { TransportError } from './transport-error';

const PROMPT_API_SOURCE = 'chrome-prompt-api';
export type SupportedOutputLanguage = 'en' | 'es' | 'ja';

const SUPPORTED_OUTPUT_LANGUAGES: SupportedOutputLanguage[] = [
  'en',
  'es',
  'ja',
];
/**
 * Message format accepted by the Chrome Prompt API.
 * @alpha
 */
export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Prompt options for the Chrome Prompt API.
 * @alpha
 */
export interface PromptOptions {
  responseConstraint?: unknown;
  temperature?: number;
  topK?: number;
  signal?: AbortSignal;
  outputLanguage?: SupportedOutputLanguage;
  tools?: never;
}

/**
 * Request shape passed to the Chrome Prompt API.
 * @alpha
 */
export interface PromptRequest {
  messages: PromptMessage[] | string;
  options?: PromptOptions;
  sessionOptions?: LanguageModelCreateOptions;
}

/**
 * Configuration for the experimental Chrome local transport.
 * @alpha
 */
export interface ExperimentalChromeLocalTransportOptions {
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
  outputLanguage?: SupportedOutputLanguage;
}

type LanguageModelAvailabilityStatus =
  'unavailable' | 'available' | 'downloadable' | 'downloading';

interface LanguageModelAvailability {
  status: LanguageModelAvailabilityStatus;
  message?: string;
}

interface LanguageModelCreateOptions {
  signal?: AbortSignal;
  monitor?: (event: DownloadProgressEvent) => void;
  expectedOutputs?: ExpectedOutput[];
  [key: string]: unknown;
}

interface ExpectedOutput {
  type: string;
  languages?: SupportedOutputLanguage[];
}

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
    options?: LanguageModelCreateOptions,
  ) => Promise<LanguageModelAvailability>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

/**
 * Experimental transport that targets the Chrome Prompt API.
 * @alpha
 */
export class ExperimentalChromeLocalTransport implements Transport {
  readonly name = 'ExperimentalChromeLocalTransport';
  private sessionRecord?: LanguageModelSessionRecord;

  constructor(
    private readonly options: ExperimentalChromeLocalTransportOptions,
  ) {}

  async send(request: TransportRequest): Promise<TransportResponse> {
    if (!request.input) {
      throw new TransportError('Missing AG-UI run input', {
        retryable: false,
      });
    }

    const languageModel = await this.getLanguageModel();
    const transformRequest =
      this.options.transformRequest ?? defaultTransformRequest;

    const resolvedOutputLanguage = this.options.outputLanguage ?? 'en';

    if (!SUPPORTED_OUTPUT_LANGUAGES.includes(resolvedOutputLanguage)) {
      throw new TransportError(
        `Unsupported output language: ${resolvedOutputLanguage}`,
        { retryable: false, code: 'FEATURE_UNSUPPORTED' },
      );
    }

    if (!languageModel && !this.options.createSession) {
      throw new TransportError('Chrome Prompt API is not available', {
        retryable: false,
        code: 'PLATFORM_UNSUPPORTED',
      });
    }

    const transformedPromptRequest = transformRequest(request);
    const resolvedPromptOutputLanguage = resolvePromptOutputLanguage(
      transformedPromptRequest,
      resolvedOutputLanguage,
    );
    const promptRequest: PromptRequest = {
      ...transformedPromptRequest,
      options: {
        ...transformedPromptRequest.options,
        outputLanguage: resolvedPromptOutputLanguage,
      },
    };

    const availability = languageModel
      ? await this.ensureAvailability(
          languageModel,
          promptRequest,
          resolvedPromptOutputLanguage,
        )
      : 'available';

    const sessionLease = await this.acquireSession(
      languageModel,
      request.signal,
      promptRequest,
      resolvedPromptOutputLanguage,
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
        outputLanguage: resolvedPromptOutputLanguage,
      },
      dispose: localStream.dispose,
    };
  }

  async destroy() {
    const sessionRecord = this.sessionRecord;
    if (!sessionRecord) {
      this.options.events?.sessionState?.('destroyed');
      return;
    }

    const session = await sessionRecord.promise;
    await this.destroySessionRecord(sessionRecord, session);
  }

  private async getLanguageModel(): Promise<LanguageModelGlobal | undefined> {
    const candidate = (globalThis as PromptApiGlobal).LanguageModel;
    if (!candidate) {
      return undefined;
    }
    if (typeof candidate.create !== 'function') {
      return undefined;
    }
    return candidate;
  }

  private async ensureAvailability(
    languageModel: LanguageModelGlobal,
    promptRequest: PromptRequest,
    outputLanguage: SupportedOutputLanguage,
  ): Promise<LanguageModelAvailabilityStatus> {
    if (!languageModel.availability) {
      return 'available';
    }

    const availabilityOptions = buildAvailabilityOptions(
      promptRequest.sessionOptions,
      outputLanguage,
    );

    const availability = await languageModel.availability(availabilityOptions);

    this.options.events?.availability?.(availability.status);

    if (availability.status === 'unavailable') {
      throw new TransportError(
        availability.message ?? 'Prompt API unavailable',
        {
          retryable: false,
          code: 'PLATFORM_UNSUPPORTED',
        },
      );
    }

    if (
      availability.status === 'downloadable' ||
      availability.status === 'downloading'
    ) {
      await this.options.events?.downloadRequired?.(availability.status);
    }

    return availability.status;
  }

  private async acquireSession(
    languageModel: LanguageModelGlobal | undefined,
    signal: AbortSignal,
    promptRequest: PromptRequest,
    outputLanguage: SupportedOutputLanguage,
  ): Promise<LanguageModelSessionLease> {
    const sessionRecord = this.getSessionRecord(
      languageModel,
      signal,
      promptRequest,
      outputLanguage,
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
    outputLanguage: SupportedOutputLanguage,
  ): LanguageModelSessionRecord {
    if (this.sessionRecord) {
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
        outputLanguage,
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

    if (this.sessionRecord === record) {
      this.sessionRecord = undefined;
    }

    record.destructionPromise = (async () => {
      await session.destroy?.();
      this.options.events?.sessionState?.('destroyed');
    })();

    return record.destructionPromise;
  }

  private async createLanguageModelSession(
    languageModel: LanguageModelGlobal,
    signal: AbortSignal,
    promptRequest: PromptRequest,
    outputLanguage: SupportedOutputLanguage,
  ) {
    const userMonitor = promptRequest.sessionOptions?.monitor;
    const monitor =
      userMonitor || this.options.events?.downloadProgress
        ? (event: DownloadProgressEvent) => {
            userMonitor?.(event);
            if (
              this.options.events?.downloadProgress &&
              typeof event.loaded === 'number' &&
              typeof event.total === 'number' &&
              event.total > 0
            ) {
              const percent = Math.round((event.loaded / event.total) * 100);
              this.options.events.downloadProgress(percent);
            }
          }
        : undefined;

    const sessionOptions = { ...promptRequest.sessionOptions };
    delete sessionOptions.monitor;

    const expectedOutputs = resolveExpectedOutputs(
      outputLanguage,
      sessionOptions,
    );
    if (expectedOutputs && !sessionOptions.expectedOutputs) {
      sessionOptions.expectedOutputs = expectedOutputs;
    }

    const createOptions: LanguageModelCreateOptions = {
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
 * Factory for the experimental Chrome local transport.
 * @alpha
 */
export function createExperimentalChromeLocalTransport(
  options: ExperimentalChromeLocalTransportOptions = {},
): TransportFactory {
  return () => new ExperimentalChromeLocalTransport(options);
}

/**
 * Detects whether the Chrome Prompt API is available.
 * @alpha
 */
export async function detectChromePromptApi(
  sessionOptions?: LanguageModelCreateOptions,
  opts?: {
    outputLanguage?: SupportedOutputLanguage;
    onAvailabilityChange?: (status: LanguageModelAvailabilityStatus) => void;
  },
): Promise<DetectionResult> {
  if (isUnsupportedContext()) {
    return {
      ok: false,
      code: 'PLATFORM_UNSUPPORTED',
      reason: 'Chrome Prompt API is not available in this execution context.',
    };
  }

  const languageModel = (globalThis as PromptApiGlobal).LanguageModel;

  if (!languageModel || typeof languageModel.create !== 'function') {
    return {
      ok: false,
      code: 'PLATFORM_UNSUPPORTED',
      reason: 'Chrome Prompt API is missing',
    };
  }

  if (typeof languageModel.availability !== 'function') {
    return { ok: true };
  }

  try {
    const availability = await languageModel.availability(sessionOptions);
    opts?.onAvailabilityChange?.(availability.status);
    if (
      opts?.outputLanguage &&
      !SUPPORTED_OUTPUT_LANGUAGES.includes(opts.outputLanguage)
    ) {
      return {
        ok: false,
        code: 'PLATFORM_UNSUPPORTED',
        reason: `Unsupported output language: ${opts.outputLanguage}`,
      };
    }
    if (availability.status === 'unavailable') {
      return {
        ok: false,
        code: 'PLATFORM_UNSUPPORTED',
        reason: availability.message,
      };
    }
  } catch (err) {
    return {
      ok: false,
      code: 'PLATFORM_UNSUPPORTED',
      reason:
        err instanceof Error ? err.message : 'Prompt API detection failed',
    };
  }

  return { ok: true };
}

/**
 * Model spec factory for Chrome Prompt API transport.
 * @alpha
 */
export function experimentalChromeLocalModelSpec(
  userOptions: ExperimentalChromeLocalTransportOptions = {},
): ModelSpecFactory {
  return (inject) => {
    const mergedOptions: ExperimentalChromeLocalTransportOptions = {
      ...filterChromeOptions(inject),
      ...userOptions,
    };

    return {
      name: 'chrome-local',
      capabilities: {
        tools: false,
        structured: true,
        ui: true,
        threads: false,
      },
      detect: () =>
        detectChromePromptApi(
          (mergedOptions as { sessionOptions?: LanguageModelCreateOptions })
            ?.sessionOptions,
          {
            outputLanguage: mergedOptions.outputLanguage,
            onAvailabilityChange: mergedOptions.events?.availability,
          },
        ),
      transport: () => new ExperimentalChromeLocalTransport(mergedOptions),
    };
  };
}

/**
 * Preferred snake_case helper name for consistency with other transport helpers.
 * Kept alongside the legacy `experimentalChromeLocalModelSpec`.
 * @alpha
 */
export const experimental_chrome = experimentalChromeLocalModelSpec;

function filterChromeOptions(
  config?: Record<string, unknown>,
): Partial<ExperimentalChromeLocalTransportOptions> {
  if (!config) {
    return {};
  }

  const candidate =
    config as unknown as Partial<ExperimentalChromeLocalTransportOptions>;

  return {
    events: candidate.events,
    createSession: candidate.createSession,
    transformRequest: candidate.transformRequest,
    outputLanguage: candidate.outputLanguage,
  };
}

function isUnsupportedContext(): boolean {
  if (typeof window === 'undefined' && typeof self !== 'undefined') {
    return true;
  }
  if (typeof document === 'undefined') {
    return true;
  }
  return false;
}

function defaultTransformRequest(request: TransportRequest): PromptRequest {
  const input = request.input as NonNullable<TransportRequest['input']>;

  if (input.tools.length > 0) {
    throw new TransportError(
      'Chrome Prompt API transport does not support tool calls',
      {
        retryable: false,
        code: 'FEATURE_UNSUPPORTED',
      },
    );
  }

  const messages: PromptMessage[] = [];
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
    messages.push({ role: message.role, content });
  }

  const options: PromptOptions = {};
  const responseSchema = input.hashbrown?.responseSchema;
  if (responseSchema) {
    if (!isSupportedResponseConstraint(responseSchema)) {
      throw new TransportError(
        'Chrome Prompt API transport does not support the provided response schema.',
        { retryable: false, code: 'FEATURE_UNSUPPORTED' },
      );
    }
    options.responseConstraint = responseSchema;
  }

  return {
    messages,
    options,
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

interface PromptApiGlobal {
  LanguageModel?: LanguageModelGlobal;
}

interface DownloadProgressEvent extends Event {
  loaded?: number;
  total?: number;
}

function resolvePromptOutputLanguage(
  promptRequest: PromptRequest,
  fallback: SupportedOutputLanguage,
): SupportedOutputLanguage {
  const promptLang = (promptRequest.options as PromptOptions | undefined)
    ?.outputLanguage;

  if (promptLang && !SUPPORTED_OUTPUT_LANGUAGES.includes(promptLang)) {
    throw new TransportError(`Unsupported output language: ${promptLang}`, {
      retryable: false,
      code: 'FEATURE_UNSUPPORTED',
    });
  }

  return promptLang ?? fallback;
}

function resolveExpectedOutputs(
  outputLanguage: SupportedOutputLanguage,
  sessionOptions?: LanguageModelCreateOptions,
): ExpectedOutput[] | undefined {
  if (sessionOptions?.expectedOutputs) {
    return sessionOptions.expectedOutputs as ExpectedOutput[];
  }

  return [
    {
      type: 'text',
      languages: [outputLanguage],
    },
  ];
}

function buildAvailabilityOptions(
  sessionOptions: LanguageModelCreateOptions | undefined,
  outputLanguage: SupportedOutputLanguage,
): LanguageModelCreateOptions {
  const availabilityOptions: LanguageModelCreateOptions = {
    ...(sessionOptions ?? {}),
  };

  const expectedOutputs = resolveExpectedOutputs(
    outputLanguage,
    availabilityOptions,
  );

  if (expectedOutputs && !availabilityOptions.expectedOutputs) {
    availabilityOptions.expectedOutputs = expectedOutputs;
  }

  return availabilityOptions;
}
