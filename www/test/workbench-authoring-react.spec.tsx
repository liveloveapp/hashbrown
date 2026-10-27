// @vitest-environment jsdom
import { act } from 'react';
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
    ) => (sdk.store = source.createWorkbenchStore(...args)),
  };
});
vi.mock('@hashbrownai/react', async (original) => {
  const actual = await original<typeof import('@hashbrownai/react')>();
  return {
    useChat: sdk.chat,
    useJsonParser: actual.useJsonParser,
    useTool: (tool: unknown) => tool,
  };
});
import { AuthoringWorkbenchConversation } from '../examples/quickstart/react/src/AuthoringWorkbench';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function button(host: HTMLElement, text: string) {
  const node = [...host.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === text,
  );
  if (!node) throw new Error(`Missing ${text}`);
  return node;
}
function runtime() {
  return {
    messages: [] as unknown[],
    isLoading: false,
    isSending: false,
    isReceiving: false,
    isGenerating: false,
    isResuming: false,
    recovery: { required: false },
    pendingInterrupts: undefined as unknown,
    error: undefined as unknown,
    lastRunFinishReason: undefined as string | undefined,
    sendMessage: vi.fn(),
    stop: vi.fn(),
    setMessages: vi.fn(),
  };
}
const navigation = {
  currentId: '1',
  conversations: [{ id: '1', label: 'Plan' }],
  select: vi.fn(),
  create: vi.fn(),
};
async function send(host: HTMLElement, text = 'Create a plan') {
  const textarea = host.querySelector('textarea');
  const form = host.querySelector('form');
  if (!textarea || !form) throw new Error('Missing composer');
  textarea.value = text;
  await act(() =>
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    ),
  );
}

test('React actual parser distinguishes complete JSON from SDK completion and preserves editable review focus', async () => {
  window.history.replaceState(null, '', '?lesson=natural-forms');
  const chat = runtime();
  sdk.chat.mockReturnValue(chat);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let active = true;
  const render = () =>
    root.render(
      <AuthoringWorkbenchConversation
        active={active}
        navigation={{ ...navigation }}
      />,
    );
  await act(render);
  const store = sdk.store;
  if (!store) throw new Error('Missing store');
  const initialPlan = store.getSnapshot().application.plan;

  expect(sdk.chat.mock.calls.at(-1)?.[0].tools).toHaveLength(1);
  expect(await sdk.chat.mock.calls.at(-1)?.[0].tools[0].handler()).toEqual(
    store.getSnapshot().application,
  );
  await send(host);
  const user = chat.sendMessage.mock.calls[0][0];
  chat.messages = [user];
  chat.isLoading = true;
  await act(render);
  const json = JSON.stringify({
    title: 'Trusted UI',
    steps: ['Outline the demo.', 'Record the demo.'],
  });
  chat.messages = [
    user,
    { id: 'answer', role: 'assistant', content: json, toolCalls: [] },
  ];
  await act(render);

  expect(host.querySelector('[data-authoring-status]')?.textContent).toContain(
    'Source: generating · Parser: complete',
  );
  expect(button(host, 'Review draft').disabled).toBe(true);
  expect(store.getSnapshot().application.plan).toEqual(initialPlan);
  chat.isLoading = false;
  chat.lastRunFinishReason = 'stop';
  await act(render);
  expect(button(host, 'Review draft').disabled).toBe(false);
  await act(() => button(host, 'Review draft').click());
  const field = host.querySelector<HTMLInputElement>(
    '[aria-label="First step"]',
  );
  if (!field) throw new Error('Missing first step');
  field.focus();
  await act(() => {
    field.value = ' ';
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(document.activeElement).toBe(field);
  expect(host.querySelector('[aria-label="First step"]')).toBe(field);
  expect(field.disabled).toBe(false);
  await act(() => button(host, 'Apply plan').click());
  expect(field.value).toBe(' ');
  expect(host.textContent).toContain('1–200');
  expect(store.getSnapshot().application.revision).toBe(0);
  await act(() => {
    field.value = 'My edited outline.';
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(() => button(host, 'Apply plan').click());
  expect(store.getSnapshot().application).toMatchObject({
    revision: 1,
    plan: { steps: ['My edited outline.', 'Record the demo.'] },
  });
  expect(
    await sdk.chat.mock.calls.at(-1)?.[0].tools[0].handler(),
  ).toMatchObject({ revision: 1 });
  expect(chat.sendMessage).toHaveBeenCalledTimes(1);
  await act(() => store.seek(0));
  const events = store.getSnapshot().events.length;
  await act(() => {
    button(host, 'Review draft').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    field.value = 'Forced';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    button(host, 'Apply plan').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
  });
  expect(store.getSnapshot().events).toHaveLength(events);
  expect(store.getSnapshot().application.revision).toBe(1);
  await act(() => store.live());
  await send(host, 'Shorten the second step');
  expect(chat.sendMessage).toHaveBeenCalledTimes(2);
  expect(
    store.getSnapshot().frame?.history?.authoring?.document ?? null,
  ).toBeNull();
  chat.isLoading = true;
  active = false;
  await act(render);
  expect(chat.stop).toHaveBeenCalled();
  await act(() => root.unmount());
  host.remove();
});

test('React parser errors hide previews and ordinary request errors allow an explicit retry', async () => {
  window.history.replaceState(null, '', '?lesson=json-parser');
  const chat = runtime();
  sdk.chat.mockReturnValue(chat);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = () =>
    root.render(
      <AuthoringWorkbenchConversation active navigation={{ ...navigation }} />,
    );
  await act(render);
  await send(host);
  const user = chat.sendMessage.mock.calls[0][0];
  chat.messages = [user];
  chat.isLoading = true;
  await act(render);
  chat.messages = [
    user,
    {
      id: 'answer',
      role: 'assistant',
      content: '{"title":"Partial","steps":["Out',
      toolCalls: [],
    },
  ];
  await act(render);
  expect(host.querySelector('[data-authoring-preview]')?.textContent).toContain(
    'Out',
  );
  chat.messages = [
    user,
    {
      id: 'answer',
      role: 'assistant',
      content: '{"title":"Partial","steps":["Outline","Record"]} trailing',
      toolCalls: [],
    },
  ];
  chat.isLoading = false;
  chat.lastRunFinishReason = 'stop';
  await act(render);
  expect(host.querySelector('[data-authoring-preview] h3')?.textContent).toBe(
    '',
  );
  expect(host.querySelector('[data-authoring-preview] ol')?.textContent).toBe(
    '',
  );
  expect(host.querySelector('[aria-label="Plan title"]')).toBeNull();
  chat.error = new Error('Provider failed');
  await act(render);
  await send(host, 'Try again');
  expect(chat.sendMessage).toHaveBeenCalledTimes(2);
  expect(sdk.store?.getSnapshot().application.revision).toBe(0);
  await act(() => root.unmount());
  host.remove();
});
