import { createHttpTransport, type Transport } from '@hashbrownai/core';
import type { WorkbenchStore } from './workbench';

/** Records actual SDK request envelopes and decoded events while preserving stream disposal. */
export function createWorkbenchTransport(
  store: WorkbenchStore,
  delegate?: Transport,
  endpoint = '/api/workbench/chat',
): Transport {
  return {
    name: 'WorkbenchCaptureTransport',
    async send(request) {
      const turn = store.getSnapshot().turn;
      const latestUser = () =>
        [...(store.getSnapshot().frame?.messages ?? [])]
          .reverse()
          .find((message) => message.role === 'user')?.id;
      const userId = latestUser();
      const current = () =>
        store.getSnapshot().turn === turn &&
        latestUser() === userId &&
        store.getSnapshot().status === 'loading' &&
        !request.signal.aborted;
      const transport =
        delegate ??
        createHttpTransport({
          baseUrl: endpoint,
          fetchImpl: async (...args) => {
            const response = await fetch(...args);
            if (current())
              store.record('source', {
                source: response.headers.get('X-Workbench-Source') ?? 'unknown',
              });
            return response;
          },
        });
      if (current())
        store.record(
          'request',
          {
            requestId: request.requestId,
            attempt: request.attempt,
            input: request.input,
          },
          request.requestId,
        );
      try {
        const response = await transport.send(request);
        return {
          ...response,
          events: (async function* () {
            try {
              for await (const event of response.events) {
                if (current()) store.record('event', event, request.requestId);
                yield event;
              }
            } catch (error) {
              if (current())
                store.record('error', {
                  message:
                    error instanceof Error ? error.message : 'Stream failed',
                });
              throw error;
            }
          })(),
        };
      } catch (error) {
        if (current())
          store.record('error', {
            message: error instanceof Error ? error.message : 'Request failed',
          });
        throw error;
      }
    },
  };
}
