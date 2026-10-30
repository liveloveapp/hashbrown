// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://workbench.hashbrown.dev/react.html?lesson=server-threads"}
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock('@hashbrownai/react', () => ({ useChat: sdk.chat }));
import { ServerWorkbenchConversation } from '../examples/quickstart/react/src/ServerWorkbench';
import {
  serverWorkbenchAngularChat,
  serverWorkbenchSessionClass,
  serverWorkbenchSessionSdk,
} from './workbench-server-angular-session';
import { idleChat, navigation } from './workbench-server-react-chat';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test('off a loopback host, React shows how to run a loopback lesson locally', async () => {
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

  const controls = host.querySelector(
    '[aria-label="Server conversation controls"]',
  );
  const labels = [...host.querySelectorAll('button')].map(
    (button) => button.textContent,
  );
  expect(controls?.textContent).toBe(
    'This lesson runs on a local server. Run the example',
  );
  expect(controls?.querySelector('a')?.getAttribute('href')).toBe(
    'https://hashbrown.dev/docs/react/start/workbench#run-the-example',
  );
  expect(labels).not.toContain('Start local session');
  expect(labels).not.toContain('Try anonymous request');
  expect(controls?.querySelector('[role=alert]')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

test('off a loopback host, the Angular session never asks for a session', async () => {
  const angular = serverWorkbenchSessionSdk();
  angular.chat.mockReturnValue(serverWorkbenchAngularChat());
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const Session = serverWorkbenchSessionClass(angular);
  const session = new Session();
  session.active.set(true);

  session.mount();
  await session.controller.startSession();

  expect(session.controller.access).toBe('hosted');
  expect(fetch).not.toHaveBeenCalled();
  angular.destroy.forEach((fn) => fn());
  vi.unstubAllGlobals();
});
