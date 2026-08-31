import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { mapBedrockEvents } from './bedrock-events';
import { createBedrockRequestOptions } from './bedrock-request';
import type { BedrockTextStreamOptions } from './types';

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Streams canonical AG-UI events from an Amazon Bedrock Converse request.
 *
 * @param options - Provider configuration and AG-UI run input.
 * @returns An asynchronous stream of canonical AG-UI events.
 *
 * @public
 */
export async function* text(
  options: BedrockTextStreamOptions,
): AsyncIterable<AGUIEvent> {
  const { model, input, signal, transformRequestOptions } = options;
  const { threadId, runId } = input;
  const messageId = `${runId}:assistant`;
  let ownedClient: BedrockRuntimeClient | undefined;

  yield { type: EventType.RUN_STARTED, threadId, runId };
  if (signal?.aborted) {
    return;
  }

  try {
    const baseRequest = createBedrockRequestOptions(input, model);
    const request = transformRequestOptions
      ? await transformRequestOptions(baseRequest)
      : baseRequest;
    if (signal?.aborted) {
      return;
    }

    const client =
      options.client ??
      (ownedClient = new BedrockRuntimeClient(options.clientOptions ?? {}));
    const command = new ConverseStreamCommand(request);
    const response = signal
      ? await client.send(command, { abortSignal: signal })
      : await client.send(command);
    if (signal?.aborted) {
      return;
    }
    if (!response.stream) {
      throw new Error('Amazon Bedrock did not return a streaming response');
    }

    for await (const event of mapBedrockEvents({
      events: response.stream,
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
    ownedClient?.destroy();
  }
}
