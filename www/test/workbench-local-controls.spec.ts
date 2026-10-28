// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import {
  createWorkbenchLocalController,
  mountWorkbenchLocalControls,
} from '../examples/quickstart/runtime/workbench-local-controls';

test('preparation waits for an explicit action and cannot infer or write application state', async () => {
  const store = createWorkbenchStore('structured', { localModel: true });
  const availability = vi.fn(async () => 'available' as const);
  const create = vi.fn();
  const controller = createWorkbenchLocalController({
    store,
    active: () => true,
    model: () => ({ availability, create }),
  });

  expect(availability).not.toHaveBeenCalled();
  expect(controller.canSend()).toBe(false);
  await controller.prepare();

  expect(availability).toHaveBeenCalledTimes(1);
  expect(create).not.toHaveBeenCalled();
  expect(controller.canSend()).toBe(true);
  expect(store.getSnapshot().application.revision).toBe(0);
  expect(store.getSnapshot().turn).toBe(0);
  controller.dispose();
});

test('stop invalidates preparation synchronously and destroys late native sessions', async () => {
  const store = createWorkbenchStore('structured', { localModel: true });
  let resolve!: (session: { destroy(): void }) => void;
  const destroy = vi.fn();
  const controller = createWorkbenchLocalController({
    store,
    active: () => true,
    model: () => ({
      availability: async () => 'downloadable',
      create: () =>
        new Promise((done) => {
          resolve = done;
        }),
    }),
  });
  const preparation = controller.prepare();
  await Promise.resolve();
  await Promise.resolve();

  controller.stop();
  resolve({ destroy });
  await preparation;
  await Promise.resolve();

  expect(controller.canSend()).toBe(false);
  expect(store.getSnapshot().frame?.localModel?.state).toBe('cancelled');
  expect(destroy).toHaveBeenCalledTimes(1);
  controller.dispose();
});

test('replay preparation controls display captured facts and never invoke native APIs', async () => {
  const store = createWorkbenchStore('structured', { localModel: true });
  const availability = vi.fn(async () => 'available' as const);
  const controller = createWorkbenchLocalController({
    store,
    active: () => true,
    model: () => ({ availability, create: vi.fn() }),
  });
  const host = document.createElement('div');
  const controls = mountWorkbenchLocalControls(host, store, controller);
  await controller.prepare();
  store.seek(0);

  await controller.prepare();
  host.querySelector<HTMLButtonElement>('[data-local-prepare]')?.click();

  expect(availability).toHaveBeenCalledTimes(1);
  expect(
    host.querySelector<HTMLButtonElement>('[data-local-prepare]')?.disabled,
  ).toBe(true);
  expect(host.textContent).not.toContain('ready');
  controls.dispose();
  controller.dispose();
});

test('local proposal acceptance requires the original document and a current native completion', async () => {
  const { observeWorkbenchLocalRun, canAcceptWorkbenchLocalPlan } =
    await import('../examples/quickstart/runtime/workbench-local-controls');
  const store = createWorkbenchStore('structured', { localModel: true });
  store.beginLocalPreparation('prepared');
  store.recordLocalPreparation({ operationId: 'prepared', state: 'ready' });
  const proposal = { title: 'Demo', steps: ['Outline', 'Record'] };
  const user = store.send('Plan a demo');
  const messages = [
    user,
    { id: 'answer', role: 'assistant', content: proposal },
  ];
  const origin = { turn: 1, revision: 0 };
  const observation = {
    active: true,
    messages,
    origins: { answer: origin },
    busy: false,
    finishReason: 'stop',
  };
  store.record('source', { source: 'local-model' });
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'answer',
    delta: JSON.stringify(proposal).slice(0, -1),
  });
  store.record('event', { type: 'RUN_FINISHED' });

  observeWorkbenchLocalRun(store, observation);

  expect(
    canAcceptWorkbenchLocalPlan(store.getSnapshot(), origin, proposal, false),
  ).toBe(false);
  expect(store.accept(proposal)).toBe(false);
});

