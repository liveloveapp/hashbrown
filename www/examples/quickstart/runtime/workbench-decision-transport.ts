import { createHttpDecisionTransport, type Decision } from '@hashbrownai/core';
import type { WorkbenchStore } from './workbench';

/** Captures genuine whole decision responses, rejecting late and cancelled runs. */
export function createWorkbenchDecisionTransport(
  store: WorkbenchStore,
  requestId: string,
  delegate?: Decision.Transport,
): Decision.Transport {
  return async (request, signal) => {
    const current = () =>
      !signal.aborted &&
      store.getSnapshot().status === 'loading' &&
      store
        .getSnapshot()
        .frame?.messages.filter((message) => message.role === 'user')
        .at(-1)?.id === requestId;
    const transport =
      delegate ??
      createHttpDecisionTransport({
        url: '/api/workbench/decisions',
        fetch: async (...args) => {
          const response = await fetch(...args);
          if (current())
            store.record('source', {
              source: response.headers.get('X-Workbench-Source') ?? 'unknown',
            });
          return response;
        },
      });
    if (current()) store.record('request', { requestId, input: request });
    try {
      const response = await transport(request, signal);
      if (current()) store.record('event', response);
      else throw new DOMException('Decision cancelled', 'AbortError');
      return response;
    } catch (error) {
      if (current()) store.settle('error');
      throw error;
    }
  };
}
