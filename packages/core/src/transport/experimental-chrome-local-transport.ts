import {
  type ChromePromptContent,
  type ChromePromptMediaOptions,
  prepareChromePromptMedia,
  type PreparedChromePromptMedia,
} from './chrome-prompt-media';
import { readHashbrownExtension } from './hashbrown-run-agent-input';
import {
  type DetectionResult,
  type Transport,
  type TransportFactory,
  type TransportRequest,
  type TransportResponse,
} from './transport';
import { createLocalTextEventStream } from './local-text-event-stream';
import { raceTransportOperationWithAbort } from './race-transport-operation-with-abort';
import { TransportError } from './transport-error';

const PROMPT_API_SOURCE = 'chrome-prompt-api';
/** Text output languages currently supported by Chrome's Prompt API. @alpha */
export type SupportedOutputLanguage = 'en' | 'es' | 'ja' | 'de' | 'fr';

const SUPPORTED_OUTPUT_LANGUAGES: SupportedOutputLanguage[] = [
  'en',
  'es',
  'ja',
  'de',
  'fr',
];
/**
 * Message format accepted by the Chrome Prompt API.
 * @alpha
 */
export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | readonly ChromePromptContent[];
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
  /** Explicitly enables bounded user media; cannot be combined with transformRequest. */
  media?: ChromePromptMediaOptions;
  transformRequest?: (request: TransportRequest) => PromptRequest;
  events?: {
    downloadRequired?: (
      status: LanguageModelAvailabilityStatus,
    ) => Promise<void> | void;
    downloadProgress?: (percent: number) => void;
    availability?: (status: LanguageModelAvailabilityStatus) => void;
    sessionState?: (state: 'created' | 'destroyed' | 'error') => void;
  };
  createSession?: (
    options?: LanguageModelCreateOptions,
  ) => Promise<LanguageModelSession>;
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
  monitor?: (monitor: EventTarget) => void;
  initialPrompts?: PromptMessage[];
  expectedOutputs?: ExpectedOutput[];
  expectedInputs?: ExpectedOutput[];
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
  initialization: string;
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
  ) => Promise<LanguageModelAvailabilityStatus | LanguageModelAvailability>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

/** Owns cancellation and completion for one explicitly enabled media run. */
interface ChromeMediaRun {
  controller: AbortController;
  dispose?: () => void | Promise<void>;
  done: Promise<void>;
  complete(): void;
}

/**
 * Experimental transport that targets the Chrome Prompt API.
 * @alpha
 */
export class ExperimentalChromeLocalTransport implements Transport {
  readonly name = 'ExperimentalChromeLocalTransport';
  private readonly mediaRuns = new Set<ChromeMediaRun>();
  private sessionRecord?: LanguageModelSessionRecord;
  private readonly sessionRecords = new Set<LanguageModelSessionRecord>();
  private readonly sessionDestructionPromises = new Set<Promise<void>>();

  constructor(
    private readonly options: ExperimentalChromeLocalTransportOptions,
  ) {}

  async send(request: TransportRequest): Promise<TransportResponse> {
    if (!this.options.media || !request.input)
      return this.sendPrepared(request);
    if (this.options.transformRequest) {
      throw new TransportError(
        'Chrome media input cannot be combined with a custom transformRequest.',
        {
          retryable: false,
          code: 'FEATURE_UNSUPPORTED',
        },
      );
    }
    if (
      request.input.tools.length > 0 ||
      request.input.messages.some(
        (message) =>
          message.role === 'tool' ||
          (message.role === 'assistant' && message.toolCalls?.length),
      )
    ) {
      throw new TransportError(
        'Chrome Prompt API transport does not support tool calls or tool history',
        {
          retryable: false,
          code: 'FEATURE_UNSUPPORTED',
        },
      );
    }
    let complete!: () => void;
    const run: ChromeMediaRun = {
      controller: new AbortController(),
      done: new Promise<void>((resolve) => {
        complete = resolve;
      }),
      complete: () => {
        this.mediaRuns.delete(run);
        complete();
      },
    };
    this.mediaRuns.add(run);
    const scoped = {
      ...request,
      signal: AbortSignal.any([request.signal, run.controller.signal]),
    };
    let prepared: PreparedChromePromptMedia | undefined;
    try {
      prepared = await prepareChromePromptMedia(
        request.input.messages,
        this.options.media,
        scoped.signal,
      );
      run.dispose = prepared.dispose;
      return await this.sendPrepared(scoped, prepared, run);
    } catch (error) {
      await prepared?.dispose().catch(() => undefined);
      run.complete();
      throw error;
    }
  }

