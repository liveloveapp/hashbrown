import { type AGUIEvent, EventType } from '@ag-ui/core';
import { createLocalTextEventStream } from './local-text-event-stream';
import { createWebLlmRun } from './webllm-run';
import {
  prepareWebLlmToolMessages,
  webLlmToolError,
  webLlmToolObject,
} from './webllm-tool-messages';
import type { TransportFactory } from './transport';
import { TransportError } from './transport-error';
import type { WebLlmEngine } from './experimental-webllm-transport';

/** Application-selected structured inference phase. @alpha */
export type WebLlmToolPhase =
  | { readonly type: 'tool'; readonly name: string }
  | { readonly type: 'finalize' };

/** Completed canonical tool call and its unmodified result text. @alpha */
export interface WebLlmToolPhaseResult {
  readonly callId: string;
  readonly name: string;
  /** Bounded JSON object owned and deeply frozen before selection. Validate nested values before consuming them. */
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly result: {
    readonly type: 'success' | 'error';
    readonly text: string;
  };
}

/** Deeply owned and frozen current user turn supplied to the selector. @alpha */
export interface WebLlmToolsTurnContext {
  readonly threadId: string;
  readonly runId: string;
  readonly userMessage: { readonly id: string; readonly content: string };
  readonly completedCalls: readonly WebLlmToolPhaseResult[];
}

/**
 * Configuration for application-controlled text-only structured tool phases.
 * Tool argument schemas use the Skillet-convertible closed-object subset and
 * reject format annotations, which Skillet does not validate at runtime.
 * Explicit types must be valid supported types; enum entries must all match
 * their explicit primitive type, including integer constraints.
 * @alpha
 */
export interface ExperimentalWebLlmToolsTransportOptions {
  /** Loaded text engine; the application owns model loading and unloading. */
  engine: WebLlmEngine;
  /** Selects an already loaded model. */
  model?: string;
  /** Synchronously selects one declared tool or final schema generation. A response schema is required. */
  toolPhase: (context: WebLlmToolsTurnContext) => WebLlmToolPhase;
  /** Structured tool phases accept text input only. */
  media?: never;
}

/**
 * Creates application-selected structured tool inference from a loaded text engine.
 * Buffers and validates one JSON argument object before exposing a canonical call;
 * finalization streams the original response schema. The application owns model
 * loading and selects each phase synchronously. This is a structured JSON protocol,
 * independent of native WebLLM tool calling. Runs sharing an engine are exclusive.
 * @alpha
 */
export function experimental_webllm_tools(
  options: ExperimentalWebLlmToolsTransportOptions,
): TransportFactory {
  return () => ({
    name: 'ExperimentalWebLlmStructuredToolsTransport',
    async send(request) {
      const { engine, model, toolPhase, media } = options;
      if (media !== undefined)
        throw webLlmToolError(
          'Structured tool phases require text-only options.',
        );
      const prepared = prepareWebLlmToolMessages(
        request.input,
        toolPhase,
        model,
      );
      if (request.signal.aborted) throw aborted();
      const selected = prepared.selectedTool;
      const run = createWebLlmRun({
        engine,
        create: () => engine.chat.completions.create(prepared.request),
        release: () => undefined,
        strictCompletion: !!selected,
      });
      const local = createLocalTextEventStream({
        input: prepared.lifecycleInput,
        signal: request.signal,
        destroy: run.cleanup,
        eventStream: !!selected,
        start: async (signal) => {
          const raw = await run.start(signal);
          if (!selected) return raw;
          try {
            const text = await readArguments(raw, signal);
            let args: Readonly<Record<string, unknown>>;
            try {
              args = webLlmToolObject(JSON.parse(text));
              selected.argumentSchema.validate(args);
            } catch {
              throw invalidArguments();
            }
            if (signal.aborted) throw aborted();
            const callId = crypto.randomUUID();
            if (
              typeof callId !== 'string' ||
              !callId ||
              callId.trim() !== callId ||
              prepared.historyIds.includes(callId)
            )
              throw invalidArguments();
            // A framework continuation can claim this engine as soon as END is
            // observed. Release the completed raw iterator before publishing calls.
            run.cleanup();
            const events: AGUIEvent[] = [
              {
                type: EventType.TOOL_CALL_START,
                toolCallId: callId,
                toolCallName: selected.name,
              },
              {
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: callId,
                delta: JSON.stringify(args),
              },
              { type: EventType.TOOL_CALL_END, toolCallId: callId },
            ];
            return new ReadableStream<AGUIEvent>({
              start(controller) {
                for (const event of events) controller.enqueue(event);
                controller.close();
              },
            });
          } finally {
            run.cleanup();
          }
        },
      });
      return {
        events: local.events,
        dispose: local.dispose,
        metadata: { source: 'webllm-structured-tools' },
      };
    },
  });
}

/** Collects bounded raw UTF-8, preserving surrogate pairs split across chunks. */
async function readArguments(
  stream: ReadableStream<string>,
  signal: AbortSignal,
): Promise<string> {
  const reader = stream.getReader();
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let bytes = 0;
  let high = '';
  let cleanupFailed = false;
  let cleanupError: unknown;
  const cancel = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) throw aborted();
    while (true) {
      const result = await reader.read();
      if (signal.aborted) throw aborted();
      if (result.done) break;
      const value = high + result.value;
      const last = value.charCodeAt(value.length - 1);
      const trailing = last >= 0xd800 && last <= 0xdbff;
      high = trailing ? value.slice(-1) : '';
      bytes += encoder.encode(trailing ? value.slice(0, -1) : value).length;
      if (bytes > 1024 * 1024) throw invalidArguments();
      chunks.push(result.value);
    }
    bytes += encoder.encode(high).length;
    if (bytes > 1024 * 1024) throw invalidArguments();
  } finally {
    signal.removeEventListener('abort', cancel);
    try {
      await reader.cancel();
    } catch (error) {
      cleanupFailed = true;
      cleanupError = error;
    }
    try {
      reader.releaseLock();
    } catch (error) {
      if (!cleanupFailed) {
        cleanupFailed = true;
        cleanupError = error;
      }
    }
  }
  // Reached only after successful buffering. A primary argument, provider or
  // abort failure instead propagates through cleanup without being replaced.
  if (cleanupFailed) throw cleanupError;
  return chunks.join('');
}

function invalidArguments(): TransportError {
  return new TransportError(
    'Local model returned invalid structured tool arguments',
    {
      code: 'WEBLLM_TOOL_ARGUMENTS_INVALID',
      retryable: false,
    },
  );
}

function aborted(): TransportError {
  return new TransportError('Prompt aborted', {
    code: 'PROMPT_API_ABORTED',
    retryable: false,
  });
}
