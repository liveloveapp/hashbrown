// @vitest-environment jsdom
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { computed, signal } from '@angular/core';
import { expect, test, vi } from 'vitest';
import ts from 'typescript';
import type { structuredChatResource } from '@hashbrownai/angular';
import * as capture from '../examples/quickstart/runtime/workbench';
import * as controls from '../examples/quickstart/runtime/workbench-local-controls';
import * as local from '../examples/quickstart/runtime/workbench-local-models';
import * as lessons from '../examples/quickstart/runtime/workbench-lessons';
import * as view from '../examples/quickstart/runtime/workbench-view';

test('Angular native resource prepares explicitly, retains history and guards inactive sends and replay callbacks', async () => {
  const effects: (() => void)[] = [];
  const cleanup: (() => void)[] = [];
  const chat = {
    value: signal<unknown[]>([]),
    lastAssistantMessage: signal<unknown>(undefined),
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
  const resource = vi.fn(
    (options: Parameters<typeof structuredChatResource>[0]) => {
      void options;
      return chat;
    },
  );
  const availability = vi.fn(async () => 'available');
  vi.stubGlobal('LanguageModel', { availability, create: vi.fn() });
  const source = readFileSync(
    'www/examples/quickstart/angular/src/app/local-models-workbench.ts',
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
      inject: () => ({ onDestroy: (fn: () => void) => cleanup.push(fn) }),
      effect: (fn: () => void) => effects.push(fn),
    },
    '@hashbrownai/angular': { structuredChatResource: resource },
    '../../../runtime/workbench': capture,
    '../../../runtime/workbench-local-controls': controls,
    '../../../runtime/workbench-local-models': local,
    '../../../runtime/workbench-lessons': lessons,
    '../../../runtime/workbench-view': view,
  };
  new Function('require', 'exports', code)(
    (id: string) => modules[id],
    exports,
  );
  const Session = exports['LocalModelsWorkbenchSession'] as new () => {
    store: capture.WorkbenchStore;
    active: ReturnType<typeof signal<boolean>>;
    preparation: ReturnType<typeof controls.createWorkbenchLocalController>;
    send(content: string): void;
    stop(): void;
  };
  const session = new Session();
  session.active.set(true);

  expect(availability).not.toHaveBeenCalled();
  session.send('Unprepared');
  expect(chat.sendMessage).not.toHaveBeenCalled();
  await session.preparation.prepare();
  session.send('Create a plan');
  const user = chat.sendMessage.mock.calls[0][0];
  const proposal = { title: 'Native Angular', steps: ['Outline', 'Record'] };
  chat.value.set([
    user,
    { id: 'answer', role: 'assistant', content: proposal },
  ]);
  session.store.record('source', { source: 'local-model' });
  session.store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'answer',
    delta: JSON.stringify(proposal),
  });
  session.store.record('event', { type: 'RUN_FINISHED' });
  effects.forEach((effect) => effect());

  expect(session.store.getSnapshot().status).toBe('complete');
  expect(session.store.accept(proposal)).toBe(true);
  session.send('Shorten step two');
  expect(chat.sendMessage).toHaveBeenCalledTimes(2);
  session.stop();
  session.active.set(false);
  session.send('Inactive');
  expect(chat.sendMessage).toHaveBeenCalledTimes(2);
  session.store.seek(0);
  const events = session.store.getSnapshot().events.length;
  effects.forEach((effect) => effect());
  expect(session.store.getSnapshot().events).toHaveLength(events);
  const resourceOptions = resource.mock.calls[0]?.[0];
  expect(resourceOptions).toBeDefined();
  expect(resourceOptions?.tools ?? []).toHaveLength(0);
  cleanup.forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});
