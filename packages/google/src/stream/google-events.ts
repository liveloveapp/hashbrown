import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import {
  type FinishReason,
  ɵANSWER_METADATA_KEY,
  ɵcreateTokenUsage,
  type ɵRunFinish,
  ɵTOOL_STEP_METADATA_KEY,
} from '@hashbrownai/core';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';

import {
  captureGoogleNativeChunk,
  createGoogleHistoryFooter,
  createGoogleNativeCapture,
  googleMarker,
} from './google-history';
import {
  type GoogleProviderCall,
  googleRunningStep,
  matchGoogleProviderResult,
  readGoogleProviderCall,
  readGoogleProviderResult,
} from './google-tools';
import {
  addGoogleToolSources,
  createGoogleGroundingState,
  foldGoogleGrounding,
  foldGoogleSearchSuggestions,
} from './google-grounding';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pendingGoogleCalls(
  options: MapGoogleEventsOptions,
): Map<string, GoogleProviderCall> {
  const calls = new Map<string, GoogleProviderCall>();
  const canonicalCalls = (options.inputMessages ?? []).flatMap((message) =>
    message.role === 'assistant' ? (message.toolCalls ?? []) : [],
  );
  const contents = options.requestOptions?.contents;
  if (Array.isArray(contents))
    for (const content of contents) {
      if (!record(content) || !Array.isArray(content['parts'])) continue;
      for (const part of content['parts']) {
        const invocation = canonicalCalls.find((invocation) => {
          const native = googleMarker(invocation.metadata)?.['nativePart'];
          return (
            native !== undefined &&
            JSON.stringify(native) === JSON.stringify(part)
          );
        });
        const step = invocation?.metadata?.[ɵTOOL_STEP_METADATA_KEY];
        const call = readGoogleProviderCall(
          part,
          invocation?.id ?? `history:code:${calls.size}`,
          record(step) && typeof step['startedAt'] === 'number'
            ? step['startedAt']
            : undefined,
        );
        if (call) calls.set(call.id, call);
        const matched = matchGoogleProviderResult(part, [...calls.values()]);
        if (matched && readGoogleProviderResult(matched, part))
          calls.delete(matched.id);
      }
    }
  for (const invocation of canonicalCalls) {
    const step = invocation.metadata?.[ɵTOOL_STEP_METADATA_KEY];
    if (
      !record(step) ||
      step['provider'] !== 'google' ||
      step['kind'] !== 'provider' ||
      step['status'] !== 'running'
    )
      continue;
    const call = readGoogleProviderCall(
      googleMarker(invocation.metadata)?.['nativePart'],
      invocation.id,
      typeof step['startedAt'] === 'number' ? step['startedAt'] : undefined,
    );
    if (call) calls.set(call.id, call);
  }
  for (const message of options.inputMessages ?? [])
    if (message.role === 'tool') calls.delete(message.toolCallId);
  return calls;
}

/**
 * Inputs for mapping Google response chunks to canonical AG-UI events.
 *
 * @internal
 */