  private async sendPrepared(
    request: TransportRequest,
    prepared?: PreparedChromePromptMedia,
    mediaRun?: ChromeMediaRun,
  ): Promise<TransportResponse> {
    if (!request.input) {
      throw new TransportError('Missing AG-UI run input', {
        retryable: false,
      });
    }

    const languageModel = await this.getLanguageModel();
    const transformRequest =
      this.options.transformRequest ??
      ((value) => defaultTransformRequest(value, prepared));

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
      ...(prepared
        ? {
            sessionOptions: {
              ...transformedPromptRequest.sessionOptions,
              expectedInputs: prepared.inputTypes.map((type) =>
                type === 'text' || type === 'audio'
                  ? {
                      type,
                      languages: [
                        ...new Set<SupportedOutputLanguage>(
                          this.options.media?.inputLanguages ?? ['en'],
                        ),
                      ],
                    }
                  : { type },
              ),
            },
          }
        : {}),
      options: {
        ...transformedPromptRequest.options,
        outputLanguage: resolvedPromptOutputLanguage,
      },
    };

    if (prepared && typeof languageModel?.availability !== 'function') {
      throw new TransportError(
        'Chrome media input requires checkable native modality availability.',
        {
          retryable: false,
          code: 'FEATURE_UNSUPPORTED',
        },
      );
    }
    const availability =
      languageModel && (!this.options.createSession || prepared)
        ? await this.ensureAvailability(
            languageModel,
            promptRequest,
            resolvedPromptOutputLanguage,
            request.signal,
            Boolean(prepared),
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
      destroy: async () => {
        try {
          await this.releaseSession(sessionLease);
        } finally {
          try {
            await prepared?.dispose();
          } finally {
            mediaRun?.complete();
          }
        }
      },
    });

    if (mediaRun) mediaRun.dispose = localStream.dispose;

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
    const activeMedia = [...this.mediaRuns];
    activeMedia.forEach((run) => run.controller.abort());
    const mediaResults = await Promise.allSettled(
      activeMedia.map(async (run) => {
        try {
          await run.dispose?.();
        } finally {
          await run.done;
        }
      }),
    );
    const mediaFailure = mediaResults.find(
      (result) => result.status === 'rejected',
    );
    const destructionPromises = new Set(this.sessionDestructionPromises);
    if (this.sessionRecords.size === 0 && destructionPromises.size === 0) {
      this.options.events?.sessionState?.('destroyed');
      if (mediaFailure?.status === 'rejected') throw mediaFailure.reason;
      return;
    }
    for (const sessionRecord of this.sessionRecords) {
      const destruction =
        sessionRecord.destructionPromise ??
        sessionRecord.promise.then((session) =>
          this.destroySessionRecord(sessionRecord, session),
        );
      destructionPromises.add(destruction);
    }

    const results = await Promise.allSettled(destructionPromises);
    const failure =
      results.find((result) => result.status === 'rejected') ?? mediaFailure;
    if (failure) {
      throw failure.reason;
    }
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
    signal: AbortSignal,
    requireMediaCapability = false,
  ): Promise<LanguageModelAvailabilityStatus> {
    if (!languageModel.availability) {
      return 'available';
    }
    const checkAvailability = languageModel.availability;

    const availabilityOptions = buildAvailabilityOptions(
      promptRequest.sessionOptions,
      outputLanguage,
    );

    const result = await raceTransportOperationWithAbort(
      () => checkAvailability.call(languageModel, availabilityOptions),
      signal,
      createPromptAbortError,
    );

    const availability =
      typeof result === 'string' ? { status: result } : result;
    if (
      requireMediaCapability &&
      (!availability ||
        !['available', 'unavailable', 'downloadable', 'downloading'].includes(
          availability.status,
        ))
    ) {
      throw new TransportError(
        'Chrome returned an unknown media availability result.',
        { retryable: false, code: 'FEATURE_UNSUPPORTED' },
      );
    }
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
      if (
        requireMediaCapability &&
        typeof this.options.events?.downloadRequired !== 'function'
      ) {
        throw new TransportError(
          'Chrome media requires an explicit downloadRequired handler before downloading a model.',
          { retryable: false, code: 'MODEL_DOWNLOAD_REQUIRED' },
        );
      }
      await raceTransportOperationWithAbort(
        () => this.options.events?.downloadRequired?.(availability.status),
        signal,
        createPromptAbortError,
      );
    }

    return availability.status;
  }

  private async acquireSession(
    languageModel: LanguageModelGlobal | undefined,
    signal: AbortSignal,
    promptRequest: PromptRequest,
    outputLanguage: SupportedOutputLanguage,
  ): Promise<LanguageModelSessionLease> {
    if (signal.aborted) {
      throw createPromptAbortError();
    }

    const sessionRecord = this.getSessionRecord(
      languageModel,
      signal,
      promptRequest,
      outputLanguage,
    );
    sessionRecord.owners += 1;

    let session: LanguageModelSession;
    try {
      session = await raceTransportOperationWithAbort(
        () => sessionRecord.promise,
        signal,
        createPromptAbortError,
      );
    } catch (error) {
      sessionRecord.owners = Math.max(0, sessionRecord.owners - 1);
      if (isPromptAbortError(error)) {
        this.abandonSessionRecord(sessionRecord);
      }
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
    const initialization = JSON.stringify({
      ...promptRequest.sessionOptions,
      expectedOutputs: resolveExpectedOutputs(
        outputLanguage,
        promptRequest.sessionOptions,
      ),
    });
    if (
      !this.options.media &&
      this.sessionRecord &&
      !this.sessionRecord.destructionPromise &&
      this.sessionRecord.initialization === initialization
    ) {
      return this.sessionRecord;
    }

    let promise: Promise<LanguageModelSession>;

    if (this.options.createSession) {
      promise = this.options.createSession(
        this.buildCreateOptions(signal, promptRequest, outputLanguage),
      );
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

    const sessionRecord = { promise, initialization, owners: 0 };
    this.sessionRecord = sessionRecord;
    this.sessionRecords.add(sessionRecord);
    void promise.catch(() => {
      this.sessionRecords.delete(sessionRecord);
      if (this.sessionRecord === sessionRecord) {
        this.sessionRecord = undefined;
      }
    });

    return sessionRecord;
  }

  private abandonSessionRecord(record: LanguageModelSessionRecord): void {
    if (this.sessionRecord === record) {
      this.sessionRecord = undefined;
    }

    const abandonmentPromise = record.promise.then(
      async (session) => {
        if (record.owners === 0) {
          await this.destroySessionRecord(record, session);
        }
      },
      (error) => Promise.reject(error),
    );
    this.trackSessionDestruction(abandonmentPromise);
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
        this.sessionRecords.delete(record);
        if (this.sessionRecord === record) {
          this.sessionRecord = undefined;
        }
      }
    })();
    const destructionPromise = record.destructionPromise;
    this.trackSessionDestruction(destructionPromise);

    return destructionPromise;
  }

  private trackSessionDestruction(promise: Promise<void>): void {
    this.sessionDestructionPromises.add(promise);
    void promise.then(
      () => this.sessionDestructionPromises.delete(promise),
      () => this.sessionDestructionPromises.delete(promise),
    );
  }

  private buildCreateOptions(
    signal: AbortSignal,
    promptRequest: PromptRequest,
    outputLanguage: SupportedOutputLanguage,
  ): LanguageModelCreateOptions {
    const userMonitor = promptRequest.sessionOptions?.monitor;
    const monitor =
      userMonitor || this.options.events?.downloadProgress
        ? (downloadMonitor: EventTarget) => {
            userMonitor?.(downloadMonitor);
            downloadMonitor.addEventListener('downloadprogress', (event) => {
              const { loaded, total } = event as DownloadProgressEvent;
              if (typeof loaded === 'number') {
                const fraction =
                  typeof total === 'number' && total > 0
                    ? loaded / total
                    : loaded;
                this.options.events?.downloadProgress?.(
                  Math.round(Math.min(1, Math.max(0, fraction)) * 100),
                );
              }
            });
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

    return {
      ...sessionOptions,
      signal,
      monitor,
    };
  }

  private async createLanguageModelSession(
    languageModel: LanguageModelGlobal,
    signal: AbortSignal,
    promptRequest: PromptRequest,
    outputLanguage: SupportedOutputLanguage,
  ) {
    try {
      const session = await languageModel.create(
        this.buildCreateOptions(signal, promptRequest, outputLanguage),
      );
      this.options.events?.sessionState?.('created');
      return session;
    } catch (err) {
      this.options.events?.sessionState?.('error');
      throw err;
    }
  }
}

