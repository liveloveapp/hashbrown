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
    'www/examples/quickstart/angular/src/app/history-workbench.ts',
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
  };
  new Function('require', 'exports', code)(
    (id: string) => modules[id],
    exports,
  );
  return exports['HistoryWorkbenchSession'] as new () => {
    store: capture.WorkbenchStore;
    active: ReturnType<typeof signal<boolean>>;
    mount(): void;
    send(content: string): void;
    actions: ReturnType<typeof actions.createHistoryActions>;
  };
}

test('Angular observes every resource guard, retains healthy text on errors, and uses the public setter', () => {
  window.history.replaceState(null, '', '?lesson=save-text-conversations');
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
    setMessages: vi.fn(),
    stop: vi.fn(),
  };
  sdk.chat.mockReturnValue(runtime);
  const get = vi.spyOn(Storage.prototype, 'getItem');
  const set = vi.spyOn(Storage.prototype, 'setItem');
  const Session = sessionClass();
  const session = new Session();
  const flush = () => sdk.effects.forEach((fn) => fn());

  expect(get).not.toHaveBeenCalled();
  session.active.set(true);
  session.mount();
  flush();
  expect(get).toHaveBeenCalledTimes(1);
  session.send('Lighthouse');
  const user = runtime.sendMessage.mock.calls[0][0];
  runtime.value.set([user]);
  runtime.isLoading.set(true);
  flush();
  const complete = [
    user,
    {
      id: 'reply',
      role: 'assistant',
      content: 'Lighthouse: outline then record.',
      toolCalls: [],
    },
  ];
  runtime.value.set(complete);
  runtime.isLoading.set(false);
  runtime.lastRunFinishReason.set('stop');
  flush();
  session.actions.save();
  expect(set).toHaveBeenCalledTimes(1);
  session.actions.keep();
  session.actions.replace('clear');
  expect(runtime.setMessages).toHaveBeenCalledWith([]);
  runtime.value.set([]);
  flush();
  session.actions.replace('restore');
  expect(runtime.setMessages.mock.calls.at(-1)?.[0][1].toolCalls).toEqual([]);
  runtime.value.set(runtime.setMessages.mock.calls.at(-1)?.[0] ?? []);
  flush();
  expect(session.actions.savable()).toBe(false);
  runtime.error.set(new Error('resource failed'));

  runtime.value = (() => {
    throw new Error('must not read errored value');
  }) as typeof runtime.value;
  flush();
  expect(session.store.getSnapshot().frame?.history?.sdk.messages).toHaveLength(
    2,
  );
  session.actions.clearSlot();
  expect(set).toHaveBeenCalledTimes(1);
  session.send('Continue after the failed request');
  expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  runtime.isReceiving.set(true);
  sdk.destroy.forEach((fn) => fn());
  expect(runtime.stop).toHaveBeenCalled();
  get.mockRestore();
  set.mockRestore();
});
