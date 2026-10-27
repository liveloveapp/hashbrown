import type { WorkbenchSnapshot, WorkbenchStore } from './workbench';
import type { WorkbenchAuthoringObservation } from './workbench-authoring';
import {
  createAuthoringActions,
  workbenchAuthoringSource,
} from './workbench-authoring';

/** Selects only actual assistant text following the latest application-owned user send. */
export function currentAuthoringAssistant(
  snapshot: WorkbenchSnapshot,
  messages: readonly {
    readonly id?: string;
    readonly role: string;
    readonly content?: unknown;
  }[],
): { readonly id: string; readonly json: string } | null {
  const currentUser = snapshot.events
    .at(-1)
    ?.messages.filter((message) => message.role === 'user')
    .at(-1)?.id;
  const userIndex = messages.reduce(
    (last, message, index) => (message.role === 'user' ? index : last),
    -1,
  );
  if (!currentUser || messages[userIndex]?.id !== currentUser) return null;
  const assistant = messages
    .slice(userIndex + 1)
    .filter((message) => message.role === 'assistant')
    .at(-1);
  return assistant &&
    typeof assistant.id === 'string' &&
    typeof assistant.content === 'string'
    ? { id: assistant.id, json: assistant.content }
    : null;
}

/** Mounts captured readouts and stable form fields; replay is an inert projection of stored values. */
export function mountAuthoringControls(
  host: HTMLElement,
  store: WorkbenchStore,
  lesson: string,
  active: () => boolean,
): { readonly render: () => void; readonly dispose: () => void } {
  let disposed = false;
  const mountedActive = () => !disposed && active();
  const actions = createAuthoringActions(store, mountedActive);
  const feed = document.createElement('div');
  const preview = document.createElement('article');
  preview.className = 'wb-summary';
  preview.dataset['authoringPreview'] = '';
  const status = document.createElement('p');
  status.dataset['authoringStatus'] = '';
  const title = document.createElement('h3');
  const steps = document.createElement('ol');
  const error = document.createElement('p');
  error.setAttribute('role', 'alert');
  preview.append(status, title, steps);
  const form = document.createElement('article');
  form.className = 'wb-summary wb-authoring-controls';
  form.setAttribute('aria-label', 'Review generated plan');
  const review = document.createElement('button');
  review.type = 'button';
  review.textContent = 'Review draft';
  review.addEventListener('click', () => actions.review());
  const fields = (['Plan title', 'First step', 'Second step'] as const).map(
    (name, index) => {
      const label = document.createElement('label');
      label.textContent = name;
      const input = document.createElement('input');
      input.setAttribute('aria-label', name);
      input.addEventListener('input', () =>
        actions.edit(
          index === 0 ? 'title' : index === 1 ? 'step-0' : 'step-1',
          input.value,
        ),
      );
      label.append(input);
      return { label, input };
    },
  );
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.textContent = 'Apply plan';
  apply.addEventListener('click', () => actions.apply());
  form.append(review, ...fields.map((field) => field.label), apply);
  host.append(feed);
  if (lesson !== 'agent-decisions') host.append(preview);
  if (lesson === 'natural-forms') host.append(form);
  host.append(error);
  const render = () => {
    if (disposed) return;
    const snapshot = store.getSnapshot();
    const history = snapshot.frame?.history;
    const authoring = history?.authoring;
    const source = workbenchAuthoringSource(snapshot);
    const earlier = new Map<string, WorkbenchAuthoringObservation>();
    for (const event of snapshot.events.slice(
      0,
      snapshot.cursor === null ? undefined : snapshot.cursor + 1,
    )) {
      const capture = event.history?.authoring;
      if (capture?.origin.assistantId)
        earlier.set(capture.origin.assistantId, capture);
    }
    feed.replaceChildren(
      ...(history?.sdk.messages ?? []).flatMap((message) => {
        if (lesson !== 'agent-decisions' && message['role'] === 'assistant') {
          if (
            message['id'] === authoring?.origin.assistantId ||
            typeof message['id'] !== 'string' ||
            !message['content']
          )
            return [];
          const capture = earlier.get(message['id']);
          const value = capture?.parser.value;
          if (
            !value ||
            typeof value !== 'object' ||
            capture?.parser.error ||
            capture?.source === 'error'
          )
            return [];
          const plan = value as Record<string, unknown>;
          const card = document.createElement('article');
          card.className = 'wb-summary';
          card.dataset['authoringPast'] = '';
          const label = document.createElement('p');
          label.textContent = `Earlier generated draft · Source: ${capture?.source} · Parser: ${capture?.parser.complete ? 'complete' : 'incomplete'}`;
          const heading = document.createElement('h3');
          heading.textContent =
            typeof plan['title'] === 'string' ? plan['title'] : '';
          const list = document.createElement('ol');
          for (const step of Array.isArray(plan['steps'])
            ? plan['steps']
            : []) {
            if (typeof step !== 'string') continue;
            const item = document.createElement('li');
            item.textContent = step;
            list.append(item);
          }
          card.append(label, heading, list);
          return [card];
        }
        if (
          message['role'] !== 'user' &&
          !(lesson === 'agent-decisions' && message['role'] === 'assistant')
        )
          return [];
        if (typeof message['content'] !== 'string') return [];
        const paragraph = document.createElement('p');
        paragraph.className =
          message['role'] === 'user' ? 'wb-user' : 'wb-history-reply';
        paragraph.textContent = message['content'];
        return [paragraph];
      }),
    );
    status.textContent = `Source: ${source} · Parser: ${authoring?.parser.complete ? 'complete' : 'incomplete'}${source === 'complete' && authoring?.document ? ' · Original document valid' : ''}${authoring?.applied ? ' · Plan applied' : ''}`;
    const value =
      source !== 'error' && !authoring?.parser.error
        ? authoring?.parser.value
        : null;
    const object =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : null;
    title.textContent =
      typeof object?.['title'] === 'string' ? object['title'] : '';
    steps.replaceChildren(
      ...(Array.isArray(object?.['steps']) ? object['steps'] : [])
        .filter((step): step is string => typeof step === 'string')
        .map((step) => {
          const item = document.createElement('li');
          item.textContent = step;
          return item;
        }),
    );
    const ready =
      mountedActive() &&
      snapshot.cursor === null &&
      snapshot.status === 'complete' &&
      source === 'complete' &&
      authoring?.source === 'complete' &&
      !!authoring.document &&
      !authoring.applied &&
      authoring.origin.turn === snapshot.turn &&
      authoring.origin.revision === snapshot.application.revision;
    review.disabled = !ready;
    apply.disabled = !ready || !authoring?.reviewed;
    const reviewed = authoring?.reviewed;
    fields.forEach(({ input }, index) => {
      const value =
        index === 0
          ? (reviewed?.title ?? '')
          : (reviewed?.steps[index - 1] ?? '');
      if (input.value !== value) input.value = value;
      input.disabled = !ready || !reviewed;
    });
    error.textContent =
      authoring?.error ||
      authoring?.parser.error ||
      history?.sdk.error ||
      (source === 'complete' && !authoring?.document
        ? 'The complete source is not a valid two-step plan.'
        : '');
    error.hidden = !error.textContent;
  };
  const unsubscribe = store.subscribe(render);
  render();
  return {
    render,
    dispose: () => {
      disposed = true;
      unsubscribe();
      feed.remove();
      preview.remove();
      form.remove();
      error.remove();
    },
  };
}
