import { createHttpTransport, type Transport } from '@hashbrownai/core';
import type { WorkbenchStore } from './workbench';

/** Records actual SDK request envelopes and decoded events while preserving stream disposal. */
export function createWorkbenchTransport(
  store: WorkbenchStore,
  delegate?: Transport,
  endpoint = '/api/workbench/chat',
  options: {
    readonly getDebugDenied?: () => boolean;
    readonly onResponse?: (response: Response) => void;
  } = {},
): Transport {
  let nonce = 0;
  return {
    name: 'WorkbenchCaptureTransport',
    async send(request) {
      const currentNonce = ++nonce;
      const turn = store.getSnapshot().turn;
      const latestUser = () =>
        [...(store.getSnapshot().frame?.messages ?? [])]
          .reverse()
          .find((message) => message.role === 'user')?.id;
      const userId = latestUser();
      const current = () =>
        nonce === currentNonce &&
        store.getSnapshot().turn === turn &&
        latestUser() === userId &&
        store.getSnapshot().status === 'loading' &&
        !request.signal.aborted;
      const denied = options.getDebugDenied?.() === true;
      const url = denied
        ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}demoDenied=1`
        : endpoint;
      const transport =
        delegate ??
        createHttpTransport({
          baseUrl: url,
          fetchImpl: async (...args) => {
            const response = await fetch(...args);
            if (current()) {
              options.onResponse?.(response);
              const source =
                response.headers.get('X-Workbench-Source') ?? 'unknown';
              let problem: string | undefined;
              if (!response.ok && source === 'demo-failure')
                problem =
                  'Demo denial is enabled. Disable Demo denial and send again.';
              store.record('source', { source });
              store.record(
                'response',
                {
                  status: response.status,
                  url: response.url || url,
                  requestId: request.requestId,
                  source,
                  ...(problem ? { problem } : {}),
                },
                request.requestId,
              );
            }
            return response;
          },
        });
      if (current())
        store.record(
          'request',
          {
            url,
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
                if (current()) {
                  store.record('event', event, request.requestId);
                  if (event.type === 'RUN_ERROR') store.settle('error');
                }
                yield event;
              }
            } catch (error) {
              if (current())
                store.record('error', {
                  message:
                    'Stream failed. Review the HTTP response or decoded events.',
                });
              if (current()) store.settle('error');
              throw error;
            }
          })(),
        };
      } catch (error) {
        if (current())
          store.record('error', {
            message:
              'Request failed. Review the HTTP response or decoded events.',
          });
        if (current()) store.settle('error');
        throw error;
      }
    },
  };
}
