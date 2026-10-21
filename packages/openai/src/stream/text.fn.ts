import { type AGUIEvent, EventType } from '@ag-ui/core';
import { ɵwithActivities } from '@hashbrownai/core';
import OpenAI from 'openai';
import { mapOpenAIEvents } from './openai-events';
import { createOpenAIRequestOptions } from './openai-request';
import type { OpenAITextStreamOptions } from './types';

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    transformRequestOptions,
  } = options;
  const { threadId, runId } = input;
  const messageId = `${runId}:assistant`;
  let providerStream: ReturnType<OpenAI['responses']['stream']> | null = null;

  yield { type: EventType.RUN_STARTED, threadId, runId };
  if (signal?.aborted) {
    return;
  }

  try {
    const baseRequest = createOpenAIRequestOptions(input, model, reasoning);
    const request = transformRequestOptions
      ? await transformRequestOptions(baseRequest)
      : baseRequest;
    if (signal?.aborted) {
      return;
    }

    const openai = new OpenAI({ apiKey, baseURL });
    providerStream = openai.responses.stream(request, { signal });

    for await (const event of mapOpenAIEvents({
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
    providerStream?.abort();
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
