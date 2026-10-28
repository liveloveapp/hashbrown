// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { workbenchExchanges } from '../examples/quickstart/runtime/workbench-requests';
import { getWorkbenchLesson } from '../examples/quickstart/runtime/workbench-lessons';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';
import { createWorkbenchTransport } from '../examples/quickstart/runtime/workbench-transport';
import { workbenchMilestones } from '../examples/quickstart/runtime/workbench-timeline';

test('native exchanges expose local execution without fabricating an HTTP method or response', () => {
  const store = createWorkbenchStore('structured');
  store.send('Create a plan');
  store.record('request', {
    url: 'native:chrome',
    requestId: 'local',
    input: { messages: [] },
  });
  store.record('event', { type: 'RUN_FINISHED' });
  store.settle('complete', 'stop');

  const exchange = workbenchExchanges(store.getSnapshot().events, {})[0]
    .exchanges[0];

  expect(exchange.method).toBe('LOCAL');
  expect(exchange.path).toBe('Chrome Prompt API');
  expect(exchange.httpStatus).toBeUndefined();
  expect(exchange.response).toBeUndefined();
});

test('local model shell opens preparation inspection and disables unprepared generation', () => {
  const host = document.createElement('div');
  const store = createWorkbenchStore('structured', { localModel: true });
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    managedChat: true,
    lesson: getWorkbenchLesson('?lesson=local-models'),
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });

  expect(
    [...host.querySelectorAll('[role=tab]')].map((tab) => tab.textContent),
  ).toContain('Model');
  expect(host.querySelector<HTMLButtonElement>('[data-send]')?.disabled).toBe(
    true,
  );
  expect(host.textContent).toContain('Browser-local model');
  expect(host.querySelector('textarea')?.value).toContain('two-step plan');
  shell.dispose();
});

test('native request failures direct readers to local events rather than an HTTP response', async () => {
  const store = createWorkbenchStore('structured');
  store.send('Create a plan');
  const transport = createWorkbenchTransport(
    store,
    {
      name: 'Native failure',
      send: async () => {
        throw new Error('Unavailable');
      },
    },
    'native:chrome',
  );

  await expect(
    transport.send({
      requestId: 'native',
      signal: new AbortController().signal,
      attempt: 1,
      input: { messages: [] },
    } as never),
  ).rejects.toThrow();

  const error = store
    .getSnapshot()
    .events.find((event) => event.kind === 'error');
  expect(JSON.stringify(error?.payload)).toContain('Local');
  expect(JSON.stringify(error?.payload)).not.toContain('HTTP');
});

test('preparation has meaningful milestones before the first model turn', () => {
  const store = createWorkbenchStore('structured', { localModel: true });
  store.beginLocalPreparation('prepare');
  store.recordLocalPreparation({ operationId: 'prepare', state: 'ready' });

  const labels = workbenchMilestones(store.getSnapshot().events).map(
    (event) => event.label,
  );

  expect(labels).toContain('Model preparing');
  expect(labels).toContain('Model ready');
});
