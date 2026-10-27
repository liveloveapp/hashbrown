// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { workbenchAuthoringSource } from '../examples/quickstart/runtime/workbench-authoring';
import { mountAuthoringControls } from '../examples/quickstart/runtime/workbench-authoring-controls';
import { observeHistory } from '../examples/quickstart/runtime/workbench-history-client';

test('source readouts reflect waiting, failure and cancellation before any assistant exists', () => {
  for (const result of ['error', 'cancelled'] as const) {
    const store = createWorkbenchStore('history', { authoringMode: 'parser' });
    const host = document.createElement('div');
    const controls = mountAuthoringControls(
      host,
      store,
      'json-parser',
      () => true,
    );
    expect(workbenchAuthoringSource(store.getSnapshot())).toBe('idle');
    const user = store.send('Create plan');
    observeHistory(store, { messages: [user], isLoading: true });

    expect(store.getSnapshot().frame?.history?.authoring).toBeUndefined();
    expect(workbenchAuthoringSource(store.getSnapshot())).toBe('generating');
    expect(
      host.querySelector('[data-authoring-status]')?.textContent,
    ).toContain('Source: generating');
    if (result === 'error')
      observeHistory(store, {
        messages: [user],
        isLoading: false,
        error: new Error('Provider failed before text'),
      });
    else store.settle('cancelled');

    expect(workbenchAuthoringSource(store.getSnapshot())).toBe(
      result === 'error' ? 'error' : 'stopped',
    );
    expect(
      host.querySelector('[data-authoring-status]')?.textContent,
    ).toContain(`Source: ${result === 'error' ? 'error' : 'stopped'}`);
    const waiting = store
      .getSnapshot()
      .events.findIndex((event) => event.status === 'loading');
    // Replay becomes available only after actual SDK cancellation also becomes idle.
    observeHistory(store, { messages: [user], isLoading: false });
    store.seek(waiting);
    expect(workbenchAuthoringSource(store.getSnapshot())).toBe('generating');
    controls.dispose();
  }
});

test('disposed controls reject retained button and input events and new mounts remain active', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'form' });
  const user = store.send('Create plan');
  const plan = { title: 'Demo', steps: ['Outline.', 'Record.'] };
  const json = JSON.stringify(plan);
  observeHistory(store, { messages: [user], isLoading: true });
  observeHistory(store, {
    messages: [user, { id: 'answer', role: 'assistant', content: json }],
    isLoading: false,
    finishReason: 'stop',
  });
  store.recordAuthoring({
    assistantId: 'answer',
    json,
    value: plan,
    complete: true,
  });
  const host = document.createElement('div');
  const controls = mountAuthoringControls(
    host,
    store,
    'natural-forms',
    () => true,
  );
  const review = [...host.querySelectorAll('button')].find(
    (node) => node.textContent === 'Review draft',
  );
  if (!review) throw new Error('Missing review button');
  review.click();
  const apply = [...host.querySelectorAll('button')].find(
    (node) => node.textContent === 'Apply plan',
  );
  if (!apply) throw new Error('Missing apply button');
  const field = host.querySelector<HTMLInputElement>(
    '[aria-label="Plan title"]',
  );
  if (!field) throw new Error('Missing title field');
  const previous = store.getSnapshot();

  controls.dispose();
  field.value = 'Detached edit';
  field.dispatchEvent(new Event('input', { bubbles: true }));
  review.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  apply.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  controls.render();

  expect(store.getSnapshot()).toBe(previous);
  const next = mountAuthoringControls(host, store, 'natural-forms', () => true);
  [...host.querySelectorAll('button')]
    .find((node) => node.textContent === 'Apply plan')
    ?.click();
  expect(store.getSnapshot().application.revision).toBe(1);
  expect(store.getSnapshot().application.plan).toEqual(plan);
  next.dispose();
});

test('source fallback ignores the previous SDK error while a fresh retry awaits its first observation', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'parser' });
  const user = store.send('First request');
  observeHistory(store, { messages: [user], isLoading: true });
  observeHistory(store, {
    messages: [user],
    isLoading: false,
    error: new Error('Previous request failed'),
  });
  expect(workbenchAuthoringSource(store.getSnapshot())).toBe('error');

  store.send('Retry');

  expect(workbenchAuthoringSource(store.getSnapshot())).toBe('generating');
});

