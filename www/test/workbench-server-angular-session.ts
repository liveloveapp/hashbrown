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
import { vi } from 'vitest';

/** The mocked Angular SDK and lifecycle hooks the session class sees. */
export interface ServerWorkbenchSessionSdk {
  readonly chat: ReturnType<typeof vi.fn>;
  effects: (() => void)[];
  destroy: (() => void)[];
}

/** Creates an empty mocked Angular SDK for {@link serverWorkbenchSessionClass}. */
export function serverWorkbenchSessionSdk(): ServerWorkbenchSessionSdk {
  return { chat: vi.fn(), effects: [], destroy: [] };
}

/**
 * Evaluates the unchanged Angular server session class after TypeScript
 * decorator compilation, against a mocked SDK. Browser verification separately
 * compiles and exercises the Angular template.
 *
 * @param sdk - The mocked SDK, from {@link serverWorkbenchSessionSdk}.
 */
export function serverWorkbenchSessionClass(sdk: ServerWorkbenchSessionSdk) {
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

/** A mocked Angular `chatResource` with idle signals and spied actions. */
export function serverWorkbenchAngularChat() {
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
  return runtime;
}
