// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { getWorkbenchLesson } from '../examples/quickstart/runtime/workbench-lessons';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';

test('the public scrubber selects a completed workflow frame beside a dense next-turn tick without running commands', () => {
  const store = createWorkbenchStore('workflow');
  const firstUser = store.send('Explain this two-step plan.');
  const firstMessages = [
    firstUser,
    { id: 'first-reply', role: 'assistant', content: 'First explanation.' },
  ];
  store.recordWorkflow({
    state: { planTitle: 'First state', status: 'ready' },
    messages: firstMessages,
    isLoading: false,
    isResuming: false,
    finishReason: 'stop',
  });
  for (let index = 0; index < 240; index++)
    store.record('event', {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'first-reply',
      delta: 'x',
    });
  store.settle('complete', 'stop');
  const completedIndex = store.getSnapshot().events.length - 1;
  const secondUser = store.send('Make the explanation shorter.');
  store.recordWorkflow({
    state: { planTitle: 'Second state', status: 'ready' },
    messages: [
      ...firstMessages,
      secondUser,
      { id: 'second-reply', role: 'assistant', content: 'Short explanation.' },
    ],
    isLoading: false,
    isResuming: false,
    finishReason: 'stop',
  });
  for (let index = 0; index < 96; index++)
    store.record('event', {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'second-reply',
      delta: 'x',
    });
  store.settle('complete', 'stop');
  const host = document.createElement('div');
  const send = vi.fn();
  const stop = vi.fn();
  const shell = mountWorkbench(host, store, {
    framework: 'React',
    lesson: getWorkbenchLesson('?lesson=shared-state'),
    send,
    stop,
    reset: vi.fn(),
  });
  const completed = host.querySelector<HTMLButtonElement>(
    '.wb-events button[aria-label^="Complete."]',
  );
  const nextPrompt = host.querySelector<HTMLButtonElement>(
    `.wb-events button[data-index="${completedIndex + 1}"]`,
  );
  const scrubber = host.querySelector<HTMLInputElement>(
    '[aria-label="Seek captured event"]',
  );
  if (!completed || !nextPrompt || !scrubber)
    throw new Error('Missing dense timeline controls');

  scrubber.value = completed.dataset.index ?? '';
  scrubber.dispatchEvent(new Event('input', { bubbles: true }));
  const selectedState = JSON.parse(
    host.querySelector('[data-captured] pre')?.textContent ?? 'null',
  );
  const interpreted = JSON.parse(
    host.querySelector('[data-detail] pre')?.textContent ?? 'null',
  );

  expect(store.getSnapshot().events.length).toBeGreaterThanOrEqual(339);
  expect(Number(nextPrompt.dataset.index)).toBe(completedIndex + 1);
  expect(
    Math.abs(
      Number.parseFloat(nextPrompt.style.left) -
        Number.parseFloat(completed.style.left),
    ),
  ).toBeLessThan(1);
  expect(store.getSnapshot().cursor).toBe(completedIndex);
  expect(store.getSnapshot().frame?.kind).toBe('complete');
  expect(selectedState.state.planTitle).toBe('First state');
  expect(interpreted.outcome).toBe('complete');
  expect(
    host
      .querySelector(`.wb-events button[data-index="${completedIndex}"]`)
      ?.getAttribute('aria-pressed'),
  ).toBe('true');
  expect(host.querySelector<HTMLButtonElement>('[data-send]')?.disabled).toBe(
    true,
  );
  expect(send).not.toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled();
  shell.dispose();
});
