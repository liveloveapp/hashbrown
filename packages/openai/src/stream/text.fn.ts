import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  ɵcreateRunFinishedEvent,
  ɵforwardMapped,
  ɵwithActivities,
} from '@hashbrownai/core';
import OpenAI from 'openai';
import type { Stream } from 'openai/streaming';
import { mapOpenAIEvents } from './openai-events';
import { createOpenAIRequestOptions } from './openai-request';
import type { OpenAITextStreamOptions } from './types';

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type ProviderStream = Stream<OpenAI.Responses.ResponseStreamEvent>;

/** Waits for response headers without delaying cancellation; disposes a late stream. */
async function waitForStream(
  request: PromiseLike<ProviderStream>,
  signal: AbortSignal | undefined,
): Promise<ProviderStream | undefined> {
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
      void Promise.resolve(request).then((stream) => {
        if (signal.aborted) {
          stream.controller.abort();
          resolve(undefined);
        } else {
          resolve(stream);
        }
      }, reject);
    });
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

/** Rejects malformed terminal output before it can close text or tool lifecycles. */
async function* validatedResponseEvents(
  events: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>,
): AsyncIterable<OpenAI.Responses.ResponseStreamEvent> {
  for await (const event of events) {
    if (
      (event.type === 'response.completed' ||
        event.type === 'response.incomplete') &&
      !Array.isArray(event.response?.output)
    ) {
      throw new Error(
        `OpenAI Responses protocol error: ${event.type} response.output must be an array`,
      );
    }
    yield event;
  }
}

/**
 * Streams the provider's AG-UI events for one run, without activities.
 */
async function* textEvents(
  options: OpenAITextStreamOptions,
): AsyncIterable<AGUIEvent> {
  const {
    apiKey,
    baseURL,
    model,
    input,
    signal,
    reasoning,
    builtInTools,
    transformRequestOptions,
  } = options;
  const { threadId, runId } = input;
  const messageId = `${runId}:assistant`;
  let providerStream: ProviderStream | undefined;

  yield { type: EventType.RUN_STARTED, threadId, runId };
  if (signal?.aborted) {
    return;
  }

  try {
    const baseRequest = createOpenAIRequestOptions(
      input,
      model,
      reasoning,
      builtInTools,
    );
    const request = transformRequestOptions
      ? await transformRequestOptions(baseRequest)
      : baseRequest;
    if (signal?.aborted) {
      return;
    }

    const openai = new OpenAI({ apiKey, baseURL });
    providerStream = await waitForStream(
      openai.responses.create({ ...request, stream: true }, { signal }),
      signal,
    );
    if (!providerStream || signal?.aborted) {
      return;
    }

    const finish = yield* ɵforwardMapped(
      mapOpenAIEvents({
        events: validatedResponseEvents(providerStream),
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
      provider: 'openai',
      ...finish,
    });
  } catch (error: unknown) {
    if (!signal?.aborted) {
      yield { type: EventType.RUN_ERROR, message: normalizeError(error) };
    }
  } finally {
    providerStream?.controller.abort();
  }
}

/**
 * Streams canonical AG-UI events from an OpenAI Responses API request.
 *
 * @param options - OpenAI client configuration and AG-UI run input.
 * @returns An asynchronous stream of canonical AG-UI events.
 *
 * @public
 */
export function text(
  options: OpenAITextStreamOptions,
): AsyncIterable<AGUIEvent> {
  return ɵwithActivities(
    (signal) => textEvents({ ...options, signal }),
    options.activities,
    options.signal,
  );
}