test('native completion without finish metadata accepts once and stale previous errors do not poison a retry', async () => {
  const { observeWorkbenchLocalRun, canAcceptWorkbenchLocalPlan } =
    await import('../examples/quickstart/runtime/workbench-local-controls');
  const store = createWorkbenchStore('structured', { localModel: true });
  store.beginLocalPreparation('prepared');
  store.recordLocalPreparation({ operationId: 'prepared', state: 'ready' });
  const proposal = { title: 'Demo', steps: ['Outline', 'Record'] };
  const user = store.send('Plan a demo');
  const messages = [
    user,
    { id: 'answer', role: 'assistant', content: proposal },
  ];
  const origin = { turn: 1, revision: 0 };
  const previousError = new Error('Previous request');
  store.record('source', { source: 'local-model' });
  store.record('event', {
    type: 'TEXT_MESSAGE_CONTENT',
    messageId: 'answer',
    delta: JSON.stringify(proposal),
  });
  store.record('event', { type: 'RUN_FINISHED' });

  observeWorkbenchLocalRun(store, {
    active: true,
    messages,
    origins: { answer: origin },
    busy: false,
    error: previousError,
    previousError,
  });

  expect(
    canAcceptWorkbenchLocalPlan(store.getSnapshot(), origin, proposal, false),
  ).toBe(true);
  expect(store.accept(proposal)).toBe(true);
  expect(
    canAcceptWorkbenchLocalPlan(store.getSnapshot(), origin, proposal, false),
  ).toBe(false);
});

test('both canonical roots dispatch the local lesson to genuine native clients', async () => {
  const { readFileSync } = await import('node:fs');
  const react = readFileSync(
    'www/examples/quickstart/react/src/Workbench.tsx',
    'utf8',
  );
  const angular = readFileSync(
    'www/examples/quickstart/angular/src/app/workbench.ts',
    'utf8',
  );

  expect(react).toContain('LocalModelsWorkbenchConversation');
  expect(react).toContain("id === 'local-models'");
  expect(angular).toContain('LocalModelsWorkbenchConversation');
  expect(angular).toContain('@else if (localModels)');
});

test('an earlier SDK finish reason cannot settle a new local stream before its own native EOF', async () => {
  const { observeWorkbenchLocalRun } =
    await import('../examples/quickstart/runtime/workbench-local-controls');
  const store = createWorkbenchStore('structured', { localModel: true });
  const user = store.send('New run');

  observeWorkbenchLocalRun(store, {
    active: true,
    messages: [
      user,
      {
        id: 'new-answer',
        role: 'assistant',
        content: { title: 'Partial', steps: [] },
      },
    ],
    origins: { 'new-answer': { turn: 1, revision: 0 } },
    busy: false,
    finishReason: 'stop',
  });

  expect(store.getSnapshot().status).toBe('loading');
});

test('preparation exposes Stop immediately while the availability promise is pending', async () => {
  const store = createWorkbenchStore('structured', { localModel: true });
  let resolve!: (state: 'available') => void;
  const controller = createWorkbenchLocalController({
    store,
    active: () => true,
    model: () => ({
      availability: () =>
        new Promise((done) => {
          resolve = done;
        }),
      create: vi.fn(),
    }),
  });
  const host = document.createElement('div');
  const controls = mountWorkbenchLocalControls(host, store, controller);

  const pending = controller.prepare();
  const stop = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'Stop preparation',
  );

  expect(stop?.disabled).toBe(false);
  expect(
    host.querySelector<HTMLButtonElement>('[data-local-prepare]')?.disabled,
  ).toBe(true);
  stop?.click();
  resolve('available');
  await pending;
  expect(controller.ready()).toBe(false);
  controls.dispose();
  controller.dispose();
});
