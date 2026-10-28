// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import type { WorkbenchStore } from '../examples/quickstart/runtime/workbench';
const sdk = vi.hoisted(() => ({
  chat: vi.fn(),
  store: undefined as WorkbenchStore | undefined,
}));
vi.mock('../examples/quickstart/runtime/workbench', async (original) => {
  const source =
    await original<typeof import('../examples/quickstart/runtime/workbench')>();
  return {
    ...source,
    createWorkbenchStore: (
      ...args: Parameters<typeof source.createWorkbenchStore>
    ) => {
      const store = source.createWorkbenchStore(...args);
      sdk.store ??= store;
      return store;
    },
  };
});
vi.mock('@hashbrownai/react', () => ({ useStructuredChat: sdk.chat }));
import { LocalModelsWorkbenchConversation } from '../examples/quickstart/react/src/LocalModelsWorkbench';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const navigation = {
  currentId: '1',
  conversations: [{ id: '1', label: 'Plan' }],
  select: vi.fn(),
  create: vi.fn(),
};
function button(host: HTMLElement, label: string) {
  const result = [...host.querySelectorAll('button')].find(
    (node) => node.textContent === label,
  );
  if (!result) throw new Error(`Missing ${label}`);
  return result;
}

test('React explicitly prepares, streams a native typed plan and accepts only the live original proposal', async () => {
  window.history.replaceState(null, '', '?lesson=local-models');
  const availability = vi.fn(async () => 'available');
  const create = vi.fn();
  vi.stubGlobal('LanguageModel', { availability, create });
  const chat = {
    messages: [] as unknown[],
    isLoading: false,
    isSending: false,
    isReceiving: false,
    isGenerating: false,
    isResuming: false,
    error: undefined,
    lastRunFinishReason: undefined as string | undefined,
    pendingInterrupts: undefined,
    recovery: { required: false },
    sendMessage: vi.fn(),
    setMessages: vi.fn(),
    stop: vi.fn(),
  };
  sdk.chat.mockReturnValue(chat);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let active = true;
  const render = () =>
    root.render(
      <StrictMode>
        <LocalModelsWorkbenchConversation
          active={active}
          navigation={navigation}
        />
      </StrictMode>,
    );

  await act(render);

  expect(availability).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
  expect(sdk.chat.mock.calls.at(-1)?.[0].tools ?? []).toHaveLength(0);
  await act(() =>
    host
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(chat.sendMessage).not.toHaveBeenCalled();
  await act(() => button(host, 'Prepare model').click());
  const textarea = host.querySelector('textarea');
  if (!textarea) throw new Error('Missing composer');
  textarea.value = 'Create a two-step demo plan';
  await act(() =>
    host
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  const user = chat.sendMessage.mock.calls[0][0];
  const proposal = {
    title: 'Local demo',
    steps: ['Outline', 'Record the demo'],
  };
  chat.messages = [
    user,
    { id: 'answer', role: 'assistant', content: proposal },
  ];
  const store = sdk.store;
  if (!store) throw new Error('Missing store');
  await act(() => {
    store.record('source', { source: 'local-model' });
    store.record('event', {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'answer',
      delta: JSON.stringify(proposal),
    });
    store.record('event', { type: 'RUN_FINISHED' });
  });
  await act(render);

  expect(button(host, 'Accept plan').disabled).toBe(false);
  await act(() => button(host, 'Accept plan').click());
  expect(store.getSnapshot().application).toMatchObject({
    revision: 1,
    plan: proposal,
  });
  await act(() => store.seek(0));
  const events = store.getSnapshot().events.length;
  await act(render);
  expect(
    host.querySelector<HTMLButtonElement>('[data-local-prepare]')?.disabled,
  ).toBe(true);
  expect(store.getSnapshot().events).toHaveLength(events);
  await act(() => {
    store.live();
    active = false;
    render();
  });
  await act(() => root.unmount());
  expect(create).not.toHaveBeenCalled();
  host.remove();
  vi.unstubAllGlobals();
});
