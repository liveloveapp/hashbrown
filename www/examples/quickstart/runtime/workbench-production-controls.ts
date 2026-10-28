import { PRODUCTION_PLAN } from './workbench-production';
import type { WorkbenchStore } from './workbench';
import type { createProductionClient } from './workbench-production-client';

/** Mounts identical explicit production controls in the two framework workbenches. */
export function mountProductionControls(
  host: HTMLElement,
  store: WorkbenchStore,
  client: ReturnType<typeof createProductionClient>,
) {
  const article = document.createElement('article');
  article.className = 'wb-summary wb-history-controls';
  article.setAttribute('aria-label', 'Production recovery controls');
  host.append(article);
  const render = () => {
    const snapshot = store.getSnapshot();
    const state = snapshot.frame?.production ?? client.state();
    const allowed = client.mutable();
    article.replaceChildren();
    const button = (label: string, enabled: boolean, action: () => unknown) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.textContent = label;
      node.disabled = !enabled;
      node.addEventListener('click', () => {
        if (client.mutable()) void action();
      });
      article.append(node);
    };
    button('Create server thread', allowed, () => client.create());
    const label = document.createElement('label');
    label.textContent = 'Thread ID ';
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Thread ID');
    input.value = state.threadId;
    input.disabled = !allowed;
    input.addEventListener('change', () => client.select(input.value));
    label.append(input);
    article.append(label);
    button('Read and restore recovery', allowed && !!state.threadId, () =>
      client.read(),
    );
    button('Read application receipt', allowed && !!state.threadId, () =>
      client.read(true),
    );
    const batch = snapshot.frame?.workflow?.pendingInterrupts;
    const canResume =
      allowed &&
      !!batch &&
      state.attachedThreadId === state.threadId &&
      ['idle', 'paused'].includes(state.disposition);
    if (batch) {
      const heading = document.createElement('p');
      heading.textContent = 'Application-owned plan for review';
      const title = document.createElement('h3');
      title.textContent = PRODUCTION_PLAN.title;
      const steps = document.createElement('ol');
      PRODUCTION_PLAN.steps.forEach((step) => {
        const item = document.createElement('li');
        item.textContent = step;
        steps.append(item);
      });
      article.append(heading, title, steps);
      const description = document.createElement('p');
      description.textContent = batch.interrupts
        .map((entry) => entry.message ?? entry.reason)
        .join(' · ');
      article.append(description);
      button('Approve plan', canResume, () => client.approve(true));
      button('Decline', canResume, () => client.approve(false));
    }
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = `${state.disposition} · ${state.attachedThreadId === state.threadId && state.threadId ? 'SDK attached' : 'Explicit restore required'} · Application revision ${state.application?.revision ?? 'unread'} · ${state.operation}`;
    article.append(status);
    if (state.application?.plan) {
      const title = document.createElement('h3');
      title.textContent = state.application.plan.title;
      article.append(title);
      const list = document.createElement('ol');
      state.application.plan.steps.forEach((step) => {
        const item = document.createElement('li');
        item.textContent = step;
        list.append(item);
      });
      article.append(list);
    }
    if (state.error) {
      const error = document.createElement('p');
      error.setAttribute('role', 'alert');
      error.textContent = state.error;
      article.append(error);
    }
    for (const message of snapshot.frame?.workflow?.messages ?? []) {
      if (
        (message.role === 'assistant' || message.role === 'user') &&
        typeof message.content === 'string'
      ) {
        const text = document.createElement('p');
        text.className =
          message.role === 'user' ? 'wb-user' : 'wb-history-reply';
        text.textContent = message.content;
        article.append(text);
      }
    }
  };
  const unsubscribe = store.subscribe(render);
  render();
  return () => {
    unsubscribe();
    article.remove();
  };
}
