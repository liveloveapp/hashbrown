// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
const sdk = vi.hoisted(() => ({
  chat: vi.fn(),
  send: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('@hashbrownai/react', () => ({ useChat: sdk.chat }));
import { ServerWorkbenchConversation } from '../examples/quickstart/react/src/ServerWorkbench';
import { idleChat, navigation } from './workbench-server-react-chat';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test('React waits for real thread configuration and setter application before sending', async () => {
  window.history.replaceState(null, '', '?lesson=server-threads');
  const threads = {
    'server-threads': { Lighthouse: 'server-light', Harbor: 'server-harbor' },
    'public-endpoint': { Lighthouse: 'access-light', Harbor: 'access-harbor' },
  };
  const fetch = vi.fn(async (_url: unknown, options: RequestInit) =>
    Response.json(
      options.method === 'GET' && String(_url).includes('/threads/')
        ? { id: 'server-light', version: 0, messages: [] }
        : options.method === 'POST'
          ? { access: 'local-demo', threads, foreignThreadId: 'foreign' }
          : { access: 'anonymous', threads: null, foreignThreadId: null },
    ),
  );
  vi.stubGlobal('fetch', fetch);
  sdk.chat.mockImplementation(function useMockChat(options: {
    threadId?: string;
  }) {
    const [messages, setMessages] = useState<unknown[]>([]);
    return {
      messages,
      isLoading: false,
      isSending: false,
      isReceiving: false,
      isGenerating: false,
      isResuming: false,
      pendingInterrupts: undefined,
      error: undefined,
      lastRunFinishReason: undefined,
      recovery: { required: false },
      stop: vi.fn(),
      setMessages: (next: unknown[]) => {
        sdk.replace(options.threadId, next);
        setMessages(next);
      },
      sendMessage: (message: unknown) => sdk.send(options.threadId, message),
    };
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const click = async (text: string) => {
    await act(async () => {
      const button = [...host.querySelectorAll('button')].find(
        (node) => node.textContent === text,
      );
      if (!button) throw new Error(`Missing ${text}`);
      button.click();
    });
  };

  await act(async () =>
    root.render(
      <ServerWorkbenchConversation active navigation={navigation()} />,
    ),
  );
  expect(
    host.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled,
  ).not.toBe(false);
  await click('Start local session');
  await click('Load server thread');
  const textarea = host.querySelector('textarea');
  const form = host.querySelector('form');
  if (!textarea || !form) throw new Error('Missing composer');
  textarea.value = 'Continue Lighthouse';
  await act(async () => {
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });

  expect(sdk.replace).toHaveBeenCalledWith('server-light', []);
  expect(sdk.send).toHaveBeenCalledWith(
    'server-light',
    expect.objectContaining({ role: 'user', content: 'Continue Lighthouse' }),
  );
  expect(host.textContent).toContain('version 0');
  await act(async () => root.unmount());
  host.remove();
});

test('a React replay embed never asks the server for a session', async () => {
  window.history.replaceState(null, '', '?lesson=server-threads&embed=replay');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  sdk.chat.mockImplementation(idleChat);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  await act(async () =>
    root.render(
      <ServerWorkbenchConversation active navigation={navigation()} />,
    ),
  );

  expect(fetch).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
