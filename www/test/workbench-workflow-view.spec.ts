// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { getWorkbenchLesson } from '../examples/quickstart/runtime/workbench-lessons';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';
import {
  chooseInspectorMode,
  inspectorPanelText,
  inspectorPre,
  inspectorSections,
} from './workbench-inspector-helpers';

test('activity and approval lessons focus their actual SDK inspector with application-owned UI', () => {
  for (const [id, tab] of [
    ['activities', 'Activities'],
    ['interrupts', 'Interrupts'],
  ]) {
    const host = document.createElement('div');
    const shell = mountWorkbench(host, createWorkbenchStore('workflow'), {
      framework: 'React',
      lesson: getWorkbenchLesson(`?lesson=${id}`),
      send: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    });

    expect(host.querySelector('textarea')?.value).toBe(
      'Explain this two-step plan.',
    );
    expect(
      host.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    ).toBe(tab);
    expect(host.querySelector('.wb-detail')).toBeNull();
    expect(host.querySelector('.wb-mode-panel [data-captured]')).not.toBeNull();
    expect(host.querySelector('[role=separator]')).not.toBeNull();
    expect(host.querySelector('.wb-player')).not.toBeNull();
    expect(host.querySelectorAll('.wb-nav a')).toHaveLength(29);
    expect(
      host.querySelector(`[data-section=concepts] a[href$="lesson=${id}"]`),
    ).not.toBeNull();
    expect(host.textContent).toContain(
      id === 'activities' ? 'SDK activities' : 'SDK pending interrupt batch',
    );
    const ui = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'UI',
    );
    if (!ui) throw new Error('Missing UI tab');
    ui.click();

    expect(host.textContent).toContain('Application-owned workflow controls');
    expect(host.textContent).not.toContain('SummaryCard');
    chooseInspectorMode(host, 'bottom');
    expect(host.querySelector('[data-captured] h3')?.textContent).toBe(
      'Application-owned workflow controls',
    );
    expect(inspectorPanelText(host)).toContain('"activityIds"');
    shell.dispose();
  }
});

