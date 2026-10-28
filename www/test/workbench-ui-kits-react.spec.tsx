// @vitest-environment jsdom
import { act, type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import type { WorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { getWorkbenchUiResponseSchema } from '../examples/quickstart/runtime/workbench-ui-kits';
const sdk = vi.hoisted(() => ({
  chat: vi.fn(),
  store: undefined as WorkbenchStore | undefined,
}));
vi.mock('../examples/quickstart/runtime/workbench', async (original) => {
  const source =
    await original<typeof import('../examples/quickstart/runtime/workbench')>();
  return {
    ...source,
    createWorkbenchStore: (
      ...args: Parameters<typeof source.createWorkbenchStore>
    ) => {
      const store = source.createWorkbenchStore(...args);
      const record = store.recordUiKit;
      return {
        ...store,
        recordUiKit: (...input: Parameters<typeof record>) => {
          sdk.store = store;
          return record(...input);
        },
      };
    },
  };
});
vi.mock('@hashbrownai/react', async (original) => {
  const actual = await original<typeof import('@hashbrownai/react')>();
  return { ...actual, useUiChat: sdk.chat, useTool: (tool: unknown) => tool };
});
import { UiKitWorkbenchConversation } from '../examples/quickstart/react/src/UiKitWorkbench';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const navigation = {
  currentId: '1',
  conversations: [{ id: '1', label: 'Plan' }],
  select: vi.fn(),
  create: vi.fn(),
};
function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Missing test fixture value');
  return value;
}
function runtime() {
  return {
    messages: [] as unknown[],
    lastAssistantMessage: undefined as
      { id: string; role: string; content: unknown; ui: ReactNode } | undefined,
    isLoading: false,
    isResuming: false,
    pendingInterrupts: undefined,
    error: undefined,
    lastRunFinishReason: undefined as string | undefined,
    sendMessage: vi.fn(),
    stop: vi.fn(),
    setMessages: vi.fn(),
  };
}
async function send(host: HTMLElement) {
  const textarea = required(host.querySelector('textarea'));
  textarea.value = 'Create a plan';
  await act(() =>
    required(host.querySelector('form')).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    ),
  );
}
function accept(host: HTMLElement) {
  return required(
    [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Accept plan',
    ),
  );
}

