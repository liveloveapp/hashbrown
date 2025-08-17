import { apiActions, devActions, internalActions } from '../actions';
import { decodeFrames } from '../frames/decode-frames';
import { Chat } from '../models';
import {
  selectApiMessages,
  selectApiTools,
  selectApiUrl,
  selectDebounce,
  selectEmulateStructuredOutput,
  selectMiddleware,
  selectModel,
  selectResponseSchema,
  selectRetries,
  selectShouldGenerateMessage,
  selectSystem,
} from '../reducers';
import { s } from '../schema';
import { sleep, switchAsync } from '../utils/async';
import { createEffect } from '../utils/micro-ngrx';
import { updateMessagesWithDelta } from '../utils/update-message';

let currentAbortController: AbortController | null = null;

export const generateMessage = createEffect((store) => {
  const effectAbortController = new AbortController();
  currentAbortController = effectAbortController;
  // This controller is used to cancel the current message generation
  // when a new message is sent or the user stops the generation.
  let cancelAbortController = new AbortController();

  store.when(
    internalActions.sizzle,
    devActions.setMessages,
    devActions.sendMessage,
    devActions.resendMessages,
    internalActions.runToolCallsSuccess,
    switchAsync(async (switchSignal) => {
      const apiUrl = store.read(selectApiUrl);
      const middleware = store.read(selectMiddleware);
      const model = store.read(selectModel);
      const responseSchema = store.read(selectResponseSchema);
      const messages = store.read(selectApiMessages);
      const shouldGenerateMessage = store.read(selectShouldGenerateMessage);
      const debounce = store.read(selectDebounce);
      const retries = store.read(selectRetries);
      const tools = store.read(selectApiTools);
      const system = store.read(selectSystem);
      const emulateStructuredOutput = store.read(selectEmulateStructuredOutput);

      if (!shouldGenerateMessage) {
        return;
      }

      const params: Chat.Api.CompletionCreateParams = {
        model,
        system,
        messages,
        tools,
        toolChoice:
          emulateStructuredOutput && responseSchema ? 'required' : undefined,
        responseFormat:
          !emulateStructuredOutput && responseSchema
            ? s.toJsonSchema(responseSchema)
            : undefined,
      };

      await sleep(debounce, switchSignal);

      let attempt = 0;

      do {
        attempt++;

        if (
          effectAbortController.signal.aborted ||
          switchSignal.aborted ||
          cancelAbortController.signal.aborted
        ) {
          // we need to reset the cancelAbortController for the next messsage
          if (cancelAbortController.signal.aborted) {
            cancelAbortController = new AbortController();
          }
          return;
        }

        let requestInit: RequestInit = {
          method: 'POST',
          body: JSON.stringify(params),
          headers: {
            'Content-Type': 'application/json',
          },
          signal: switchSignal,
        };

        if (middleware && middleware.length) {
          for (const m of middleware) {
            requestInit = await m(requestInit);
          }
        }

        try {
          const response = await fetch(apiUrl, requestInit);

          if (!response.ok) {
            store.dispatch(
              apiActions.generateMessageError(
                new Error(`HTTP error! Status: ${response.status}`),
              ),
            );
            continue;
          }

          if (!response.body) {
            store.dispatch(
              apiActions.generateMessageError(
                new Error(`Response body is null`),
              ),
            );
            continue;
          }

          // This catches an edge case where a cancellation was requested
          // after we had already kicked off the initial request, but
          // before we started decoding frames.
          if (cancelAbortController.signal.aborted) {
            // If the cancelAbortController is aborted, we need to reset it for the next message
            cancelAbortController = new AbortController();
            return;
          }

          store.dispatch(apiActions.generateMessageStart());

          let message: Chat.Api.AssistantMessage | null = null;

          for await (const frame of decodeFrames(response.body, {
            signal: AbortSignal.any([
              cancelAbortController.signal,
              effectAbortController.signal,
            ]),
          })) {
            switch (frame.type) {
              case 'chunk': {
                message = updateMessagesWithDelta(message, frame.chunk);
                if (message) {
                  store.dispatch(apiActions.generateMessageChunk(message));
                }
                break;
              }
              case 'error': {
                // Assumption: a 'finish' will follow the 'error', but we know we need to retry
                // as soon as we see the error.  Therefore, throw an exception to break out
                // of the for loop.
                throw new Error(frame.error);
                break;
              }
              case 'finish': {
                if (message) {
                  store.dispatch(
                    apiActions.generateMessageSuccess(
                      message as unknown as Chat.Api.AssistantMessage,
                    ),
                  );
                } else {
                  store.dispatch(
                    apiActions.generateMessageError(
                      new Error('No message was generated'),
                    ),
                  );
                }
                break;
              }
            }
          }
        } catch (e) {
          if (e instanceof Error) {
            store.dispatch(apiActions.generateMessageError(e));
          }
          continue;
        } finally {
          // Reset the cancelAbortController for the next message
          if (cancelAbortController.signal.aborted) {
            cancelAbortController = new AbortController();
          }
        }

        break;
      } while (retries > 0 && attempt < retries + 1);

      // Did we exhaust our retries?
      if (retries > 0 && attempt > retries) {
        store.dispatch(apiActions.generateMessageExhaustedRetries());
      }
    }, effectAbortController.signal),
  );

  store.when(devActions.stopMessageGeneration, () => {
    cancelAbortController.abort();
  });

  return () => {
    effectAbortController.abort();
    currentAbortController = null;
    cancelAbortController.abort();
  };
});
