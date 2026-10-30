// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import {
  serverWorkbenchAngularChat as angularChat,
  serverWorkbenchSessionClass,
  serverWorkbenchSessionSdk,
} from './workbench-server-angular-session';
const sdk = serverWorkbenchSessionSdk();
const sessionClass = () => serverWorkbenchSessionClass(sdk);

test('Angular applies reactive SDK identity and explicit replacement before enabling send', async () => {
  window.history.replaceState(null, '', '?lesson=server-threads');
  sdk.effects = [];
  sdk.destroy = [];
  const runtime = angularChat();
  sdk.chat.mockReturnValue(runtime);
  const threads = {
    'server-threads': { Lighthouse: 'server-light', Harbor: 'server-harbor' },
    'public-endpoint': { Lighthouse: 'access', Harbor: 'access-harbor' },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, options: RequestInit) =>
      Response.json(
        String(url).includes('/threads/')
          ? {
              id: 'server-light',
              version: 0,
              messages: [
                { role: 'user', content: 'Saved question' },
                { role: 'assistant', content: 'Saved answer' },
              ],
            }
          : options.method === 'POST'
            ? { access: 'local-demo', threads, foreignThreadId: 'foreign' }
            : { access: 'anonymous', threads: null, foreignThreadId: null },
      ),
    ),
  );
  const Session = sessionClass();
  const session = new Session();
  const flush = () => sdk.effects.forEach((fn) => fn());
  session.active.set(true);
  session.mount();
  await vi.waitFor(() => expect(session.controller.state().busy).toBe(false));
  await session.controller.startSession();

  const load = session.controller.load();
  await vi.waitFor(() =>
    expect(sdk.chat.mock.calls[0][0].threadId()).toBe('server-light'),
  );
  expect(session.controller.sendable()).toBe(false);
  flush();
  flush();
  await load;
  flush();
  session.send('Continue');

  expect(sdk.chat.mock.calls[0][0].threadId()).toBe('server-light');
  expect(runtime.setMessages).toHaveBeenCalledWith([
    { role: 'user', content: 'Saved question' },
    { role: 'assistant', content: 'Saved answer', toolCalls: [] },
  ]);
  expect(runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({ content: 'Continue' }),
  );
  sdk.destroy.forEach((fn) => fn());
});

test('an Angular replay embed never asks the server for a session', async () => {
  window.history.replaceState(null, '', '?lesson=server-threads&embed=replay');
  sdk.effects = [];
  sdk.destroy = [];
  sdk.chat.mockReturnValue(angularChat());
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const Session = sessionClass();
  const session = new Session();
  session.active.set(true);

  session.mount();
  await session.controller.startSession();

  expect(session.controller.access).toBe('replay');
  expect(fetch).not.toHaveBeenCalled();
  sdk.destroy.forEach((fn) => fn());
  vi.unstubAllGlobals();
});
