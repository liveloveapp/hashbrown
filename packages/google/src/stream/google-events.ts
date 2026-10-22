import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  type FinishReason,
  ɵcreateTokenUsage,
  type ɵRunFinish,
} from '@hashbrownai/core';
import type {
  GenerateContentResponse,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';

/**
 * Inputs for mapping Google response chunks to canonical AG-UI events.
 *
 * @internal
 */
export interface MapGoogleEventsOptions {
  events: AsyncIterable<GenerateContentResponse>;
  messageId: string;
  signal?: AbortSignal;
}

const FINISH_REASONS: Readonly<Record<string, FinishReason>> = {
  STOP: 'stop',
  MAX_TOKENS: 'length',
  // Not in the SDK's enum, but some Gemini-compatible servers (aimock among
  // them) send it for a function-call turn.
  FUNCTION_CALL: 'tool_calls',
  SAFETY: 'content_filter',
  RECITATION: 'content_filter',
  BLOCKLIST: 'content_filter',
  PROHIBITED_CONTENT: 'content_filter',
  SPII: 'content_filter',
  IMAGE_SAFETY: 'content_filter',
  IMAGE_PROHIBITED_CONTENT: 'content_filter',
};

/**
 * What the stream reported about how the model stopped, collected across
 * chunks. Later chunks win.
 */
interface GoogleFinishState {
  readonly calledTools: boolean;
  readonly finishReason?: string;
  readonly finishMessage?: string;
  readonly blockReason?: string;
  readonly modelVersion?: string;
  readonly usage?: GenerateContentResponseUsageMetadata;
}

function sumCounts(
  ...counts: readonly (number | undefined)[]
): number | undefined {
  const known = counts.filter((count) => count !== undefined);
  return known.length
    ? known.reduce((total, count) => total + count, 0)
    : undefined;
}

function readFinish(state: GoogleFinishState): ɵRunFinish {
  const finishReason: FinishReason = state.blockReason
    ? 'content_filter'
    : state.finishReason === undefined
      ? 'other'
      : state.finishReason === 'STOP'
        ? state.calledTools
          ? 'tool_calls'
          : 'stop'
        : (FINISH_REASONS[state.finishReason] ?? 'other');
  const usage = ɵcreateTokenUsage({
    provider: 'google',
    model: state.modelVersion,
    inputTokens: sumCounts(
      state.usage?.promptTokenCount,
      state.usage?.toolUsePromptTokenCount,
    ),
    outputTokens: sumCounts(
      state.usage?.candidatesTokenCount,
      state.usage?.thoughtsTokenCount,
    ),
    totalTokens: state.usage?.totalTokenCount,
    reasoningTokens: state.usage?.thoughtsTokenCount,
    cachedInputTokens: state.usage?.cachedContentTokenCount,
  });
  return {
    finishReason,
    providerMetadata: {
      ...(state.finishReason ? { finishReason: state.finishReason } : {}),
      ...(state.finishMessage ? { finishMessage: state.finishMessage } : {}),
      ...(state.blockReason ? { blockReason: state.blockReason } : {}),
    },
    ...(usage ? { usage } : {}),
  };
}

/**
 * Maps Google response chunks to canonical AG-UI message events.
 *
 * A blocked prompt or a filtered, truncated or otherwise stopped candidate
 * ends normally; the reason is in the generator's return value.
 *
 * @param options - Google stream and AG-UI message identity.
 * @returns Canonical AG-UI events for the provider response; the generator's
 * return value is how the model stopped and the response's token usage, or
 * `undefined` when mapping stopped on abort.
 *
 * @internal
 */
export async function* mapGoogleEvents(
  options: MapGoogleEventsOptions,
): AsyncGenerator<AGUIEvent, ɵRunFinish | undefined> {
  let finish: GoogleFinishState = { calledTools: false };
  let textStarted = false;
  let reasoningId: string | undefined;
  let reasoningIndex = 0;
  let toolCallIndex = 0;
  const iterator = options.events[Symbol.asyncIterator]();
  let mappingFailed = false;
  let mappingError: unknown;
  let cleanupFailed = false;
  let cleanupError: unknown;

  try {
    while (!options.signal?.aborted) {
      const next = await iterator.next();
      if (next.done) {
        break;
      }

      const chunk = next.value;
      const candidates = chunk.candidates ?? [];
      const candidate =
        candidates.find((entry) => entry.index === 0) ??
        candidates.find((entry) => entry.index === undefined);
      finish = {
        ...finish,
        ...(candidate?.finishReason
          ? { finishReason: candidate.finishReason }
          : {}),
        ...(candidate?.finishMessage
          ? { finishMessage: candidate.finishMessage }
          : {}),
        ...(chunk.promptFeedback?.blockReason
          ? { blockReason: chunk.promptFeedback.blockReason }
          : {}),
        ...(chunk.modelVersion ? { modelVersion: chunk.modelVersion } : {}),
        ...(chunk.usageMetadata ? { usage: chunk.usageMetadata } : {}),
      };
      const parts = candidate?.content?.parts ?? [];
      for (const part of parts) {
        if (options.signal?.aborted) {
          return;
        }

        if (part.thought) {
          if (!reasoningId) {
            reasoningId = `${options.messageId}:reasoning:${reasoningIndex}`;
            reasoningIndex += 1;
            yield {
              type: EventType.REASONING_MESSAGE_START,
              messageId: reasoningId,
              role: 'reasoning',
              metadata: { google: { thought: true } },
            };
            if (options.signal?.aborted) {
              return;
            }
          }

          if (part.text) {
            yield {
              type: EventType.REASONING_MESSAGE_CONTENT,
              messageId: reasoningId,
              delta: part.text,
            };
            if (options.signal?.aborted) {
              return;
            }
          }

          if (part.thoughtSignature) {
            yield {
              type: EventType.REASONING_ENCRYPTED_VALUE,
              subtype: 'message',
              entityId: reasoningId,
              encryptedValue: part.thoughtSignature,
            };
          }
          continue;
        }

        if (
          part.thoughtSignature &&
          reasoningId &&
          !part.functionCall &&
          !part.text
        ) {
          yield {
            type: EventType.REASONING_ENCRYPTED_VALUE,
            subtype: 'message',
            entityId: reasoningId,
            encryptedValue: part.thoughtSignature,
          };
          continue;
        }

        if (reasoningId) {
          yield {
            type: EventType.REASONING_MESSAGE_END,
            messageId: reasoningId,
          };
          reasoningId = undefined;
          if (options.signal?.aborted) {
            return;
          }
        }

        if (part.functionCall) {
          const name = part.functionCall.name;
          if (!name) {
            throw new Error('Google returned a function call without a name');
          }

          const toolCallId =
            part.functionCall.id ??
            `${options.messageId}:tool:${toolCallIndex}`;
          toolCallIndex += 1;
          finish = { ...finish, calledTools: true };
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId,
            toolCallName: name,
            parentMessageId: options.messageId,
            metadata: { google: { functionCall: true } },
          };
          if (options.signal?.aborted) {
            return;
          }

          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId,
            delta: JSON.stringify(part.functionCall.args ?? {}),
          };
          if (options.signal?.aborted) {
            return;
          }

          if (part.thoughtSignature) {
            yield {
              type: EventType.REASONING_ENCRYPTED_VALUE,
              subtype: 'tool-call',
              entityId: toolCallId,
              encryptedValue: part.thoughtSignature,
            };
            if (options.signal?.aborted) {
              return;
            }
          }

          yield { type: EventType.TOOL_CALL_END, toolCallId };
          continue;
        }

        // A signature on a part without a function call belongs to that part,
        // not to an earlier call: Gemini sends function-call signatures on the
        // function-call part itself. The view model has nowhere to keep a
        // text-part signature, and Gemini does not require it on replay.
        if (!part.text) {
          continue;
        }

        if (!textStarted) {
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: options.messageId,
            role: 'assistant',
          };
          textStarted = true;
          if (options.signal?.aborted) {
            return;
          }
        }

        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: options.messageId,
          delta: part.text,
        };
      }
    }
  } catch (error: unknown) {
    mappingFailed = true;
    mappingError = error;
  } finally {
    try {
      await iterator.return?.();
    } catch (error: unknown) {
      cleanupFailed = true;
      cleanupError = error;
    }
  }

  if (mappingFailed) {
    throw mappingError;
  }
  if (cleanupFailed) {
    throw cleanupError;
  }

  if (options.signal?.aborted) {
    return;
  }

  if (reasoningId) {
    yield {
      type: EventType.REASONING_MESSAGE_END,
      messageId: reasoningId,
    };
    if (options.signal?.aborted) {
      return;
    }
  }

  if (textStarted) {
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: options.messageId,
    };
    if (options.signal?.aborted) {
      return;
    }
  }

  return readFinish(finish);
}
