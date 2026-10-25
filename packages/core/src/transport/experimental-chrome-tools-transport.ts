import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  chromeToolError,
  type ChromeToolMessage,
  chromeToolObject,
  type ChromeToolValue,
  prepareChromeToolDeclarations,
  prepareChromeToolMessages,
  validateChromeToolCalls,
} from './chrome-tool-messages';
import { createLocalTextEventStream } from './local-text-event-stream';
import { raceTransportOperationWithAbort } from './race-transport-operation-with-abort';
import { TransportError } from './transport-error';
import type { Transport, TransportFactory } from './transport';
import type { SupportedOutputLanguage } from './experimental-chrome-local-transport';

type Availability = ChromeToolsCapabilities['model']['availability'];
type NativeValue = Record<string, unknown>;
type NativeConstructor = new (init: object) => NativeValue;
/** Structural native session contract for experimental typed tool inference. @alpha */
export interface ChromeToolsSession {
  promptStreaming(
    input: readonly object[],
    options: { signal: AbortSignal; responseConstraint?: object },
  ): ReadableStream<unknown> | Promise<ReadableStream<unknown>>;
  destroy(): void | Promise<void>;
}
/** Exact native session options used for one authoritative tools run. @alpha */
export interface ChromeToolsSessionOptions {
  signal?: AbortSignal;
  initialPrompts?: readonly object[];
  tools: readonly { name: string; description: string; inputSchema: object }[];
  expectedInputs: readonly { type: string; languages?: readonly string[] }[];
  expectedOutputs: readonly { type: string; languages?: readonly string[] }[];
  monitor?: (monitor: {
    addEventListener(
      type: string,
      callback: (event: { loaded?: number; total?: number }) => void,
    ): void;
  }) => void;
}
/** Configuration for the experimental Chrome typed-tools transport. @alpha */
export interface ExperimentalChromeToolsTransportOptions {
  /** Finalize schema answers after unconstrained tool planning. Adds one terminal inference pass. */
  schemaFinalization?: 'after-tool-planning';
  /** Text language negotiated for both input and output. Defaults to English. */
  outputLanguage?: SupportedOutputLanguage;
  /** Bounds an entire session, including creation and inference; 1–1200000ms. */
  timeoutMs?: number;
  /** Optional session provider; native capability checks still apply. */
  createSession?: (
    options: ChromeToolsSessionOptions,
  ) => Promise<ChromeToolsSession>;
  events?: {
    /** Explicit application approval required before any model download. */
    downloadRequired?: (
      status: 'downloadable' | 'downloading',
    ) => void | Promise<void>;
    downloadProgress?: (percent: number) => void;
    sessionState?: (state: 'created' | 'destroyed') => void;
  };
}
/** Serializable current capabilities; interface support never verifies inference. @alpha */
export interface ChromeToolsCapabilities {
  runtime: { userAgent: string | null; secureContext: boolean | null };
  nativeInterface: {
    languageModel: boolean;
    constructors: boolean;
    toolsDictionary: boolean;
  };
  model: {
    availability:
      'available' | 'unavailable' | 'downloadable' | 'downloading' | 'unknown';
  };
  options: Pick<
    ChromeToolsSessionOptions,
    'tools' | 'expectedInputs' | 'expectedOutputs'
  >;
  adapter: {
    supported: boolean;
    reason: string | null;
    structuredOutput: boolean;
    schemaFinalization: 'after-tool-planning' | null;
    ui: false;
    media: false;
  };
  inference: 'unknown';
}
type Runtime = {
  LanguageModel?: {
    availability(options: object): Promise<unknown>;
    create(options: ChromeToolsSessionOptions): Promise<ChromeToolsSession>;
  };
  LanguageModelToolCall?: NativeConstructor;
  LanguageModelToolSuccess?: NativeConstructor;
  LanguageModelToolError?: NativeConstructor;
  navigator?: { userAgent?: string };
  isSecureContext?: boolean;
};
function runtime(): Runtime {
  return globalThis as unknown as Runtime;
}
function nativeOptions(
  language: SupportedOutputLanguage,
  tools: ChromeToolsSessionOptions['tools'],
): ChromeToolsCapabilities['options'] {
  if (!['en', 'es', 'ja', 'de', 'fr'].includes(language))
    throw chromeToolError('Unsupported native tools language.');
  const text = { type: 'text', languages: [language] };
  return {
    tools,
    expectedInputs: [text, { type: 'tool-call' }, { type: 'tool-response' }],
    expectedOutputs: [text, { type: 'tool-call' }],
  };
}
/** Checks exact modalities/declarations without downloading or running inference. @alpha */
export async function detectChromeToolsCapabilities(
  options: Pick<
    ExperimentalChromeToolsTransportOptions,
    'outputLanguage' | 'schemaFinalization'
  > = {},
  tools: ChromeToolsSessionOptions['tools'] = [],
): Promise<ChromeToolsCapabilities> {
  validateSchemaFinalization(options.schemaFinalization);
  const host = runtime();
  const nativeModel = host.LanguageModel;
  const ownedTools = prepareChromeToolDeclarations(
    tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
  );
  const exact = nativeOptions(options.outputLanguage ?? 'en', ownedTools);
  let toolsDictionary = false;
  let availability: Availability = 'unknown';
  const languageModel =
    typeof host.LanguageModel?.availability === 'function' &&
    typeof host.LanguageModel?.create === 'function';
  const constructors = [
    host.LanguageModelToolCall,
    host.LanguageModelToolSuccess,
    host.LanguageModelToolError,
  ].every((value) => typeof value === 'function');
  if (languageModel && nativeModel) {
    const probe = { ...exact };
    Object.defineProperty(probe, 'tools', {
      enumerable: true,
      get() {
        toolsDictionary = true;
        return ownedTools;
      },
    });
    try {
      const result = await nativeModel.availability(probe);
      const status =
        typeof result === 'string'
          ? result
          : (result as { status?: unknown } | null)?.status;
      if (
        ['available', 'unavailable', 'downloadable', 'downloading'].includes(
          status as string,
        )
      )
        availability = status as Availability;
    } catch {
      /* Detection is evidence, never an inference claim. */
    }
  }
  const supported =
    languageModel &&
    constructors &&
    toolsDictionary &&
    availability !== 'unknown' &&
    availability !== 'unavailable';
  return {
    runtime: {
      userAgent: host.navigator?.userAgent ?? null,
      secureContext: host.isSecureContext ?? null,
    },
    nativeInterface: { languageModel, constructors, toolsDictionary },
    model: { availability },
    options: exact,
    adapter: {
      supported,
      reason: supported
        ? null
        : 'Native typed tools interfaces or exact model options are unsupported.',
      structuredOutput: options.schemaFinalization === 'after-tool-planning',
      schemaFinalization: options.schemaFinalization ?? null,
      ui: false,
      media: false,
    },
    inference: 'unknown',
  };
}
function validateSchemaFinalization(policy: unknown): void {
  if (policy !== undefined && policy !== 'after-tool-planning')
    throw chromeToolError('Unsupported native schema finalization policy.');
}
function abortError() {
  return new TransportError('Native tools run aborted or timed out.', {
    code: 'PROMPT_API_ABORTED',
    retryable: false,
  });
}
function construct(
  value: ChromeToolValue,
  kind: 'tool-call' | 'tool-response',
): NativeValue {
  const host = runtime();
  const Constructor =
    kind === 'tool-call'
      ? host.LanguageModelToolCall
      : value.errorMessage !== undefined
        ? host.LanguageModelToolError
        : host.LanguageModelToolSuccess;
  if (!Constructor) throw chromeToolError('Missing native tool constructor.');
  const result = new Constructor({
    ...value,
    callID: value.callId,
    callId: value.callId,
  });
  const id = 'callID' in result ? result['callID'] : result['callId'];
  if (
    id !== value.callId ||
    result['name'] !== value.name ||
    ('callID' in result &&
      'callId' in result &&
      result['callID'] !== result['callId'])
  )
    throw chromeToolError('Native constructor changed tool identity.');
  return result;
}
function nativeMessages(messages: ChromeToolMessage[]): object[] {
  return messages.map((message) => ({
    ...message,
    content:
      typeof message.content === 'string'
        ? message.content
        : message.content.map((part) => ({
            ...part,
            value:
              part.type === 'text'
                ? part.value
                : construct(part.value as ChromeToolValue, part.type),
          })),
  }));
}
/** Creates a fresh owned Chrome native-tools session for every canonical run. @alpha */
export function experimental_chrome_tools(
  options: ExperimentalChromeToolsTransportOptions = {},
): TransportFactory {
  validateSchemaFinalization(options.schemaFinalization);
  const timeout = options.timeoutMs ?? 180000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 1200000)
    throw chromeToolError(
      'Native session timeout must be between 1 and 1200000ms.',
    );
  return (): Transport => ({
    name: 'ExperimentalChromeToolsTransport',
    async send(request) {
      const prepared = prepareChromeToolMessages(
        request.input,
        options.schemaFinalization === 'after-tool-planning',
      );
      const controller = new AbortController();
      const signal = AbortSignal.any([request.signal, controller.signal]);
      const timer = setTimeout(() => controller.abort(), timeout);
      let session: ChromeToolsSession | undefined;
      let destroyed = false;
      const destroy = async () => {
        clearTimeout(timer);
        if (session && !destroyed) {
          destroyed = true;
          // Native teardown can return a promise that never settles. Invoke it
          // exactly once and own its eventual rejection without blocking abort.
          void Promise.resolve(session.destroy())
            .then(() => options.events?.sessionState?.('destroyed'))
            .catch(() => undefined);
        }
      };
      try {
        const capabilities = await raceTransportOperationWithAbort(
          () => detectChromeToolsCapabilities(options, prepared.tools),
          signal,
          abortError,
        );
        if (!capabilities.adapter.supported)
          throw chromeToolError(
            capabilities.adapter.reason ?? 'Native tools unsupported.',
          );
        const status = capabilities.model.availability;
        if (status === 'downloadable' || status === 'downloading') {
          const downloadRequired = options.events?.downloadRequired;
          if (!downloadRequired)
            throw new TransportError(
              'Native model download requires explicit application approval.',
              { code: 'MODEL_DOWNLOAD_REQUIRED', retryable: false },
            );
          await raceTransportOperationWithAbort(
            () => downloadRequired(status),
            signal,
            abortError,
          );
        }
        const createOptions: ChromeToolsSessionOptions = {
          ...capabilities.options,
          initialPrompts: nativeMessages(
            prepared.messages.filter((message) => message.role === 'system'),
          ),
          signal,
          monitor: (monitor) =>
            monitor.addEventListener(
              'downloadprogress',
              ({ loaded, total }) => {
                if (typeof loaded === 'number')
                  options.events?.downloadProgress?.(
                    Math.round(
                      Math.min(
                        1,
                        Math.max(
                          0,
                          total && total > 0 ? loaded / total : loaded,
                        ),
                      ) * 100,
                    ),
                  );
              },
            ),
        };
        const nativeModel = runtime().LanguageModel;
        const create =
          options.createSession ??
          (nativeModel ? nativeModel.create.bind(nativeModel) : undefined);
        if (!create)
          throw chromeToolError('Native session creation is unsupported.');
        const creating = Promise.resolve()
          .then(() => create(createOptions))
          .then(async (value) => {
            session = value;
            if (signal.aborted) await destroy();
            else options.events?.sessionState?.('created');
            return value;
          });
        await raceTransportOperationWithAbort(
          () => creating,
          signal,
          abortError,
        );
        const ownedSession = session;
        if (!ownedSession)
          throw chromeToolError('Native session was not created.');
        const local = createLocalTextEventStream({
          input: request.input,
          signal,
          eventStream: true,
          destroy,
          start: async (streamSignal) => {
            const prompt = async (
              input: readonly object[],
              responseConstraint?: object,
            ) => {
              const pending = Promise.resolve(
                ownedSession.promptStreaming(input, {
                  signal: streamSignal,
                  ...(responseConstraint === undefined
                    ? {}
                    : { responseConstraint }),
                }),
              ).then((value) => {
                if (streamSignal.aborted)
                  void value.cancel().catch(() => undefined);
                return value;
              });
              const stream = await raceTransportOperationWithAbort(
                () => pending,
                streamSignal,
                abortError,
              );
              if (streamSignal.aborted) {
                void stream.cancel().catch(() => undefined);
                throw abortError();
              }
              return stream;
            };
            const schema = prepared.responseSchema;
            const planning = schema !== undefined && prepared.tools.length > 0;
            const stream = await prompt(
              nativeMessages(
                prepared.messages.filter(
                  (message) => message.role !== 'system',
                ),
              ),
              planning ? undefined : schema,
            );
            return adaptNativeStream(
              stream,
              prepared,
              request.input.runId,
              streamSignal,
              schema === undefined
                ? 'normal'
                : planning
                  ? 'planning'
                  : 'finalization',
              planning
                ? () =>
                    prompt(
                      [
                        {
                          role: 'user',
                          content:
                            'Return the final answer using the supplied response schema and the existing conversation and tool results, without calling tools. Return only the final answer.',
                        },
                      ],
                      schema,
                    )
                : undefined,
            );
          },
        });
        return {
          events: local.events,
          dispose: local.dispose,
          metadata: { source: 'chrome-native-tools', capabilities },
        };
      } catch (error) {
        controller.abort();
        await destroy();
        throw error;
      }
    },
  });
}
function adaptNativeStream(
  stream: ReadableStream<unknown>,
  prepared: ReturnType<typeof prepareChromeToolMessages>,
  runId: string,
  signal: AbortSignal,
  mode: 'normal' | 'planning' | 'finalization' = 'normal',
  finalize?: () => Promise<ReadableStream<unknown>>,
): ReadableStream<AGUIEvent> {
  let reader = stream.getReader();
  let outputBytes = 0;
  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      // Calling cancel closes the reader immediately; its underlying cleanup
      // promise is permitted to hang and must not prevent session destruction.
      try {
        void reader.cancel().catch(() => undefined);
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* The pending read owns its lock. */
        }
      }
    }
  };
  const events = (async function* (): AsyncGenerator<AGUIEvent> {
    const calls: unknown[] = [];
    const sequence: ({ text: string } | { call: number })[] = [];
    let textIndex = 0;
    let activeMessage: string | undefined;
    let chunks = 0;
    const textEvents = function* (text: string): Generator<AGUIEvent> {
      if (!activeMessage) {
        activeMessage = `${runId}:text:${textIndex++}`;
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: activeMessage,
          role: 'assistant',
        };
      }
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: activeMessage,
        delta: text,
      };
    };
    const endText = function* (): Generator<AGUIEvent> {
      if (activeMessage) {
        yield { type: EventType.TEXT_MESSAGE_END, messageId: activeMessage };
        activeMessage = undefined;
      }
    };
    const checkBounds = () => {
      if (
        outputBytes > 4 * 1024 * 1024 ||
        calls.length > 64 ||
        ++chunks > 65536
      )
        throw chromeToolError('Native turn exceeds output bounds.');
    };
    try {
      for (;;) {
        while (true) {
          const { done, value } = await raceTransportOperationWithAbort(
            () => reader.read(),
            signal,
            abortError,
          );
          if (done) break;
          if (typeof value === 'string') {
            outputBytes += new TextEncoder().encode(value).length;
            checkBounds();
            if (mode !== 'planning') {
              if (calls.length === 0) yield* textEvents(value);
              else sequence.push({ text: value });
            }
            continue;
          }
          if (mode === 'finalization')
            throw chromeToolError(
              'Schema finalization accepts only native text chunks.',
            );
          if (!value || typeof value !== 'object')
            throw chromeToolError('Malformed native stream chunk.');
          const chunk = value as Record<string, unknown>;
          if (
            chunk['type'] !== 'tool-call' ||
            !chunk['value'] ||
            typeof chunk['value'] !== 'object'
          )
            throw chromeToolError('Unsupported native stream chunk.');
          const original = chunk['value'] as Record<string, unknown>;
          if (
            typeof original['name'] !== 'string' ||
            !prepared.tools.some((tool) => tool.name === original['name'])
          )
            throw chromeToolError('Unknown native tool name.');
          for (const key of ['callID', 'callId']) {
            if (key in original && typeof original[key] !== 'string')
              throw chromeToolError('Invalid native call identifier.');
          }
          const call = {
            ...('callID' in original ? { callID: original['callID'] } : {}),
            ...('callId' in original ? { callId: original['callId'] } : {}),
            name: original['name'],
            arguments: chromeToolObject(original['arguments']),
          };
          outputBytes += new TextEncoder().encode(JSON.stringify(call)).length;
          sequence.push({ call: calls.length });
          calls.push(call);
          checkBounds();
          yield* endText();
        }
        yield* endText();
        const validated = validateChromeToolCalls(
          calls,
          prepared.tools.map((tool) => tool.name),
          prepared.historyIds,
        );
        if (mode === 'planning' && validated.length === 0 && finalize) {
          await close();
          const finalStream = await finalize();
          reader = finalStream.getReader();
          closed = false;
          mode = 'finalization';
          outputBytes = 0;
          chunks = 0;
          continue;
        }
        for (const part of sequence) {
          if (signal.aborted) throw abortError();
          if ('text' in part) yield* textEvents(part.text);
          else {
            yield* endText();
            const call = validated[part.call];
            yield {
              type: EventType.TOOL_CALL_START,
              toolCallId: call.callId,
              toolCallName: call.name,
            };
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: call.callId,
              delta: JSON.stringify(call.arguments),
            };
            yield { type: EventType.TOOL_CALL_END, toolCallId: call.callId };
          }
        }
        yield* endText();
        break;
      }
    } finally {
      await close();
    }
  })();
  return new ReadableStream({
    async pull(controller) {
      try {
        const result = await events.next();
        if (result.done) controller.close();
        else controller.enqueue(result.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await close();
      await events.return(undefined);
    },
  });
}
