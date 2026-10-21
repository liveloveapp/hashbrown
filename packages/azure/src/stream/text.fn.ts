import { type AGUIEvent, EventType } from '@ag-ui/core';
import { ɵwithActivities } from '@hashbrownai/core';
import { AzureOpenAI } from 'openai';
import { mapAzureEvents } from './azure-events';
import { createAzureRequestOptions } from './azure-request';
import type { AzureTextStreamOptions } from './types';

const DEPLOYMENT_ERROR =
  'Azure OpenAI clientOptions.deployment is not supported with the Responses API. ' +
  'Remove clientOptions.deployment and pass the deployment name as `model`.';

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Streams the provider's AG-UI events for one run, without activities.
 */
async function* textEvents(
  options: AzureTextStreamOptions,
): AsyncIterable<AGUIEvent> {
  const {
    clientOptions,
    model,
    input,
    signal,
    reasoning,
    builtInTools,
    transformRequestOptions,
  } = options;
  const { threadId, runId } = input;
  const messageId = `${runId}:assistant`;
  let providerStream: ReturnType<AzureOpenAI['responses']['stream']> | null =
    null;

  yield { type: EventType.RUN_STARTED, threadId, runId };
  if (signal?.aborted) {
    return;
  }

  try {
    if (clientOptions.deployment !== undefined) {
      throw new Error(DEPLOYMENT_ERROR);
    }

    const baseRequest = createAzureRequestOptions(
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

    const azure = new AzureOpenAI(clientOptions);
    providerStream = azure.responses.stream(request, { signal });

    for await (const event of mapAzureEvents({
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
 * Streams canonical AG-UI events from an Azure OpenAI Responses API request.
 *
 * @param options - Azure SDK configuration and AG-UI run input.
 * @returns An asynchronous stream of canonical AG-UI events.
 *
 * @public
 */
export function text(
  options: AzureTextStreamOptions,
): AsyncIterable<AGUIEvent> {
  return ɵwithActivities(
    (signal) => textEvents({ ...options, signal }),
    options.activities,
    options.signal,
  );
}
