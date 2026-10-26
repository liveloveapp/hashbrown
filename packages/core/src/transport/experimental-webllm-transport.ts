import type { ImagePart } from '@ag-ui/core';
import { readHashbrownExtension } from './hashbrown-run-agent-input';
import { createLocalTextEventStream } from './local-text-event-stream';
import type { TransportFactory, TransportRequest } from './transport';
import { TransportError } from './transport-error';

/** Streaming request accepted by an injected WebLLM engine; user content defaults to text. @alpha */
export interface WebLlmRequest<TUserContent = string> {
  stream: true;
  model?: string;
  messages: (
    | { role: 'system' | 'assistant'; content: string }
    | { role: 'user'; content: TUserContent }
  )[];
  response_format?: { type: 'json_object'; schema: string };
}

/** The text and finish information consumed from WebLLM chunks. @alpha */
export interface WebLlmChunk {
  choices: {
    delta: { content?: string | null };
    finish_reason?: string | null;
  }[];
}

/**
 * Structural subset of WebLLM's engine API, including worker engines.
 * The application creates, loads, and eventually unloads the engine.
 * @alpha
 */
export interface WebLlmEngine<TUserContent = string> {
  chat: {
    completions: {
      create(
        request: WebLlmRequest<TUserContent>,
      ): Promise<AsyncIterable<WebLlmChunk>> | AsyncIterable<WebLlmChunk>;
    };
  };
  interruptGenerate(): void;
}

/** Configuration for application-owned local WebLLM inference. @alpha */
export interface ExperimentalWebLlmTransportOptions {
  /** Loaded engine; Hashbrown never loads or unloads its model. */
  engine: WebLlmEngine;
  /** Selects a model when the injected engine has multiple models loaded. */
  model?: string;
  /** Image input requires the image-specific engine contract and overload. */
  media?: never;
}

/** User content supported by the explicitly image-enabled WebLLM protocol. @alpha */
export type WebLlmImageContent =
  | string
  | (
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    )[];

/** Application-owned encoded image and its optional cleanup. @alpha */
export interface WebLlmImageResource {
  readonly blob: Blob;
  readonly dispose?: () => void | Promise<void>;
}

/** Resolves an image without implicit transport network access. @alpha */
export type WebLlmImageResolver = (
  part: ImagePart,
  context: { readonly signal: AbortSignal },
) => WebLlmImageResource | Promise<WebLlmImageResource>;

/** Bounds encoded and decoded image input. @alpha */
export interface WebLlmImagePolicy {
  /** Maximum encoded bytes per image; defaults to 10 MiB. */
  readonly maxBytes?: number;
  /** Maximum decoded pixels per image; defaults to 16 million. */
  readonly maxPixels?: number;
  /** Maximum image count across a run; defaults to eight. */
  readonly maxImages?: number;
}

/** Explicit image opt-in and application source resolution. @alpha */
export interface WebLlmImageMediaOptions {
  readonly images: WebLlmImagePolicy;
  readonly resolve: WebLlmImageResolver;
  /** Maximum encoded bytes across complete image history; defaults to 20 MiB. */
  readonly maxTotalBytes?: number;
}

/** Configuration asserting the application engine supports image input. @alpha */
export interface ExperimentalWebLlmImageTransportOptions {
  /** Loaded image-capable engine; Hashbrown never loads, resets or unloads it. */
  engine: {
    chat: {
      completions: {
        create: (
          request: WebLlmRequest<WebLlmImageContent>,
        ) => Promise<AsyncIterable<WebLlmChunk>> | AsyncIterable<WebLlmChunk>;
      };
    };
    interruptGenerate(): void;
  };
  /** Selects an already loaded model. */
  model?: string;
  readonly media: WebLlmImageMediaOptions;
}

// interruptGenerate affects an entire engine, so ownership spans transports.
const activeEngines = new WeakSet<WebLlmEngine>();

/**
 * Creates a local transport from an application-owned WebLLM engine.
 *
 * Supports text, structured output, and trusted UI without importing WebLLM.
 * Tools and multimodal messages are rejected before generation. Overlapping
 * runs sharing an engine fail with MODEL_BUSY; applications must also avoid
 * using that engine directly while a Hashbrown run owns it.
 * @alpha
 */
