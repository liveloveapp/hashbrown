import type { ImagePart } from '@ag-ui/core';
import { readHashbrownExtension } from './hashbrown-run-agent-input';
import { createLocalTextEventStream } from './local-text-event-stream';
import type { TransportFactory, TransportRequest } from './transport';
import { TransportError } from './transport-error';
import { createWebLlmRun } from './webllm-run';
import {
  preflightWebLlmImages,
  type PreparedWebLlmImages,
  prepareWebLlmImages,
} from './webllm-image-media';

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

/** Owned user message descriptor used to apply prepared content to a request snapshot. */
type WebLlmUserMessage = Extract<
  WebLlmRequest<WebLlmImageContent>['messages'][number],
  { role: 'user' }
>;

/**
 * Creates a local transport from an application-owned WebLLM engine.
 *
 * Supports text, structured output, and trusted UI without importing WebLLM.
 * Tools are rejected; images require an explicit media opt-in and resolver. Overlapping
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
      if (!request.input)
        throw new TransportError('Missing AG-UI run input', {
          retryable: false,
        });
      let imagePlan =
        options.media &&
        preflightWebLlmImages(request.input.messages, options.media);
      let textInput = options.media
        ? undefined
        : toWebLlmRequest(request, options.model);
      const imageMessages = new Map<WebLlmUserMessage, number>();
      let input: WebLlmRequest<WebLlmImageContent> | undefined =
        textInput ??
        toWebLlmRequest(request, options.model, !!imagePlan, imageMessages);
      let prepared: PreparedWebLlmImages | undefined;
      if (request.signal.aborted) throw aborted();
      const { engine } = options;
      const imageEngine = options.media ? options.engine : undefined;
      const textEngine = options.media ? undefined : options.engine;
      const run = createWebLlmRun({
        engine,
        release: () => {
          input = undefined;
          textInput = undefined;
          imagePlan = undefined;
          imageMessages.clear();
          const owned = prepared;
          prepared = undefined;
          void owned?.dispose().catch(() => undefined);
        },
        prepare: async (signal) => {
          if (imagePlan) {
            prepared = await prepareWebLlmImages(imagePlan, signal);
            if (signal.aborted) {
              await prepared.dispose();
              prepared = undefined;
              throw aborted();
            }
            if (!input) throw aborted();
            const contents = prepared.contents;
            input = {
              ...input,
              messages: input.messages.map((message) => {
                if (message.role !== 'user') return message;
                const source = imageMessages.get(message);
                return source !== undefined
                  ? { ...message, content: contents[source] ?? '' }
                  : message;
              }),
            };
            imageMessages.clear();
          }
        },
        create: () => {
          if (!input) throw aborted();
          if (imageEngine) return imageEngine.chat.completions.create(input);
          if (!textEngine || !textInput) throw aborted();
          return textEngine.chat.completions.create(textInput);
        },
      });
      const local = createLocalTextEventStream({
        input: request.input,
        signal: request.signal,
        destroy: run.cleanup,
        start: run.start,
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
): WebLlmRequest;
function toWebLlmRequest(
  request: TransportRequest,
  model: string | undefined,
  allowImages: boolean,
  imageMessages?: Map<WebLlmUserMessage, number>,
): WebLlmRequest<WebLlmImageContent>;
function toWebLlmRequest(
  request: TransportRequest,
  model?: string,
  allowImages = false,
  imageMessages?: Map<WebLlmUserMessage, number>,
): WebLlmRequest<WebLlmImageContent> {
  if (!request.input)
    throw new TransportError('Missing AG-UI run input', { retryable: false });
  if (request.input.tools.length > 0) throw unsupported();
  const messages: WebLlmRequest<WebLlmImageContent>['messages'] = [];
  const instructions: string[] = [];
  for (const message of request.input.messages) {
    if (message.role === 'activity' || message.role === 'reasoning') continue;
    if (
      message.role === 'tool' ||
      (message.role === 'assistant' && message.toolCalls?.length)
    )
      throw unsupported();
    if (message.content !== undefined && typeof message.content !== 'string') {
      if (
        allowImages &&
        message.role === 'user' &&
        Array.isArray(message.content)
      ) {
        const snapshot: WebLlmUserMessage = { role: 'user', content: '' };
        messages.push(snapshot);
        imageMessages?.set(snapshot, imageMessages.size);
        continue;
      }
      throw unsupported();
    }
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
