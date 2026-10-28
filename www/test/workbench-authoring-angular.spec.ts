// @vitest-environment jsdom
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { computed, signal, untracked } from '@angular/core';
import { expect, test, vi } from 'vitest';
import ts from 'typescript';
import { injectJsonParser } from '@hashbrownai/angular';
import * as capture from '../examples/quickstart/runtime/workbench';
import * as authoring from '../examples/quickstart/runtime/workbench-authoring';
import * as controls from '../examples/quickstart/runtime/workbench-authoring-controls';
import * as history from '../examples/quickstart/runtime/workbench-history-client';
import * as lessons from '../examples/quickstart/runtime/workbench-lessons';
import * as transport from '../examples/quickstart/runtime/workbench-transport';
import * as view from '../examples/quickstart/runtime/workbench-view';
const sdk = {
  chat: vi.fn(),
  effects: [] as (() => void)[],
  destroy: [] as (() => void)[],
};
function sessionClass() {
  const source = readFileSync(
    'www/examples/quickstart/angular/src/app/authoring-workbench.ts',
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
      untracked,
      Injectable: () => (value: unknown) => value,
      Component: () => (value: unknown) => value,
      ChangeDetectionStrategy: { OnPush: 0 },
      inject: () => ({ onDestroy: (fn: () => void) => sdk.destroy.push(fn) }),
      effect: (fn: () => void) => sdk.effects.push(fn),
    },
    '@hashbrownai/angular': {
      chatResource: sdk.chat,
      injectJsonParser,
      createTool: (value: unknown) => value,
    },
    '../../../runtime/workbench': capture,
    '../../../runtime/workbench-authoring': authoring,
    '../../../runtime/workbench-authoring-controls': controls,
    '../../../runtime/workbench-history-client': history,
    '../../../runtime/workbench-lessons': lessons,
    '../../../runtime/workbench-transport': transport,
    '../../../runtime/workbench-view': view,
  };
  new Function('require', 'exports', code)(
    (id: string) => modules[id],
    exports,
  );
  return exports['AuthoringWorkbenchSession'] as new () => {
    store: capture.WorkbenchStore;
    active: ReturnType<typeof signal<boolean>>;
    send(content: string): void;
    stop(): void;
  };
}
function runtime() {
  return {
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
    stop: vi.fn(),
    setMessages: vi.fn(),
  };
}

test('Angular actual parser captures partial strings and source completion separately, and rejects stale assistant text', async () => {
  window.history.replaceState(null, '', '?lesson=natural-forms');
  sdk.effects = [];
  sdk.destroy = [];
  const chat = runtime();
  sdk.chat.mockReturnValue(chat);
  const Session = sessionClass();
  const session = new Session();
  const flush = () => sdk.effects.forEach((fn) => fn());
  session.active.set(true);
  flush();

  expect(chat.sendMessage).not.toHaveBeenCalled();
  expect(sdk.chat.mock.calls.at(-1)?.[0].tools).toHaveLength(1);
  session.send('Create plan');
  const user = chat.sendMessage.mock.calls[0][0];
  chat.value.set([user]);
  chat.isLoading.set(true);
  flush();
  chat.value.set([
    user,
    {
      id: 'answer',
      role: 'assistant',
      content: '{"title":"Demo","steps":["Out',
      toolCalls: [],
    },
  ]);
  flush();
  expect(session.store.getSnapshot().frame?.history?.authoring).toMatchObject({
    source: 'generating',
    parser: { complete: false, value: { title: 'Demo', steps: ['Out'] } },
  });
  const json = JSON.stringify({
    title: 'Demo',
    steps: ['Outline.', 'Record.'],
  });
  chat.value.set([
    user,
    { id: 'answer', role: 'assistant', content: json, toolCalls: [] },
  ]);
  flush();
  expect(session.store.getSnapshot().frame?.history?.authoring).toMatchObject({
    source: 'generating',
    parser: { complete: true },
    document: null,
  });
  expect(session.store.reviewAuthoring()).toBe(false);
  chat.isLoading.set(false);
  chat.lastRunFinishReason.set('stop');
  flush();
  expect(
    session.store.getSnapshot().frame?.history?.authoring?.document,
  ).toEqual(JSON.parse(json));
  expect(session.store.reviewAuthoring()).toBe(true);
  expect(session.store.editAuthoring('step-0', 'My outline.')).toBe(true);
  expect(session.store.applyAuthoring()).toBe(true);
  expect(
    await sdk.chat.mock.calls.at(-1)?.[0].tools[0].handler(),
  ).toMatchObject({ revision: 1, plan: { steps: ['My outline.', 'Record.'] } });
  session.send('Shorten second');
  flush();
  expect(
    session.store.getSnapshot().frame?.history?.authoring?.document ?? null,
  ).toBeNull();
  expect(session.store.reviewAuthoring()).toBe(false);
  chat.isReceiving.set(true);
  sdk.destroy.forEach((fn) => fn());
  expect(chat.stop).toHaveBeenCalled();
});

test('Angular text guards reject recovery and replay, preserve healthy values after errors and permit ordinary retry', () => {
  window.history.replaceState(null, '', '?lesson=agent-decisions');
  sdk.effects = [];
  sdk.destroy = [];
  const chat = runtime();
  sdk.chat.mockReturnValue(chat);
  const Session = sessionClass();
  const session = new Session();
  const flush = () => sdk.effects.forEach((fn) => fn());
  session.active.set(true);
  flush();
  expect(sdk.chat.mock.calls.at(-1)?.[0].tools).toEqual([]);
  session.send('Outline');
  const user = chat.sendMessage.mock.calls[0][0];
  chat.value.set([user]);
  chat.isLoading.set(true);
  flush();
  chat.value.set([
    user,
    {
      id: 'handler',
      role: 'assistant',
      content: 'Application handler: outline the demo.',
      toolCalls: [],
    },
  ]);
  chat.isLoading.set(false);
  chat.lastRunFinishReason.set('stop');
  flush();
  expect(session.store.getSnapshot().frame?.history?.authoring).toBeUndefined();
  expect(session.store.getSnapshot().frame?.history?.sdk.messages).toHaveLength(
    2,
  );
  session.store.seek(0);
  session.send('Forced replay');
  expect(chat.sendMessage).toHaveBeenCalledTimes(1);
  session.store.live();
  chat.recovery.set({ required: true });
  session.send('Blocked recovery');
  expect(chat.sendMessage).toHaveBeenCalledTimes(1);
  chat.recovery.set({ required: false });
  chat.error.set(new Error('Provider failed'));
  vi.spyOn(chat, 'value').mockImplementation(() => {
    throw new Error('Must not read errored resource');
  });
  flush();
  expect(session.store.getSnapshot().frame?.history?.sdk.messages).toHaveLength(
    2,
  );
  session.send('Retry');
  expect(chat.sendMessage).toHaveBeenCalledTimes(2);
  sdk.destroy.forEach((fn) => fn());
});
