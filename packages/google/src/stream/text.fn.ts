import { type AGUIEvent, EventType } from '@ag-ui/core';
import { type GenerateContentResponse, GoogleGenAI } from '@google/genai';
import { mapGoogleEvents } from './google-events';
import { createGoogleRequestOptions } from './google-request';
import type { GoogleTextStreamOptions } from './types';

const GOOGLE_BASE_URL_ENV = 'HASHBROWN_GOOGLE_API_BASE_URL';

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Streams canonical AG-UI events from a Google content request.
 *
 * @param options - Provider configuration and AG-UI run input.
 * @returns An asynchronous stream of canonical AG-UI events.
 *
 * @public
 */
export async function* text(
  options: GoogleTextStreamOptions,
): AsyncIterable<AGUIEvent> {
  const { model, input, signal, transformRequestOptions } = options;
  const { threadId, runId } = input;
  const messageId = `${runId}:assistant`;
  let providerStream: AsyncGenerator<GenerateContentResponse> | undefined;
  let mappingStarted = false;

  yield { type: EventType.RUN_STARTED, threadId, runId };
  if (signal?.aborted) {
    return;
  }

  try {
    const baseRequest = createGoogleRequestOptions(input, model, signal);
    const request = transformRequestOptions
      ? await transformRequestOptions(baseRequest)
      : baseRequest;
    if (signal?.aborted) {
      return;
    }

    const baseUrl = process.env[GOOGLE_BASE_URL_ENV];
    const ai = options.vertexai
      ? new GoogleGenAI({
          vertexai: true,
          project: options.project,
          location: options.location,
        })
      : new GoogleGenAI({
          apiKey: options.apiKey,
          ...(baseUrl ? { httpOptions: { baseUrl } } : {}),
        });
    providerStream = await ai.models.generateContentStream(request);
    mappingStarted = true;

    for await (const event of mapGoogleEvents({
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
      await providerStream?.return(undefined);
    }
  }
}
