import { type AGUIEvent, EventType } from '@ag-ui/core';
import { type AbortableAsyncIterator, type ChatResponse, Ollama } from 'ollama';
import { mapOllamaEvents } from './ollama-events';
import { createOllamaRequestOptions } from './ollama-request';
import type { OllamaTextStreamOptions } from './types';

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Streams canonical AG-UI events from an Ollama chat request.
 *
 * @param options - Provider configuration and AG-UI run input.
 * @returns An asynchronous stream of canonical AG-UI events.
 *
 * @public
 */
export async function* text(
  options: OllamaTextStreamOptions,
): AsyncIterable<AGUIEvent> {
  const { model, input, signal, transformRequestOptions } = options;
  const { threadId, runId } = input;
  const messageId = `${runId}:assistant`;
  let providerStream: AbortableAsyncIterator<ChatResponse> | undefined;
  let mappingStarted = false;

  yield { type: EventType.RUN_STARTED, threadId, runId };
  if (signal?.aborted) {
    return;
  }

  try {
    const baseRequest = createOllamaRequestOptions(input, model);
    const request = transformRequestOptions
      ? await transformRequestOptions(baseRequest)
      : baseRequest;
    if (signal?.aborted) {
      return;
    }

    const ownsClient = options.client === undefined;
    const client =
      options.client ?? new Ollama(options.host ? { host: options.host } : {});
    const abortPendingRequest = () => {
      if (ownsClient) {
        client.abort();
      }
    };
    signal?.addEventListener('abort', abortPendingRequest, { once: true });
    try {
      providerStream = await client.chat(request);
    } finally {
      signal?.removeEventListener('abort', abortPendingRequest);
    }
    if (signal?.aborted) {
      providerStream.abort();
      return;
    }

    mappingStarted = true;
    for await (const event of mapOllamaEvents({
      events: providerStream,
      messageId,
      signal,
    })) {
      yield event;
      if (signal?.aborted) {
        return;
      }
    }
    if (signal?.aborted) {
      return;
    }

    yield { type: EventType.RUN_FINISHED, threadId, runId };
  } catch (error: unknown) {
    if (!signal?.aborted) {
      yield { type: EventType.RUN_ERROR, message: normalizeError(error) };
    }
  } finally {
    if (!mappingStarted) {
      providerStream?.abort();
    }
  }
}
