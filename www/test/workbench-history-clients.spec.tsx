// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import type { WorkbenchStore } from '../examples/quickstart/runtime/workbench';
const sdk = vi.hoisted(() => ({
  chat: vi.fn(),
  store: undefined as WorkbenchStore | undefined,
}));
vi.mock('../examples/quickstart/runtime/workbench', async (importOriginal) => {
  const source =
    await importOriginal<
      typeof import('../examples/quickstart/runtime/workbench')
    >();
  return {
    ...source,
    createWorkbenchStore: (
      ...args: Parameters<typeof source.createWorkbenchStore>
    ) => {
      sdk.store = source.createWorkbenchStore(...args);
      return sdk.store;
    },
  };
});
vi.mock('@hashbrownai/react', () => ({ useChat: sdk.chat }));
import { HistoryWorkbenchConversation } from '../examples/quickstart/react/src/HistoryWorkbench';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const navigation = {
  currentId: '1',
  conversations: [{ id: '1', label: 'Plan' }],
  select: vi.fn(),
  create: vi.fn(),
};
function button(host: HTMLElement, text: string) {
  const result = [...host.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === text,
  );
  if (!result) throw new Error(`Missing ${text}`);
  return result;
}
test('React binds real chat replacement and captures saved state without autosaving', async () => {
  window.history.replaceState(null, '', '?lesson=message-history');
  const runtime = {
    messages: [] as unknown[],
    isLoading: false,
    isSending: false,
    isReceiving: false,
    isGenerating: false,
    isResuming: false,
    recovery: { required: false },
    pendingInterrupts: undefined,
    error: undefined as unknown,
    lastRunFinishReason: undefined as string | undefined,
    sendMessage: vi.fn(),
    stop: vi.fn(),
    setMessages: vi.fn(),
  };
  sdk.chat.mockReturnValue(runtime);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let active = true;
  const render = () =>
    root.render(
      <HistoryWorkbenchConversation
        active={active}
        navigation={{ ...navigation }}
      />,
    );

  await act(render);
  expect(sdk.chat.mock.calls.at(-1)?.[0].system).toContain('plain text');
  expect(runtime.sendMessage).not.toHaveBeenCalled();
  const composer = host.querySelector('textarea');
  const form = host.querySelector('form');
  if (!composer || !form) throw new Error('Missing composer');
  composer.value = 'Lighthouse';
  await act(() =>
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    ),
  );
  const user = runtime.sendMessage.mock.calls[0][0];
  runtime.messages = [user];
  runtime.isLoading = true;
  await act(render);
  runtime.messages = [
    user,
    {
      id: 'answer',
      role: 'assistant',
      content: '<b>Lighthouse</b>',
      toolCalls: [],
    },
  ];
  runtime.isLoading = false;
  runtime.lastRunFinishReason = 'stop';
  await act(render);
  expect(host.querySelector('b')).toBeNull();
  expect(button(host, 'Keep completed text').disabled).toBe(false);
  await act(() => button(host, 'Keep completed text').click());
  runtime.setMessages.mockImplementationOnce(() => {
    throw new Error('replacement failed');
  });
  await act(() => button(host, 'Clear messages').click());
  expect(host.textContent).toContain('replacement failed');
  await act(() => button(host, 'Clear messages').click());
  expect(runtime.setMessages).toHaveBeenLastCalledWith([]);
  runtime.messages = [];
  await act(render);
  await act(() => button(host, 'Restore kept text').click());
  expect(runtime.setMessages.mock.calls.at(-1)?.[0][1]).toEqual(
    expect.objectContaining({
      role: 'assistant',
      toolCalls: [],
      content: '<b>Lighthouse</b>',
    }),
  );
  runtime.messages = runtime.setMessages.mock.calls.at(-1)?.[0] ?? [];
  await act(render);
  expect(button(host, 'Keep completed text').disabled).toBe(true);
  const count = runtime.setMessages.mock.calls.length;
  const store = sdk.store;
  if (!store) throw new Error('Missing store');
  await act(() => store.seek(0));
  await act(() =>
    button(host, 'Clear messages').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    ),
  );
  expect(runtime.setMessages).toHaveBeenCalledTimes(count);
  await act(() => store.live());
  runtime.error = new Error('ordinary request failure');
  await act(render);
  composer.value = 'Continue after failure';
  await act(() =>
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    ),
  );
  expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  runtime.isLoading = true;
  active = false;
  await act(render);
  expect(runtime.stop).toHaveBeenCalled();
  await act(() => root.unmount());
  host.remove();
});

test('React saved slot reads occur on mount selection and load, and replay cannot dispatch storage writes', async () => {
  window.history.replaceState(null, '', '?lesson=save-text-conversations');
  const runtime = {
    messages: [] as unknown[],
    isLoading: false,
    isSending: false,
    isReceiving: false,
    isGenerating: false,
    isResuming: false,
    recovery: { required: false },
    pendingInterrupts: undefined,
    error: undefined,
    lastRunFinishReason: undefined,
    sendMessage: vi.fn(),
    stop: vi.fn(),
    setMessages: vi.fn(),
  };
  const documentText = {
    version: 1,
    messages: [
      { role: 'user', content: 'Harbor' },
      { role: 'assistant', content: 'Outline, then record.' },
    ],
  };
  const get = vi
    .spyOn(Storage.prototype, 'getItem')
    .mockReturnValue(JSON.stringify(documentText));
  const set = vi.spyOn(Storage.prototype, 'setItem');
  const remove = vi.spyOn(Storage.prototype, 'removeItem');
  sdk.chat.mockReturnValue(runtime);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = () =>
    root.render(
      <HistoryWorkbenchConversation active navigation={{ ...navigation }} />,
    );

  await act(render);
  await act(render);
  expect(get).toHaveBeenCalledTimes(1);
  const select = host.querySelector<HTMLSelectElement>(
    '[aria-label="Saved text"]',
  );
  if (!select) throw new Error('Missing slot selector');
  await act(() => {
    select.value = 'Harbor';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(get).toHaveBeenCalledTimes(2);
  await act(() => button(host, 'Load text').click());
  expect(get).toHaveBeenCalledTimes(3);
  expect(runtime.setMessages).toHaveBeenCalledWith([
    { role: 'user', content: 'Harbor' },
    { role: 'assistant', content: 'Outline, then record.', toolCalls: [] },
  ]);
  runtime.messages = runtime.setMessages.mock.calls[0][0];
  await act(render);
  expect(host.querySelector('.wb-history-reply')?.textContent).toBe(
    'Outline, then record.',
  );
  expect(button(host, 'Save text').disabled).toBe(true);
  const store = sdk.store;
  if (!store) throw new Error('Missing store');
  await act(() => store.seek(0));
  await act(() => {
    select.value = 'Lighthouse';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(() =>
    button(host, 'Clear saved text').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    ),
  );
  expect(get).toHaveBeenCalledTimes(3);
  expect(set).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  await act(() => root.unmount());
  expect(get).toHaveBeenCalledTimes(3);
  host.remove();
});
