import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  ɵcreateRunFinishedEvent,
  ɵforwardMapped,
  ɵwithActivities,
} from '@hashbrownai/core';
import { type AbortableAsyncIterator, type ChatResponse, Ollama } from 'ollama';
import { mapOllamaEvents } from './ollama-events';
import { createOllamaRequestOptions } from './ollama-request';
import type { OllamaTextStreamOptions } from './types';

/** Waits for a run's stream without making cancellation wait for response headers. */
async function waitForStream(
  request: Promise<AbortableAsyncIterator<ChatResponse>>,
  signal: AbortSignal | undefined,
): Promise<AbortableAsyncIterator<ChatResponse> | undefined> {
  if (!signal) {
    return request;
  }

  let onAbort!: () => void;
  try {
    return await new Promise((resolve, reject) => {
      onAbort = () => resolve(undefined);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
      }
      void request
        .then((stream) => {
          if (signal.aborted) {
            stream.abort();
            resolve(undefined);
          } else {
            resolve(stream);
          }
        })
        .catch(reject);
    });
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Streams the provider's AG-UI events for one run, without activities.
 */
async function* textEvents(
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
      options.client ??
      new Ollama({
        ...(options.host ? { host: options.host } : {}),
        ...(signal
          ? {
              // The SDK registers streams only after response headers arrive, so
              // client.abort() alone cannot stop a pending HTTP request.
              fetch: (input, init) =>
                globalThis.fetch(input, {
                  ...init,
                  signal: init?.signal
                    ? AbortSignal.any([signal, init.signal])
                    : signal,
                }),
            }
          : {}),
      });
    const abortPendingRequest = () => {
      if (ownsClient) {
        client.abort();
      }
    };
    signal?.addEventListener('abort', abortPendingRequest, { once: true });
    try {
      providerStream = await waitForStream(client.chat(request), signal);
    } finally {
      signal?.removeEventListener('abort', abortPendingRequest);
    }
    if (!providerStream || signal?.aborted) {
      providerStream?.abort();
      return;
    }

    mappingStarted = true;
    const finish = yield* ɵforwardMapped(
      mapOllamaEvents({
        events: providerStream,
        messageId,
        signal,
      }),
      signal,
    );
    if (signal?.aborted || !finish) {
      return;
    }

    yield ɵcreateRunFinishedEvent({
      threadId,
      runId,
      provider: 'ollama',
      ...finish,
    });
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

/**
 * Streams canonical AG-UI events from an Ollama chat request.
 *
 * @param options - Provider configuration and AG-UI run input.
 * @returns An asynchronous stream of canonical AG-UI events.
 *
 * @public
 */
export function text(
  options: OllamaTextStreamOptions,
): AsyncIterable<AGUIEvent> {
  return ɵwithActivities(
    (signal) => textEvents({ ...options, signal }),
    options.activities,
    options.signal,
  );
}
