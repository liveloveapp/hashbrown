import type { WorkbenchStore } from './workbench';
import { canSaveWorkbenchHistory } from './workbench-history';
import type { createWorkbenchServerHistory } from './workbench-server-history';

/** Mounts identical explicit server actions beside each framework's actual SDK transcript. */
export function mountWorkbenchServerControls(
  host: HTMLElement,
  store: WorkbenchStore,
  controller: ReturnType<typeof createWorkbenchServerHistory>,
) {
  const article = document.createElement('article');
  article.className = 'wb-summary wb-history-controls';
  article.setAttribute('aria-label', 'Server conversation controls');
  host.append(article);
  const render = () => {
    const snapshot = store.getSnapshot();
    const state =
      snapshot.frame?.history?.app.server ??
      (snapshot.cursor === null
        ? controller.state()
        : {
            selectedSlot: 'Lighthouse' as const,
            threadId: null,
            version: null,
            snapshot: null,
            access: 'unknown' as const,
            threads: null,
            foreignThreadId: null,
            operations: [],
            busy: false,
            error: null,
          });
    const mutable = controller.mutable();
    const local = state.access === 'local-demo';
    const loaded =
      local &&
      !!state.threadId &&
      Object.values(state.threads ?? {}).some(
        (threads) => threads[state.selectedSlot] === state.threadId,
      );
    article.replaceChildren();
    const button = (label: string, enabled: boolean, action: () => unknown) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.textContent = label;
      node.disabled = !enabled;
      node.addEventListener('click', () => {
        if (!node.disabled && controller.mutable()) void action();
      });
      article.append(node);
    };
    button('Start local session', mutable && !local, () =>
      controller.startSession(),
    );
    button('End local session', mutable && local, () =>
      controller.endSession(),
    );
    const label = document.createElement('label');
    label.textContent = 'Server thread ';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Server thread');
    select.disabled = !mutable || !local;
    for (const slot of ['Lighthouse', 'Harbor']) {
      const option = document.createElement('option');
      option.textContent = slot;
      select.append(option);
    }
    select.value = state.selectedSlot;
    select.addEventListener('change', () => {
      if (select.value === 'Lighthouse' || select.value === 'Harbor')
        controller.select(select.value);
    });
    label.append(select);
    article.append(label);
    button('Load server thread', mutable && local, () => controller.load());
    button(
      'Save server text',
      mutable &&
        loaded &&
        canSaveWorkbenchHistory(snapshot) &&
        snapshot.frame?.history?.sdk.finishReason === 'stop',
      () => controller.save(),
    );
    button(
      'Save from another client',
      mutable && loaded && !!state.snapshot,
      () => controller.competingSave(),
    );
    button('Try anonymous request', mutable, () =>
      controller.checkUnauthenticated(),
    );
    button(
      'Try foreign thread',
      mutable && local && !!state.foreignThreadId,
      () => controller.checkForeign(),
    );
    const status = document.createElement('p');
    status.className = 'wb-muted';
    status.setAttribute('role', 'status');
    status.textContent = `Local demo only · ${state.access} · ${state.selectedSlot} · version ${state.version ?? 'unloaded'}${state.busy ? ' · working' : ''}`;
    article.append(status);
    if (state.error) {
      const error = document.createElement('p');
      error.setAttribute('role', 'alert');
      error.textContent = state.error;
      article.append(error);
    }
  };
  const unsubscribe = store.subscribe(render);
  render();
  return {
    dispose() {
      unsubscribe();
      article.remove();
    },
  };
}
