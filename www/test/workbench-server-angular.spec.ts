// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { computed, signal } from '@angular/core';
import ts from 'typescript';
import * as capture from '../examples/quickstart/runtime/workbench';
import * as lessons from '../examples/quickstart/runtime/workbench-lessons';
import * as transport from '../examples/quickstart/runtime/workbench-transport';
import * as view from '../examples/quickstart/runtime/workbench-view';
import * as history from '../examples/quickstart/runtime/workbench-history';
import * as actions from '../examples/quickstart/runtime/workbench-history-client';
import * as server from '../examples/quickstart/runtime/workbench-server-history';
import * as controls from '../examples/quickstart/runtime/workbench-server-controls';
import { expect, test, vi } from 'vitest';
const sdk = {
  chat: vi.fn(),
  effects: [] as (() => void)[],
  destroy: [] as (() => void)[],
};
// Evaluate the unchanged session class after TypeScript decorator compilation.
// Browser verification separately compiles and exercises the Angular template.
function sessionClass() {
  const source = readFileSync(
    'www/examples/quickstart/angular/src/app/server-workbench.ts',
    'utf8',
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports: Record<string, unknown> = {};
  const modules: Record<string, unknown> = {
    '@angular/core': {
      computed,
      signal,
      Injectable: () => (value: unknown) => value,
      Component: () => (value: unknown) => value,
      ChangeDetectionStrategy: { OnPush: 0 },
      inject: () => ({ onDestroy: (fn: () => void) => sdk.destroy.push(fn) }),
      effect: (fn: () => void) => sdk.effects.push(fn),
    },
    '@hashbrownai/angular': { chatResource: sdk.chat },
    '../../../runtime/workbench': capture,
    '../../../runtime/workbench-lessons': lessons,
    '../../../runtime/workbench-transport': transport,
    '../../../runtime/workbench-view': view,
    '../../../runtime/workbench-history': history,
    '../../../runtime/workbench-history-client': actions,
    '../../../runtime/workbench-server-history': server,
    '../../../runtime/workbench-server-controls': controls,
  };
  new Function('require', 'exports', code)(
    (id: string) => modules[id],
    exports,
  );
  return exports['ServerWorkbenchSession'] as new () => {
    store: capture.WorkbenchStore;
    active: ReturnType<typeof signal<boolean>>;
    mount(): void;
    send(content: string): void;
    controller: ReturnType<typeof server.createWorkbenchServerHistory>;
  };
}

test('Angular applies reactive SDK identity and explicit replacement before enabling send', async () => {
  window.history.replaceState(null, '', '?lesson=server-threads');
  sdk.effects = [];
  sdk.destroy = [];
  const runtime = {
    value: signal<unknown[]>([]),
    error: signal<unknown>(undefined),
    isLoading: signal(false),
    isSending: signal(false),
    isReceiving: signal(false),
    isGenerating: signal(false),
    isResuming: signal(false),
    pendingInterrupts: signal<unknown>(undefined),
    recovery: signal({ required: false }),
    lastRunFinishReason: signal<string | undefined>(undefined),
    sendMessage: vi.fn(),
    setMessages: vi.fn((messages: unknown[]) => runtime.value.set(messages)),
    stop: vi.fn(),
  };
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