for (const lesson of ['ui-kits', 'ui-chatbot'] as const) {
  test(`React ${lesson} captures actual kit metadata, uses native fallback and gates actions against current source and lifetime`, async () => {
    window.history.replaceState(null, '', `?lesson=${lesson}`);
    const chat = runtime();
    sdk.chat.mockReturnValue(chat);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    let active = true;
    const render = () =>
      root.render(
        <StrictMode>
          <UiKitWorkbenchConversation
            active={active}
            navigation={{ ...navigation }}
          />
        </StrictMode>,
      );
    await act(render);
    const store = required(sdk.store);
    const kit = required(sdk.chat.mock.calls.at(-1))[0].components[0];

    expect(JSON.parse(kit.serializedSchema)).toEqual(
      getWorkbenchUiResponseSchema(lesson),
    );
    expect(
      [...kit.registry.values()].map(
        (entry: { name: string; fallback?: unknown }) => [
          entry.name,
          !!entry.fallback,
        ],
      ),
    ).toEqual([
      ['SummaryCard', true],
      [lesson === 'ui-kits' ? 'StepsCard' : 'PlanReading', true],
    ]);
    expect(store.getSnapshot().frame?.uiKit?.serializedSchema).toBe(
      kit.serializedSchema,
    );
    expect(
      await required(sdk.chat.mock.calls.at(-1))[0].tools[0].handler(),
    ).toEqual(store.getSnapshot().application);
    await send(host);
    const user = chat.sendMessage.mock.calls[0][0];
    const partial = {
      ui: [{ SummaryCard: { props: { complete: false, partialValue: {} } } }],
    };
    chat.lastAssistantMessage = {
      id: 'a1',
      role: 'assistant',
      content: partial,
      ui: kit.render(partial),
    };
    chat.messages = [user, chat.lastAssistantMessage];
    chat.isLoading = true;
    await act(render);

    expect(host.querySelector('[data-kit-fallback]')).not.toBeNull();
    expect(
      [...host.querySelectorAll('button')].find(
        (button) => button.textContent === 'Accept plan',
      ),
    ).toBeUndefined();
    const props = { title: 'Demo', steps: ['Outline', 'Record'] };
    const value = {
      ui: [
        {
          SummaryCard: {
            props: { complete: true, partialValue: props, value: props },
          },
        },
      ],
    };
    store.record('event', {
      type: 'TEXT_MESSAGE_CONTENT',
      delta: JSON.stringify({ ui: [{ SummaryCard: { props } }] }),
    });
    chat.lastAssistantMessage = {
      id: 'a1',
      role: 'assistant',
      content: value,
      ui: kit.render(value),
    };
    chat.messages = [user, chat.lastAssistantMessage];
    await act(render);

    expect(accept(host).disabled).toBe(true);
    expect(
      host.querySelector('[data-ui-component="SummaryCard"]')?.textContent,
    ).toContain('Streaming preview · awaiting completion.');
    chat.isLoading = false;
    chat.lastRunFinishReason = 'stop';
    await act(render);
    expect(accept(host).disabled).toBe(false);
    const retained = accept(host);
    await act(() => store.seek(0));
    await act(() =>
      retained.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(store.getSnapshot().application.revision).toBe(0);
    await act(() => store.live());
    active = false;
    await act(render);
    await act(() =>
      retained.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(store.getSnapshot().application.revision).toBe(0);
    active = true;
    await act(render);
    await act(() => retained.click());
    expect(store.getSnapshot().application.revision).toBe(1);
    await act(() =>
      retained.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(store.getSnapshot().application.revision).toBe(1);
    await send(host);
    const secondUser = chat.sendMessage.mock.calls[1][0];
    const secondComponent = lesson === 'ui-kits' ? 'StepsCard' : 'PlanReading';
    const second = {
      ui: [
        {
          [secondComponent]: {
            props: { complete: true, partialValue: props, value: props },
          },
        },
      ],
    };
    await act(() =>
      store.record('event', {
        type: 'TEXT_MESSAGE_CONTENT',
        delta: JSON.stringify({ ui: [{ [secondComponent]: { props } }] }),
      }),
    );
    chat.lastAssistantMessage = {
      id: 'a2',
      role: 'assistant',
      content: second,
      ui: kit.render(second),
    };
    chat.messages = [...chat.messages, secondUser, chat.lastAssistantMessage];
    await act(render);
    const secondCard = required(
      host.querySelector<HTMLElement>(
        `[data-ui-component="${secondComponent}"]`,
      ),
    );
    expect(secondCard.querySelector('ol')?.children).toHaveLength(2);
    if (lesson === 'ui-kits')
      expect(
        secondCard.querySelector<HTMLButtonElement>('button')?.disabled,
      ).toBe(false);
    else expect(secondCard.querySelector('button')).toBeNull();
    const retainedSecond = secondCard.querySelector('button');
    await act(() => root.unmount());
    const previous = store.getSnapshot();
    retainedSecond?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    retained.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(store.getSnapshot()).toBe(previous);
    host.remove();
  });
}

test('React leaves an older unaccepted card unavailable while a new turn is loading', async () => {
  window.history.replaceState(null, '', '?lesson=ui-kits');
  const chat = runtime();
  sdk.chat.mockReturnValue(chat);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = () =>
    root.render(
      <UiKitWorkbenchConversation active navigation={{ ...navigation }} />,
    );
  await act(render);
  const store = required(sdk.store);
  const kit = required(sdk.chat.mock.calls.at(-1))[0].components[0];
  await send(host);
  const user = chat.sendMessage.mock.calls[0][0];
  const props = { title: 'Unaccepted preview', steps: ['Outline', 'Record'] };
  const value = {
    ui: [
      {
        SummaryCard: {
          props: { complete: true, partialValue: props, value: props },
        },
      },
    ],
  };
  chat.lastAssistantMessage = {
    id: 'old-answer',
    role: 'assistant',
    content: value,
    ui: kit.render(value),
  };
  chat.messages = [user, chat.lastAssistantMessage];
  chat.isLoading = true;
  await act(render);
  expect(
    host.querySelector('[data-ui-component="SummaryCard"]')?.textContent,
  ).toContain('Streaming preview · awaiting completion.');
  await act(() => store.settle('cancelled'));
  expect(
    host.querySelector('[data-ui-component="SummaryCard"]')?.textContent,
  ).toContain('Preview · unavailable for this run.');
  await send(host);
  chat.messages = [...chat.messages, chat.sendMessage.mock.calls[1][0]];
  await act(render);
  const oldCard = host.querySelector('[data-ui-component="SummaryCard"]');
  expect(store.getSnapshot().status).toBe('loading');
  expect(oldCard?.textContent).toContain('Preview · unavailable for this run.');
  expect(oldCard?.textContent).not.toContain('Streaming preview');
  await act(() => root.unmount());
  host.remove();
});