export function experimental_webllm(
  options: ExperimentalWebLlmTransportOptions,
): TransportFactory;
/** Creates an explicitly image-enabled transport for an application-owned engine. @alpha */
export function experimental_webllm(
  options: ExperimentalWebLlmImageTransportOptions,
): TransportFactory;
export function experimental_webllm(
  options:
    | ExperimentalWebLlmTransportOptions
    | ExperimentalWebLlmImageTransportOptions,
): TransportFactory {
  return () => ({
    name: 'ExperimentalWebLlmTransport',
    async send(request) {
      const input = toWebLlmRequest(request, options.model);
      if (request.signal.aborted) throw aborted();
      const { engine } = options;
      if (activeEngines.has(engine)) {
        throw new TransportError('The local engine is already generating', {
          code: 'MODEL_BUSY',
          retryable: false,
        });
      }
      activeEngines.add(engine);

      let pending: Promise<AsyncIterator<WebLlmChunk>> | undefined;
      let nextResult: Promise<IteratorResult<WebLlmChunk>> | undefined;
      let finished = false;
      let cancelled = false;
      let cleanupStarted = false;
      let removeAbortListener = () => undefined as void;
      const release = () => {
        activeEngines.delete(engine);
      };
      const cleanup = () => {
        if (cleanupStarted) return;
        cleanupStarted = true;
        cancelled = true;
        removeAbortListener();
        try {
          if (pending && !finished) engine.interruptGenerate();
        } finally {
          if (pending) {
            // WebLLM releases its model lock only after advancing past the last
            // chunk. Worker iterator.return() does not close its backend stream.
            // Keep ownership while draining, without delaying UI cancellation.
            void pending
              .then(async (iterator) => {
                let result = await nextResult;
                while (!result?.done) {
                  result = await iterator.next();
                }
              })
              .finally(release)
              .catch(() => undefined);
          } else {
            release();
          }
        }
      };

      const local = createLocalTextEventStream({
        input: request.input,
        signal: request.signal,
        destroy: cleanup,
        start: async (signal) => {
          signal.addEventListener('abort', cleanup, { once: true });
          removeAbortListener = () =>
            signal.removeEventListener('abort', cleanup);
          if (signal.aborted) {
            cleanup();
            throw aborted();
          }
          // Promise.resolve().then also owns synchronous engine exceptions.
          pending = Promise.resolve()
            .then(() => {
              if (cancelled) throw aborted();
              return engine.chat.completions.create(input);
            })
            .then((stream) => stream[Symbol.asyncIterator]());
          let iterator: AsyncIterator<WebLlmChunk>;
          try {
            iterator = await pending;
          } catch (error) {
            throw engineError(error);
          }
          if (cancelled) throw aborted();
          return new ReadableStream<string>({
            async pull(controller) {
              try {
                while (!cancelled) {
                  nextResult = Promise.resolve().then(() => iterator.next());
                  const result = await nextResult;
                  if (cancelled) return;
                  if (result.done) {
                    finished = true;
                    controller.close();
                    return;
                  }
                  const choice = result.value.choices[0];
                  if (choice?.finish_reason === 'length') {
                    throw new TransportError(
                      'Local model output was truncated',
                      { code: 'WEBLLM_OUTPUT_TRUNCATED', retryable: false },
                    );
                  }
                  const content = choice?.delta.content;
                  if (content) {
                    controller.enqueue(content);
                    return;
                  }
                }
              } catch (error) {
                if (!cancelled) controller.error(engineError(error));
              }
            },
            cancel: cleanup,
          });
        },
      });
      return {
        events: local.events,
        dispose: local.dispose,
        metadata: { source: 'webllm' },
      };
    },
  });
}

function toWebLlmRequest(
  request: TransportRequest,
  model?: string,
): WebLlmRequest {
  if (!request.input)
    throw new TransportError('Missing AG-UI run input', { retryable: false });
  if (request.input.tools.length > 0) throw unsupported();
  const messages: WebLlmRequest['messages'] = [];
  const instructions: string[] = [];
  for (const message of request.input.messages) {
    if (message.role === 'activity' || message.role === 'reasoning') continue;
    if (
      message.role === 'tool' ||
      (message.role === 'assistant' && message.toolCalls?.length)
    )
      throw unsupported();
    if (message.content !== undefined && typeof message.content !== 'string')
      throw unsupported();
    const content = message.content ?? '';
    if (message.role === 'system' || message.role === 'developer')
      instructions.push(content);
    else messages.push({ role: message.role, content });
  }
  const schema = readHashbrownExtension(request.input)?.responseSchema;
  return {
    stream: true,
    ...(model === undefined ? {} : { model }),
    messages: [
      ...(instructions.length
        ? [{ role: 'system' as const, content: instructions.join('\n\n') }]
        : []),
      ...messages,
    ],
    ...(schema
      ? {
          response_format: {
            type: 'json_object',
            schema: JSON.stringify(schema),
          } as const,
        }
      : {}),
  };
}

function unsupported(): TransportError {
  return new TransportError(
    'WebLLM transport requires text messages without tool calls',
    { code: 'FEATURE_UNSUPPORTED', retryable: false },
  );
}

function aborted(): TransportError {
  return new TransportError('Prompt aborted', {
    code: 'PROMPT_API_ABORTED',
    retryable: false,
  });
}

function engineError(error: unknown): TransportError {
  return error instanceof TransportError
    ? error
    : new TransportError(
        error instanceof Error ? error.message : String(error),
        { code: 'WEBLLM_ENGINE_ERROR', retryable: false },
      );
}