export interface MapGoogleEventsOptions {
  events: AsyncIterable<GenerateContentResponse>;
  messageId: string;
  signal?: AbortSignal;
  /** Canonical context for pending provider calls and native history. */
  inputMessages?: readonly Message[];
  /** The actual transformed native request. */
  requestOptions?: GenerateContentParameters;
  /** Whether this stream uses Vertex AI. */
  vertexai?: boolean;
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
  let chunkIndex = -1;
  let responseId = `${options.messageId}:response`;
  let nativeResponseId: string | undefined;
  let canonicalIdentityEstablished = false;
  let capture = createGoogleNativeCapture();
  let grounding = createGoogleGroundingState(responseId);
  let annotations = foldGoogleGrounding(grounding, undefined).annotations;
  const represented = new Set<string>();
  const reasoningIds: string[] = [];
  const resultIds: string[] = [];
  const calls = pendingGoogleCalls(options);
  const seenCalls = new Set([
    ...calls.keys(),
    ...(options.inputMessages ?? []).flatMap((message) =>
      message.role === 'assistant'
        ? (message.toolCalls ?? []).map((call) => call.id)
        : [],
    ),
  ]);
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
      chunkIndex += 1;
      if (chunk.responseId) {
        if (nativeResponseId && nativeResponseId !== chunk.responseId)
          throw new Error('Google response identity changed during streaming');
        nativeResponseId = chunk.responseId;
      }
      const candidates = chunk.candidates ?? [];
      const candidate =
        candidates.find((entry) => entry.index === 0) ??
        candidates.find((entry) => entry.index === undefined);
      if (candidate && !canonicalIdentityEstablished) {
        canonicalIdentityEstablished = true;
        responseId = nativeResponseId ?? responseId;
        grounding = { ...grounding, responseId };
      }
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
      capture = captureGoogleNativeChunk(
        capture,
        {
          content: candidate?.content,
          groundingMetadata: candidate?.groundingMetadata,
          urlContextMetadata: candidate?.urlContextMetadata,
        },
        chunkIndex,
      );
      const folded = foldGoogleGrounding(
        grounding,
        candidate?.groundingMetadata,
        candidate?.urlContextMetadata,
      );
      grounding = folded.state;
      annotations = folded.annotations;
      if (candidate?.groundingMetadata || candidate?.urlContextMetadata) {
        yield {
          type: EventType.RAW,
          source: 'google',
          event: {
            responseId,
            chunkIndex,
            ...(candidate.groundingMetadata
              ? { groundingMetadata: capture.groundingMetadata.at(-1)?.value }
              : {}),
            ...(candidate.urlContextMetadata
              ? { urlContextMetadata: capture.urlContextMetadata.at(-1)?.value }
              : {}),
          },
        };
        if (options.signal?.aborted) return;
      }
      const parts = candidate?.content?.parts ?? [];
      for (const [partIndex, part] of parts.entries()) {
        const metadata = {
          google: {
            responseId,
            chunkIndex,
            partIndex,
            nativePart: capture.contents.at(-1)?.parts?.[partIndex],
          },
        };
        if (options.signal?.aborted) {
          return;
        }

        if (part.thought) {
          if (!reasoningId) {
            reasoningId = `${options.messageId}:reasoning:${reasoningIndex}`;
            reasoningIndex += 1;
            reasoningIds.push(reasoningId);
            represented.add(reasoningId);
            yield {
              type: EventType.REASONING_MESSAGE_START,
              messageId: reasoningId,
              role: 'reasoning',
              metadata: { google: { ...metadata.google, thought: true } },
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
          !part.toolCall &&
          !part.toolResponse &&
          !part.executableCode &&
          !part.codeExecutionResult &&
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

        const providerCall = readGoogleProviderCall(
          part,
          `${options.messageId}:provider:${chunkIndex}:${partIndex}`,
          Date.now(),
        );
        if (providerCall && !seenCalls.has(providerCall.id)) {
          seenCalls.add(providerCall.id);
          calls.set(providerCall.id, providerCall);
          represented.add(options.messageId);
          const providerMetadata = {
            ...metadata,
            [ɵTOOL_STEP_METADATA_KEY]: googleRunningStep(providerCall),
          };
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: providerCall.id,
            toolCallName: providerCall.name,
            parentMessageId: options.messageId,
            metadata: providerMetadata,
          };
          if (options.signal?.aborted) return;
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: providerCall.id,
            delta: JSON.stringify(providerCall.args),
          };
          if (options.signal?.aborted) return;
          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: providerCall.id,
            metadata: providerMetadata,
          };
          if (options.signal?.aborted) return;
          continue;
        }
        const matched = matchGoogleProviderResult(part, [...calls.values()]);
        const result = matched && readGoogleProviderResult(matched, part);
        if (matched && result) {
          calls.delete(matched.id);
          const messageId = `${options.messageId}:provider-result:${chunkIndex}:${partIndex}`;
          represented.add(messageId);
          resultIds.push(messageId);
          grounding = addGoogleToolSources(grounding, result.step.sources);
          const folded = foldGoogleGrounding(grounding, undefined);
          grounding = folded.state;
          annotations = folded.annotations;
          yield {
            type: EventType.TOOL_CALL_RESULT,
            messageId,
            toolCallId: matched.id,
            content: result.content,
            metadata: { ...metadata, [ɵTOOL_STEP_METADATA_KEY]: result.step },
          };
          if (options.signal?.aborted) return;
        }
        if (part.toolResponse) {
          const folded = foldGoogleSearchSuggestions(
            grounding,
            part.toolResponse.response,
          );
          grounding = folded.state;
          annotations = folded.annotations;
        }
        if (
          providerCall ||
          part.toolCall ||
          part.toolResponse ||
          part.executableCode ||
          part.codeExecutionResult
        ) {
          if (!result)
            yield {
              type: EventType.RAW,
              source: 'google',
              event: { ...metadata.google },
            };
          if (options.signal?.aborted) return;
          continue;
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
          represented.add(options.messageId);
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId,
            toolCallName: name,
            parentMessageId: options.messageId,
            metadata: { google: { ...metadata.google, functionCall: true } },
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

          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId,
            metadata: { google: { ...metadata.google, functionCall: true } },
          };
          continue;
        }

        // Opaque and empty signed parts remain available in native capture
        // even when they do not create a canonical text message.
        if (!part.text) {
          yield {
            type: EventType.RAW,
            source: 'google',
            event: { ...metadata.google },
          };
          continue;
        }

        if (!textStarted) {
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: options.messageId,
            role: 'assistant',
            metadata,
          };
          textStarted = true;
          represented.add(options.messageId);
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

  const hasAnnotations = Boolean(
    annotations.sources?.length ||
    annotations.citations?.length ||
    annotations.attribution?.length,
  );
  if (textStarted || (represented.has(options.messageId) && hasAnnotations)) {
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: options.messageId,
      ...(hasAnnotations
        ? { metadata: { [ɵANSWER_METADATA_KEY]: annotations } }
        : {}),
    };
    if (options.signal?.aborted) {
      return;
    }
  }

  const footer = createGoogleHistoryFooter(capture, {
    ownerMessageId: represented.has(options.messageId)
      ? options.messageId
      : (resultIds[0] ?? reasoningIds[0]),
    responseId,
    representedMessageIds: [...represented],
  });
  if (footer) yield footer;

  return readFinish(finish);
}
