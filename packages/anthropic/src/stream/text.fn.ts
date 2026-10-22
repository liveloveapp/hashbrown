import { type AGUIEvent, EventType } from '@ag-ui/core';
import {
  ɵcreateRunFinishedEvent,
  ɵforwardMapped,
  ɵwithActivities,
} from '@hashbrownai/core';
import Anthropic from '@anthropic-ai/sdk';
import { mapAnthropicEvents } from './anthropic-events';
import { createAnthropicRequestOptions } from './anthropic-request';
import type { AnthropicTextStreamOptions } from './types';

type AnthropicProviderStream =
  AsyncIterable<Anthropic.Messages.RawMessageStreamEvent> & {
    readonly controller: AbortController;
  };

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Streams the provider's AG-UI events for one run, without activities.
 */
async function* textEvents(
  options: AnthropicTextStreamOptions,
): AsyncIterable<AGUIEvent> {
  const { apiKey, baseURL, model, input, signal, transformRequestOptions } =
    options;
  const { threadId, runId } = input;
  const messageId = `${runId}:assistant`;
  let providerStream: AnthropicProviderStream | undefined;

  yield { type: EventType.RUN_STARTED, threadId, runId };
  if (signal?.aborted) {
    return;
  }

  try {
    const baseOptions = createAnthropicRequestOptions(input, model);
    const requestOptions = transformRequestOptions
      ? await transformRequestOptions(baseOptions)
      : baseOptions;

    if (signal?.aborted) {
      return;
    }

    const anthropic = new Anthropic({ apiKey, baseURL });
    providerStream = await anthropic.messages.create(requestOptions, {
      signal,
    });

    if (signal?.aborted) {
      return;
    }

    const finish = yield* ɵforwardMapped(
      mapAnthropicEvents({
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
      provider: 'anthropic',
      ...finish,
    });
    if (signal?.aborted) {
      return;
    }
  } catch (error: unknown) {
    if (!signal?.aborted) {
      yield { type: EventType.RUN_ERROR, message: normalizeError(error) };
      if (signal?.aborted) {
        return;
      }
    }
  } finally {
    providerStream?.controller.abort();
  }
}

/**
 * Streams canonical AG-UI events from an Anthropic message request.
 *
 * @param options - Provider configuration and AG-UI run input.
 * @returns An asynchronous stream of canonical AG-UI events.
 *
 * @public
 */
export function text(
  options: AnthropicTextStreamOptions,
): AsyncIterable<AGUIEvent> {
  return ɵwithActivities(
    (signal) => textEvents({ ...options, signal }),
    options.activities,
    options.signal,
  );
}