function createPromptAbortError(): TransportError {
  return new TransportError('Prompt aborted', {
    retryable: false,
    code: 'PROMPT_API_ABORTED',
  });
}

function isPromptAbortError(error: unknown): boolean {
  return error instanceof TransportError && error.code === 'PROMPT_API_ABORTED';
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
    const result = await languageModel.availability(
      buildAvailabilityOptions(sessionOptions, opts?.outputLanguage ?? 'en'),
    );
    const availability =
      typeof result === 'string' ? { status: result } : result;
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
 * Creates an experimental Chrome Prompt API transport factory.
 * @alpha
 */
export const experimental_chrome = createExperimentalChromeLocalTransport;

function isUnsupportedContext(): boolean {
  if (typeof window === 'undefined' && typeof self !== 'undefined') {
    return true;
  }
  if (typeof document === 'undefined') {
    return true;
  }
  return false;
}

function defaultTransformRequest(
  request: TransportRequest,
  prepared?: PreparedChromePromptMedia,
): PromptRequest {
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
  const instructions: string[] = [];
  for (const message of input.messages) {
    if (
      message.role === 'tool' ||
      (message.role === 'assistant' && message.toolCalls?.length)
    ) {
      throw new TransportError(
        'Chrome Prompt API transport does not support tool history',
        { retryable: false, code: 'FEATURE_UNSUPPORTED' },
      );
    }
    if (
      message.role !== 'system' &&
      message.role !== 'developer' &&
      message.role !== 'user' &&
      message.role !== 'assistant'
    ) {
      continue;
    }
    const mediaContent = prepared?.contents.get(message);
    if (
      message.content !== undefined &&
      typeof message.content !== 'string' &&
      !mediaContent
    ) {
      throw new TransportError(
        'Chrome local transport requires text messages',
        {
          retryable: false,
          code: 'FEATURE_UNSUPPORTED',
        },
      );
    }
    const content =
      mediaContent ??
      (typeof message.content === 'string' ? message.content : '');
    if (message.role === 'system' || message.role === 'developer') {
      if (typeof content !== 'string')
        throw new TransportError('System instructions must be text.', {
          retryable: false,
          code: 'FEATURE_UNSUPPORTED',
        });
      instructions.push(content);
    } else {
      messages.push({ role: message.role, content });
    }
  }

  const options: PromptOptions = {};
  const responseSchema = readHashbrownExtension(input)?.responseSchema;
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
    sessionOptions:
      instructions.length > 0
        ? {
            initialPrompts: [
              { role: 'system', content: instructions.join('\n\n') },
            ],
          }
        : undefined,
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