test('two-turn feeds preserve earlier captured assistant drafts in order and exclude future drafts during replay', () => {
  const store = createWorkbenchStore('history', { authoringMode: 'form' });
  const host = document.createElement('div');
  const controls = mountAuthoringControls(
    host,
    store,
    'natural-forms',
    () => true,
  );
  const first = store.send('First user request');
  const firstPlan = {
    title: 'First captured title',
    steps: ['First outline.', 'First recording.'],
  };
  const firstReply = {
    id: 'first-answer',
    role: 'assistant',
    content: JSON.stringify(firstPlan),
  };
  observeHistory(store, { messages: [first], isLoading: true });
  observeHistory(store, {
    messages: [first, firstReply],
    isLoading: false,
    finishReason: 'stop',
  });
  store.recordAuthoring({
    assistantId: firstReply.id,
    json: firstReply.content,
    value: firstPlan,
    complete: true,
  });
  const firstFrame = store.getSnapshot().events.length - 1;
  const retainedField = host.querySelector('[aria-label="Plan title"]');
  const second = store.send('Second user request');
  const secondPlan = {
    title: 'Second captured title',
    steps: ['Second outline.', 'Second recording.'],
  };
  const secondReply = {
    id: 'second-answer',
    role: 'assistant',
    content: JSON.stringify(secondPlan),
  };
  const messages = [first, firstReply, second];
  observeHistory(store, { messages, isLoading: true });
  observeHistory(store, {
    messages: [...messages, secondReply],
    isLoading: false,
    finishReason: 'stop',
  });
  store.recordAuthoring({
    assistantId: secondReply.id,
    json: secondReply.content,
    value: secondPlan,
    complete: true,
  });

  const text = host.textContent ?? '';
  expect(host.querySelector('[data-authoring-past]')?.textContent).toContain(
    'Earlier generated draft',
  );
  expect(text.indexOf('First user request')).toBeLessThan(
    text.indexOf('First captured title'),
  );
  expect(text.indexOf('First captured title')).toBeLessThan(
    text.indexOf('Second user request'),
  );
  expect(text.indexOf('Second user request')).toBeLessThan(
    text.indexOf('Second captured title'),
  );
  expect(host.querySelector('[aria-label="Plan title"]')).toBe(retainedField);
  store.seek(firstFrame);
  expect(host.textContent).toContain('First captured title');
  expect(host.textContent).not.toContain('Second captured title');
  expect(host.textContent).not.toContain('Second user request');
  expect(host.querySelector('[data-authoring-past]')).toBeNull();
  controls.dispose();
});

test('actual failed and cancelled sources override a cached generating parser observation', () => {
  for (const outcome of ['error', 'cancelled'] as const) {
    const store = createWorkbenchStore('history', { authoringMode: 'form' });
    const host = document.createElement('div');
    const controls = mountAuthoringControls(
      host,
      store,
      'natural-forms',
      () => true,
    );
    const user = store.send('Create a plan');
    const json = '{"title":"Partial title","steps":["Outline';
    const partial = { title: 'Partial title', steps: ['Outline'] };
    observeHistory(store, { messages: [user], isLoading: true });
    observeHistory(store, {
      messages: [user, { id: 'answer', role: 'assistant', content: json }],
      isLoading: true,
    });
    store.recordAuthoring({
      assistantId: 'answer',
      json,
      value: partial,
      complete: false,
    });
    expect(host.querySelector('[data-authoring-preview] h3')?.textContent).toBe(
      'Partial title',
    );

    if (outcome === 'error')
      observeHistory(store, {
        messages: [user],
        isLoading: false,
        error: new Error('SDK removed failed assistant'),
      });
    else store.settle('cancelled');

    expect(store.getSnapshot().frame?.history?.authoring?.source).toBe(
      'generating',
    );
    expect(store.getSnapshot().frame?.history?.authoring?.parser.value).toEqual(
      partial,
    );
    expect(
      host.querySelector('[data-authoring-status]')?.textContent,
    ).toContain(`Source: ${outcome === 'error' ? 'error' : 'stopped'}`);
    expect(host.querySelector('[data-authoring-preview] h3')?.textContent).toBe(
      outcome === 'error' ? '' : 'Partial title',
    );
    expect(host.querySelector('[data-authoring-preview] ol')?.textContent).toBe(
      outcome === 'error' ? '' : 'Outline',
    );
    expect(
      [...host.querySelectorAll('button')].find(
        (node) => node.textContent === 'Review draft',
      )?.disabled,
    ).toBe(true);
    controls.dispose();
  }
});
