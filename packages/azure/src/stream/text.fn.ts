import { type AGUIEvent, EventType } from '@ag-ui/core';
import { AzureOpenAI } from 'openai';
import { mapAzureEvents } from './azure-events';
import { createAzureRequestOptions } from './azure-request';
import type { AzureTextStreamOptions } from './types';

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Streams canonical AG-UI events from an Azure OpenAI chat completion.
 *
 * @param options - Azure SDK configuration and AG-UI run input.
 * @returns An asynchronous stream of canonical AG-UI events.
 *
 * @public
 */
export async function* text(
  options: AzureTextStreamOptions,
): AsyncIterable<AGUIEvent> {
  const { clientOptions, model, input, signal, transformRequestOptions } =
    options;
  const { threadId, runId } = input;
  const messageId = `${runId}:assistant`;
  let providerStream: ReturnType<
    AzureOpenAI['chat']['completions']['stream']
  > | null = null;

  yield { type: EventType.RUN_STARTED, threadId, runId };
  if (signal?.aborted) {
    return;
  }

  try {
    const baseRequest = createAzureRequestOptions(input, model);
    const request = transformRequestOptions
      ? await transformRequestOptions(baseRequest)
      : baseRequest;
    if (signal?.aborted) {
      return;
    }

    const azure = new AzureOpenAI(clientOptions);
    providerStream = azure.chat.completions.stream(request, { signal });

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