test('paired workflow inspector follows the selected SDK frame and local form history without invoking commands', () => {
  const store = createWorkbenchStore('workflow');
  const user = store.send('Explain this two-step plan.');
  store.recordWorkflow({
    state: { planTitle: 'Selected plan', status: 'draft' },
    messages: [
      user,
      {
        id: 'progress',
        role: 'activity',
        activityType: 'plan-progress',
        content: { stage: 'context-checked', label: 'Context checked' },
        links: { messageId: 'reply' },
      },
    ],
    pendingInterrupts: {
      id: 'original',
      interrupts: [
        { id: 'first', reason: 'approval' },
        { id: 'second', reason: 'approval' },
      ],
    },
    isLoading: false,
    isResuming: false,
  });
  store.record('form', {
    type: 'approval-draft',
    batchId: 'original',
    answers: { first: 'approve' },
  });
  const earlier = store.getSnapshot().events.length - 1;
  store.record('form', {
    type: 'approval-draft',
    batchId: 'original',
    answers: { first: 'approve', second: 'decline' },
  });
  const host = document.createElement('div');
  const send = vi.fn();
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    lesson: getWorkbenchLesson('?lesson=interrupts'),
    send,
    stop: vi.fn(),
    reset: vi.fn(),
  });

  store.seek(earlier);
  const { captured, interpreted } = inspectorSections(host, 'Interrupts') as {
    captured: { pending: { id: string } };
    interpreted: {
      batchId: string;
      applicationForm: { answers: unknown };
    };
  };

  expect(captured.pending.id).toBe('original');
  expect(captured).not.toHaveProperty('applicationForm');
  expect(interpreted.batchId).toBe(captured.pending.id);
  expect(interpreted.applicationForm.answers).toEqual({ first: 'approve' });
  expect(interpreted).not.toHaveProperty('sdk');
  expect(host.querySelector('.wb-caption')?.textContent).toContain(
    'separately recorded application form drafts',
  );
  function tab(name: string) {
    const control = [
      ...host.querySelectorAll<HTMLButtonElement>('[role=tab]'),
    ].find((node) => node.textContent === name);
    if (!control) throw new Error(`Missing tab ${name}`);
    control.click();
    return inspectorSections(host, name);
  }
  const state = tab('State');
  expect(state.captured).toEqual({
    state: { planTitle: 'Selected plan', status: 'draft' },
    isLoading: false,
    isResuming: false,
    finishReason: null,
    error: null,
    recoveryRequired: false,
  });
  expect(state.interpreted).toEqual({
    applicationForm: { answers: { first: 'approve' } },
    acceptedApplication: store.getSnapshot().frame?.application,
    outcome: 'paused',
  });
  const activities = tab('Activities');
  expect(activities.captured).toEqual(
    store.getSnapshot().frame?.workflow?.activities,
  );
  expect(activities.interpreted).toEqual({
    progress: [
      {
        id: 'progress',
        stage: 'context-checked',
        label: 'Context checked',
        links: { messageId: 'reply' },
      },
    ],
    outcome: 'paused',
  });
  const text = tab('Text');
  expect(text.captured).toEqual([]);
  expect(text.interpreted).toEqual({
    renderer: 'Plain text',
    generatedComponents: false,
    outcome: 'paused',
  });
  const ui = tab('UI');
  expect(ui.captured).toEqual({
    renderer: 'Application-owned workflow controls',
    generatedComponents: false,
    sdkFields: ['state', 'messages', 'pendingInterrupts'],
  });
  expect(ui.interpreted).toEqual({
    state: { planTitle: 'Selected plan', status: 'draft' },
    activityIds: ['progress'],
    pendingBatchId: 'original',
    outcome: 'paused',
  });
  tab('Interrupts');
  expect(JSON.parse(inspectorPre(host, 'raw') ?? 'null')).toEqual({
    sdk: store.getSnapshot().frame?.workflow,
    event: {
      kind: 'form',
      source: 'Application',
      payload: {
        type: 'approval-draft',
        batchId: 'original',
        answers: { first: 'approve' },
      },
    },
  });
  expect(JSON.parse(inspectorPre(host, 'bottom') ?? 'null')).toEqual(
    interpreted,
  );
  expect(send).not.toHaveBeenCalled();
  expect(host.querySelectorAll('[aria-label="Inspector view"]')).toHaveLength(
    1,
  );
  expect(
    host
      .querySelector('[aria-label="Inspector views"]')
      ?.querySelectorAll('[role=tab]'),
  ).toHaveLength(6);
  shell.dispose();
});

test('inspector error guidance follows selected workflow recovery while other errors keep retry guidance', () => {
  const store = createWorkbenchStore('workflow');
  const user = store.send('Explain');
  const observation = {
    state: { planTitle: 'Plan', status: 'idle' },
    messages: [user],
    isLoading: false,
    isResuming: false,
    error: 'Connection lost',
  };
  store.recordWorkflow(observation);
  store.settle('error');
  const retryFrame = store.getSnapshot().events.length - 1;
  store.recordWorkflow({ ...observation, recoveryRequired: true });
  const host = document.createElement('div');
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    lesson: getWorkbenchLesson('?lesson=interrupts'),
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });

  expect(host.querySelector('[data-captured] [role=alert]')?.textContent).toBe(
    'Resume failed after acknowledgement. Start a new conversation.',
  );
  store.seek(retryFrame);
  expect(host.querySelector('[data-captured] [role=alert]')?.textContent).toBe(
    'The request failed. Check the server, return to live, and send again.',
  );
  store.live();
  expect(host.querySelector('[data-captured] [role=alert]')?.textContent).toBe(
    'Resume failed after acknowledgement. Start a new conversation.',
  );
  shell.dispose();

  const ordinary = createWorkbenchStore();
  ordinary.send('Plan');
  ordinary.settle('error');
  const ordinaryShell = mountWorkbench(host, ordinary, {
    framework: 'React',
    lesson: getWorkbenchLesson('?lesson=generative-ui'),
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  });

  expect(host.querySelector('[data-captured] [role=alert]')?.textContent).toBe(
    'The request failed. Check the server, return to live, and send again.',
  );
  ordinaryShell.dispose();
});
