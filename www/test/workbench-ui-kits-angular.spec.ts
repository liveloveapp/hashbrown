// @vitest-environment jsdom
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { computed, signal, type WritableSignal } from '@angular/core';
import { createUiKit } from '@hashbrownai/angular';
import { expect, test, vi } from 'vitest';
import ts from 'typescript';
import * as capture from '../examples/quickstart/runtime/workbench';
import * as kits from '../examples/quickstart/runtime/workbench-ui-kits';
import * as lessons from '../examples/quickstart/runtime/workbench-lessons';
import * as transport from '../examples/quickstart/runtime/workbench-transport';
import * as view from '../examples/quickstart/runtime/workbench-view';

import type { UiKitWorkbenchSession } from '../examples/quickstart/angular/src/app/ui-kit-workbench';
type Session = Pick<
  UiKitWorkbenchSession,
  'store' | 'kit' | 'active' | 'mounted' | 'send' | 'stop'
>;
interface Card {
  readonly title: WritableSignal<string>;
  readonly steps: WritableSignal<string[]>;
  allowed(): boolean;
  accept(): void;
}

function setup(lesson: kits.WorkbenchUiLesson) {
  window.history.replaceState(null, '', `?lesson=${lesson}`);
  const effects: (() => void)[] = [];
  const destroy: (() => void)[] = [];
  const metadata = new Map<string, { template: string }>();
  const chat = {
    value: signal<unknown[]>([]),
    error: signal<unknown>(undefined),
    lastAssistantMessage: signal<unknown>(undefined),
    isLoading: signal(false),
    isResuming: signal(false),
    pendingInterrupts: signal<unknown>(undefined),
    lastRunFinishReason: signal<string | undefined>(undefined),
    sendMessage: vi.fn(),
    stop: vi.fn(),
    setMessages: vi.fn(),
  };
  const uiChatResource = vi.fn(() => chat);
  const exports = {} as {
    UiKitWorkbenchSession: new () => Session;
    UiKitWorkbenchAnswer: unknown;
    KitSummaryCard: new () => Card;
    StepsCard: new () => Card;
  };
  const origin = signal({ turn: 1, revision: 0 });
  const input = Object.assign(() => signal(undefined), {
    required: () => signal(undefined),
  });
  const modules: Record<string, unknown> = {
    '@angular/core': {
      computed,
      signal,
      input,
      Injectable: () => (value: unknown) => value,
      Component:
        (config: { template: string }) => (value: { name: string }) => {
          metadata.set(value.name, config);
          return value;
        },
      ChangeDetectionStrategy: { OnPush: 0 },
      inject: (token: unknown) =>
        token === exports.UiKitWorkbenchSession
          ? session
          : token === exports.UiKitWorkbenchAnswer
            ? { origin }
            : { onDestroy: (fn: () => void) => destroy.push(fn) },
      effect: (fn: () => void) => effects.push(fn),
    },
    '@hashbrownai/angular': {
      createUiKit,
      uiChatResource,
      createTool: (value: unknown) => value,
      exposeComponent: (component: unknown, config: { input: unknown }) => ({
        ...config,
        component,
        props: config.input,
      }),
    },
    '../../../runtime/workbench': capture,
    '../../../runtime/workbench-ui-kits': kits,
    '../../../runtime/workbench-lessons': lessons,
    '../../../runtime/workbench-transport': transport,
    '../../../runtime/workbench-view': view,
  };
  const code = ts.transpileModule(
    readFileSync(
      'www/examples/quickstart/angular/src/app/ui-kit-workbench.ts',
      'utf8',
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new Function('require', 'exports', code)(
    (id: string) => modules[id],
    exports,
  );
  const session = new exports.UiKitWorkbenchSession();
  session.active.set(true);
  session.mounted.set(true);
  return {
    session,
    chat,
    exports,
    metadata,
    origin,
    destroy,
    uiChatResource,
    flush: () => effects.forEach((fn) => fn()),
  };
}

for (const lesson of ['ui-kits', 'ui-chatbot'] as const) {
  test(`Angular ${lesson} uses a real normalized kit, current assistant source and guarded accept callbacks`, async () => {
    const {
      session,
      chat,
      exports,
      metadata,
      origin,
      destroy,
      uiChatResource,
      flush,
    } = setup(lesson);
    const store: capture.WorkbenchStore = session.store;
    const props = { title: 'Demo', steps: ['Outline', 'Record'] };
    const document = { ui: [{ SummaryCard: { props } }] };
    const content = {
      ui: [
        {
          SummaryCard: {
            props: { complete: true, partialValue: props, value: props },
          },
        },
      ],
    };

    expect(JSON.parse(session.kit.serializedSchema)).toEqual(
      kits.getWorkbenchUiResponseSchema(lesson),
    );
    expect(
      [...session.kit.registry.values()].map(
        (entry: { name: string; fallback?: unknown }) => [
          entry.name,
          !!entry.fallback,
        ],
      ),
    ).toEqual([
      ['SummaryCard', true],
      [lesson === 'ui-kits' ? 'StepsCard' : 'PlanReading', true],
    ]);
    expect(metadata.get('KitFallback')?.template).toContain(
      'data-kit-fallback',
    );
    expect(metadata.get('PlanReading')?.template).not.toContain('button');
    expect(await uiChatResource.mock.calls[0][0].tools[0].handler()).toEqual(
      store.getSnapshot().application,
    );
    session.send('Create plan');
    const user = chat.sendMessage.mock.calls[0][0];
    chat.value.set([user]);
    chat.isLoading.set(true);
    chat.lastAssistantMessage.set({ id: 'stale', role: 'assistant', content });
    flush();
    expect(store.getSnapshot().frame?.props).toBeNull();
    store.record('event', {
      type: 'TEXT_MESSAGE_CONTENT',
      delta: JSON.stringify(document),
    });
    const assistant = { id: 'answer', role: 'assistant', content };
    chat.value.set([user, assistant]);
    chat.lastAssistantMessage.set(assistant);
    flush();
    const card = new exports.KitSummaryCard();
    card.title.set(props.title);
    card.steps.set(props.steps);
    card.accept();
    expect(store.getSnapshot().application.revision).toBe(0);
    chat.isLoading.set(false);
    chat.lastRunFinishReason.set('stop');
    flush();
    expect(card.allowed()).toBe(true);
    store.seek(0);
    card.accept();
    expect(store.getSnapshot().application.revision).toBe(0);
    store.live();
    session.active.set(false);
    card.accept();
    expect(store.getSnapshot().application.revision).toBe(0);
    session.active.set(true);
    card.accept();
    card.accept();
    expect(store.getSnapshot().application.revision).toBe(1);
    expect(
      await uiChatResource.mock.calls[0][0].tools[0].handler(),
    ).toMatchObject({ revision: 1, plan: props });
    session.send('Next');
    const before = store.getSnapshot();
    flush();
    expect(store.getSnapshot()).toBe(before);
    let secondCard: Card | undefined;
    if (lesson === 'ui-kits') {
      const secondUser = chat.sendMessage.mock.calls[1][0];
      const secondContent = {
        ui: [
          {
            StepsCard: {
              props: { complete: true, partialValue: props, value: props },
            },
          },
        ],
      };
      store.record('event', {
        type: 'TEXT_MESSAGE_CONTENT',
        delta: JSON.stringify({ ui: [{ StepsCard: { props } }] }),
      });
      const assistant = { id: 'a2', role: 'assistant', content: secondContent };
      chat.value.set([user, secondUser, assistant]);
      chat.lastAssistantMessage.set(assistant);
      flush();
      origin.set({ turn: 2, revision: 1 });
      secondCard = new exports.StepsCard();
      secondCard.title.set(props.title);
      secondCard.steps.set(props.steps);
      expect(secondCard.allowed()).toBe(true);
    }
    destroy.forEach((fn) => fn());
    const disposed = store.getSnapshot();
    secondCard?.accept();
    card.accept();
    session.send('Detached');
    flush();
    expect(store.getSnapshot()).toBe(disposed);
  });
}
