// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import type { WorkbenchStore } from '../examples/quickstart/runtime/workbench';
const sdk = vi.hoisted(() => ({
  chat: vi.fn(),
  store: undefined as WorkbenchStore | undefined,
}));
vi.mock('../examples/quickstart/runtime/workbench', async (importOriginal) => {
  const source =
    await importOriginal<
      typeof import('../examples/quickstart/runtime/workbench')
    >();
  return {
    ...source,
    createWorkbenchStore: (
      ...args: Parameters<typeof source.createWorkbenchStore>
    ) => {
      sdk.store = source.createWorkbenchStore(...args);
      return sdk.store;
    },
  };
});
vi.mock('@hashbrownai/react', () => ({ useChat: sdk.chat }));
import { WorkflowWorkbenchConversation } from '../examples/quickstart/react/src/WorkflowWorkbench';
import { workbenchWorkflowInitialState } from '../examples/quickstart/runtime/workbench-workflows';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const navigation = {
  currentId: '1',
  conversations: [{ id: '1', label: 'Plan' }],
  select: vi.fn(),
  create: vi.fn(),
};
function button(host: HTMLElement, text: string) {
  const result = [...host.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === text,
  );
  if (!result) throw new Error(`Missing ${text}`);
  return result;
}
test('workflow binds explicit state writes and whole approval batches to actual SDK methods', async () => {
  window.history.replaceState(null, '', '?lesson=interrupts');
  const runtime = {
    state: workbenchWorkflowInitialState,
    messages: [] as unknown[],
    pendingInterrupts: undefined as unknown,
    isLoading: false,
    isResuming: false,
    recovery: { required: false, revision: 0 },
    error: undefined,
    lastRunFinishReason: undefined as string | undefined,
    sendMessage: vi.fn(),
    setState: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
  };
  sdk.chat.mockReturnValue(runtime);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = () =>
    root.render(
      <WorkflowWorkbenchConversation active navigation={{ ...navigation }} />,
    );

  await act(render);
  expect(runtime.sendMessage).not.toHaveBeenCalled();
  const titleInput = host.querySelector<HTMLInputElement>(
    '[aria-label="Plan title"]',
  );
  if (!titleInput) throw new Error('Missing title editor');
  await act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set?.call(titleInput, 'Local <draft>');
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(runtime.setState).not.toHaveBeenCalled();
  await act(() => button(host, 'Set shared state').click());
  expect(runtime.setState).toHaveBeenCalledWith({
    ...workbenchWorkflowInitialState,
    planTitle: 'Local <draft>',
  });
  expect(runtime.sendMessage).not.toHaveBeenCalled();
  const composer = host.querySelector('textarea');
  if (!composer) throw new Error('Missing composer');
  composer.value = 'Explain';
  await act(() =>
    host
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
  expect(button(host, 'Set shared state').disabled).toBe(true);
  runtime.messages = [
    runtime.sendMessage.mock.calls[0][0],
    {
      id: 'actual-progress',
      role: 'activity',
      activityType: 'plan-progress',
      content: { stage: 'context-checked', label: 'Context checked' },
      links: { messageId: 'reply' },
    },
    { id: 'reply', role: 'assistant', content: '<b>plain reply</b>' },
  ];
  runtime.pendingInterrupts = {
    id: 'original',
    interrupts: [
      {
        id: 'one',
        reason: 'approval',
        message: 'May the agent continue with this plan?',
      },
      { id: 'two', reason: 'approval' },
    ],
  };
  await act(render);
  expect(host.querySelector('b')).toBeNull();
  const activity = host.querySelector('.wb-workflow-activity');
  const reply = host.querySelector('.wb-workflow-reply');
  if (!activity || !reply) throw new Error('Missing actual SDK messages');
  expect(
    activity.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(host.querySelector('.wb-workflow-approvals')?.textContent).toContain(
    'May the agent continue with this plan?',
  );
  expect(button(host, 'Submit answers').disabled).toBe(true);
  const selects = host.querySelectorAll<HTMLSelectElement>(
    '.wb-workflow-approvals select',
  );
  await act(() => {
    selects[0].value = 'approve';
    selects[0].dispatchEvent(new Event('change', { bubbles: true }));
  });
  const store = sdk.store;
  if (!store) throw new Error('Missing capture store');
  const earlier = store.getSnapshot().events.length - 1;
  await act(() => {
    selects[1].value = 'decline';
    selects[1].dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(button(host, 'Submit answers').disabled).toBe(false);
  expect(
    host.querySelector('[data-activity-id="actual-progress"]')?.textContent,
  ).toContain('Context checked');
  await act(() => store.seek(earlier));
  expect(selects[1].value).toBe('');
  expect(button(host, 'Submit answers').disabled).toBe(true);
  expect(titleInput.disabled).toBe(true);
  const count = store.getSnapshot().events.length;
  await act(() => button(host, 'Cancel approvals').click());
  expect(runtime.resume).not.toHaveBeenCalled();
  expect(store.getSnapshot().events).toHaveLength(count);
  await act(() => store.live());
  expect(selects[1].value).toBe('decline');
  runtime.resume.mockImplementationOnce(() => {
    throw new Error('Rejected synchronously');
  });
  await act(() => button(host, 'Cancel approvals').click());
  expect(store.getSnapshot().status).toBe('paused');
  expect(host.textContent).toContain('Rejected synchronously');
  await act(() => store.seek(earlier));
  expect(host.textContent).not.toContain('Rejected synchronously');
  await act(() => store.live());
  expect(button(host, 'Cancel approvals').disabled).toBe(false);
  await act(() => button(host, 'Cancel approvals').click());
  await act(() => button(host, 'Cancel approvals').click());

  expect(runtime.resume).toHaveBeenCalledTimes(2);
  expect(runtime.resume).toHaveBeenCalledWith({
    batchId: 'original',
    entries: [
      { interruptId: 'one', status: 'cancelled' },
      { interruptId: 'two', status: 'cancelled' },
    ],
  });
  runtime.pendingInterrupts = undefined;
  runtime.isResuming = true;
  runtime.isLoading = true;
  await act(render);
  runtime.isResuming = false;
  runtime.isLoading = false;
  runtime.lastRunFinishReason = 'stop';
  runtime.state = { ...workbenchWorkflowInitialState, status: 'ready' };
  await act(render);
  expect(store.getSnapshot().status).toBe('complete');
  composer.value = 'Make the explanation shorter.';
  await act(() =>
    host
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  const followup = runtime.sendMessage.mock.calls[1][0];
  runtime.lastRunFinishReason = undefined;
  runtime.isLoading = true;
  runtime.messages = [
    ...runtime.messages,
    followup,
    {
      id: 'second-progress',
      role: 'activity',
      activityType: 'plan-progress',
      content: { stage: 'context-checked', label: 'Second context checked' },
    },
    {
      id: 'second-reply',
      role: 'assistant',
      content: 'A shorter explanation.',
    },
  ];
  await act(render);
  const actualCards = host.querySelectorAll('.wb-workflow-activity');
  const actualUsers = host.querySelectorAll('.wb-user');
  expect(actualCards).toHaveLength(2);
  expect(
    actualCards[0].compareDocumentPosition(actualUsers[1]) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    actualUsers[1].compareDocumentPosition(actualCards[1]) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
  await act(() => root.unmount());
  host.remove();
});
