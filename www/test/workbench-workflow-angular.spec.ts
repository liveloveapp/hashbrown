// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { computed, signal } from '@angular/core';
import ts from 'typescript';
import * as capture from '../examples/quickstart/runtime/workbench';
import * as lessons from '../examples/quickstart/runtime/workbench-lessons';
import * as transport from '../examples/quickstart/runtime/workbench-transport';
import * as view from '../examples/quickstart/runtime/workbench-view';
import * as forms from '../examples/quickstart/runtime/workbench-workflow-form';
import * as workflows from '../examples/quickstart/runtime/workbench-workflows';
import { expect, test, vi } from 'vitest';
const sdk = { chat: vi.fn() };
// Evaluate the unchanged session class after TypeScript decorator compilation.
// Browser verification separately compiles and exercises the Angular template.
function sessionClass() {
  const source = readFileSync(
    'www/examples/quickstart/angular/src/app/workflow-workbench.ts',
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
      inject: () => ({ onDestroy: vi.fn() }),
      effect: vi.fn(),
    },
    '@hashbrownai/angular': { chatResource: sdk.chat },
    '../../../runtime/workbench': capture,
    '../../../runtime/workbench-lessons': lessons,
    '../../../runtime/workbench-transport': transport,
    '../../../runtime/workbench-view': view,
    '../../../runtime/workbench-workflow-form': forms,
    '../../../runtime/workbench-workflows': workflows,
  };
  new Function('require', 'exports', code)(
    (id: string) => modules[id],
    exports,
  );
  return exports['WorkflowWorkbenchSession'] as new () => {
    store: capture.WorkbenchStore;
    editTitle(title: string): void;
    applyState(): void;
    send(content: string): void;
    answer(batchId: string, id: string, answer: string): void;
    resume(batchId: string, cancel?: boolean): void;
  };
}
import { workbenchWorkflowInitialState } from '../examples/quickstart/runtime/workbench-workflows';

test('Angular application forms call real resource bindings with complete original batch and synchronous rejection recovery', () => {
  window.history.replaceState(null, '', '?lesson=interrupts');
  const runtime = {
    state: signal(workbenchWorkflowInitialState),
    value: signal<unknown[]>([]),
    error: signal(undefined),
    isLoading: signal(false),
    isResuming: signal(false),
    pendingInterrupts: signal<unknown>(undefined),
    recovery: signal({ required: false, revision: 0 }),
    lastRunFinishReason: signal(undefined),
    setState: vi.fn(),
    sendMessage: vi.fn(),
    stop: vi.fn(),
    resume: vi.fn(),
  };
  sdk.chat.mockReturnValue(runtime);
  const Session = sessionClass();
  const session = new Session();

  session.editTitle('A local title');
  session.applyState();

  expect(runtime.setState).toHaveBeenCalledWith({
    ...workbenchWorkflowInitialState,
    planTitle: 'A local title',
  });
  expect(runtime.sendMessage).not.toHaveBeenCalled();
  session.send('Explain');
  session.applyState();
  expect(runtime.setState).toHaveBeenCalledTimes(1);
  const user = runtime.sendMessage.mock.calls[0][0];
  session.store.recordWorkflow({
    state: workbenchWorkflowInitialState,
    messages: [user],
    pendingInterrupts: {
      id: 'original',
      interrupts: [
        { id: 'one', reason: 'approval' },
        { id: 'two', reason: 'approval' },
      ],
    },
    isLoading: false,
    isResuming: false,
  });
  session.answer('original', 'one', 'approve');
  session.resume('original');
  expect(runtime.resume).not.toHaveBeenCalled();
  session.answer('original', 'two', 'decline');
  runtime.resume.mockImplementationOnce(() => {
    throw new Error('synchronous validation');
  });
  session.resume('original');
  expect(session.store.getSnapshot().status).toBe('paused');
  session.resume('original');
  session.resume('original');

  expect(runtime.resume).toHaveBeenCalledTimes(2);
  expect(runtime.resume).toHaveBeenLastCalledWith({
    batchId: 'original',
    entries: [
      { interruptId: 'one', status: 'resolved', payload: { approved: true } },
      { interruptId: 'two', status: 'resolved', payload: { approved: false } },
    ],
  });
});
