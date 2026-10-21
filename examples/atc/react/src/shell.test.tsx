import {
  ATC_SOURCE_URL,
  createAtcStore,
  SELECTED_PROMPT,
  type Starter,
  STARTER_PROMPTS,
  transcriptItems,
} from '@atc/shared';
import { fakeDecisionTransport, testAircraft } from '@atc/shared/testing';
import { HashbrownProvider } from '@hashbrownai/react';
import type { Chat } from '@hashbrownai/core';
import type { UiChatMessage } from '@hashbrownai/react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { expect, test, vi } from 'vitest';
import { Composer } from './composer';
import { EmptyState } from './empty-state';
import { PanelHeader } from './panel-header';
import { AtcStoreProvider } from './store';
import { ToolChips } from './tool-chips';
import { Transcript } from './transcript';

const plane = testAircraft();

function setup(ui: ReactElement) {
  cleanup();
  const store = createAtcStore();
  const view = render(<AtcStoreProvider store={store}>{ui}</AtcStoreProvider>);

  return { store, element: view.container, rerender: view.rerender };
}

function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

test('the header shows the mark, the credit, a quiet connecting notice and the GitHub link', () => {
  const { element } = setup(<PanelHeader />);

  const status = element.querySelector('[role="status"]');
  const link = element.querySelector('a[aria-label="atc source on GitHub"]');

  expect(element.querySelector('[aria-label="ATC"]')).not.toBeNull();
  expect(text(element)).toContain('built with Hashbrown');
  expect(text(status)).toBe('Connecting to live traffic…');
  expect(link?.getAttribute('href')).toBe(ATC_SOURCE_URL);
  expect(link?.querySelector('svg path')).not.toBeNull();
});

test('the feed notice is silent while live and quiet while delayed', () => {
  const { store, element } = setup(<PanelHeader />);

  act(() => {
    store.setFeedStatus('live');
    store.applySnapshot({ at: 1, aircraft: [plane] });
  });
  const live = element.querySelector('[role="status"]');
  act(() => store.setFeedStatus('delayed'));

  expect(live).toBeNull();
  expect(text(element)).not.toContain('Live');
  expect(text(element.querySelector('[role="status"]'))).toBe(
    'Traffic data delayed',
  );
});

/** The starter groups, each named by the heading its `aria-labelledby` points at. */
function starterGroups(element: HTMLElement) {
  return [...element.querySelectorAll('[role="group"]')].map((group) => {
    const heading = [...element.querySelectorAll('h2')].find(
      (h) => h.id === group.getAttribute('aria-labelledby'),
    );

    return {
      name: text(heading),
      starters: [...group.querySelectorAll('button')].map((button) =>
        text(button),
      ),
    };
  });
}

test('the empty state asks a question and offers every starter prompt', () => {
  const picked: Starter[] = [];
  const { element } = setup(
    <EmptyState onPick={(starter) => picked.push(starter)} />,
  );

  const buttons = [...element.querySelectorAll('button')];
  buttons[1]?.click();

  expect(text(element.querySelector('.atc-empty-title'))).toBe(
    'Ask about the planes over the Pacific Northwest.',
  );
  expect(buttons.map((button) => text(button))).toEqual(
    STARTER_PROMPTS.map((starter) => starter.text),
  );
  expect(picked).toEqual([STARTER_PROMPTS[1]]);
});

test('starters are grouped as filters and questions', () => {
  const { element } = setup(<EmptyState onPick={() => undefined} />);

  const groups = starterGroups(element);

  expect(groups).toEqual([
    {
      name: 'Filter the map',
      starters: STARTER_PROMPTS.filter((s) => s.route === 'filter').map(
        (s) => s.text,
      ),
    },
    {
      name: 'Ask a question',
      starters: STARTER_PROMPTS.filter((s) => s.route !== 'filter').map(
        (s) => s.text,
      ),
    },
  ]);
});

test('the empty state offers the selected-plane question first while a plane is selected', () => {
  const { store, element } = setup(<EmptyState onPick={() => undefined} />);

  act(() => store.select('aaaaaa'));
  const questions = starterGroups(element)[1].starters;

  expect(questions[0]).toBe(SELECTED_PROMPT);
  expect(element.querySelectorAll('button')).toHaveLength(
    STARTER_PROMPTS.length + 1,
  );
});

type Answer = Parameters<typeof fakeDecisionTransport>[0];

function composer(
  answer: Answer = () => ({ intent: 'chat', confidence: 0.9 }),
) {
  const sent: string[] = [];
  const filtered: string[] = [];
  const cleared: string[] = [];
  const model = fakeDecisionTransport(answer);
  const { element, store } = setup(
    <HashbrownProvider url="/unused">
      <Composer
        transport={model.transport}
        onChat={(message) => sent.push(message)}
        onFilter={(message) => filtered.push(message)}
        onClear={() => cleared.push('clear')}
      />
    </HashbrownProvider>,
  );
  const input = element.querySelector('input') as HTMLInputElement;

  return { element, input, sent, filtered, cleared, model, store };
}

/** Types into the composer and waits for the router's answer to show. */
async function typeAndDecide(
  { element, input }: ReturnType<typeof composer>,
  value: string,
  label: string,
) {
  fireEvent.change(input, { target: { value } });
  await waitFor(() =>
    expect(text(element.querySelector('.atc-route'))).toBe(label),
  );
}

function slash(target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: '/',
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);

  return event;
}

test('pressing / anywhere focuses the composer', () => {
  const { input } = composer();
  (document.activeElement as HTMLElement | null)?.blur();

  const event = slash(document.body);

  expect(document.activeElement).toBe(input);
  expect(event.defaultPrevented).toBe(true);
});

test('pressing / inside an input, textarea or contenteditable types a slash', () => {
  const { input } = composer();
  const other = document.createElement('input');
  const area = document.createElement('textarea');
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  const inner = document.createElement('span');
  editable.appendChild(inner);
  document.body.append(other, area, editable);

  const events = [other, area, inner, input].map((target) => {
    target.focus();
    return slash(target).defaultPrevented;
  });

  expect(events).toEqual([false, false, false, false]);
  expect(document.activeElement).toBe(input);
  other.remove();
  area.remove();
  editable.remove();
});

test('submitting sends the trimmed draft to chat, clears the input and keeps focus', async () => {
  const view = composer();
  view.input.focus();

  await typeAndDecide(view, '  What is highest?  ', '→ chat 0.90');
  fireEvent.submit(view.element.querySelector('form') as HTMLFormElement);
  await waitFor(() => expect(view.sent).toEqual(['What is highest?']));

  expect(view.input.value).toBe('');
  expect(document.activeElement).toBe(view.input);
});

test('Enter on a filter-routed text applies the filter and adds nothing to the transcript', async () => {
  const view = composer(() => ({ intent: 'filter', confidence: 0.97 }));

  await typeAndDecide(view, 'only jets below 10,000 ft', '→ filter 0.97');
  fireEvent.submit(view.element.querySelector('form') as HTMLFormElement);
  await waitFor(() => expect(view.filtered).toHaveLength(1));

  expect(view.filtered).toEqual(['only jets below 10,000 ft']);
  expect(view.sent).toEqual([]);
  expect(view.input.value).toBe('');
});

test('a clear routes to clearing the filter without a filter request', async () => {
  const view = composer(() => ({
    intent: 'filter',
    confidence: 0.95,
    clear: 0.9,
  }));

  await typeAndDecide(view, 'show everything again', '→ filter 0.95');
  fireEvent.submit(view.element.querySelector('form') as HTMLFormElement);
  await waitFor(() => expect(view.cleared).toHaveLength(1));

  expect(view.filtered).toEqual([]);
  expect(view.sent).toEqual([]);
});

test('an unsure route is dashed and Enter goes to chat', async () => {
  const view = composer(() => ({ intent: 'filter', confidence: 0.55 }));

  await typeAndDecide(view, 'hmm', '→ filter 0.55');
  fireEvent.submit(view.element.querySelector('form') as HTMLFormElement);
  await waitFor(() => expect(view.sent).toEqual(['hmm']));

  expect(view.filtered).toEqual([]);
});

test('an unavailable router shows a chat badge, no error, and Enter still chats', async () => {
  const view = composer(() => null);

  await typeAndDecide(view, 'hello there', '→ chat');
  fireEvent.submit(view.element.querySelector('form') as HTMLFormElement);
  await waitFor(() => expect(view.sent).toEqual(['hello there']));

  expect(view.element.querySelector('[role="alert"]')).toBeNull();
});

test('Enter before the router answers waits for it, then follows the route', async () => {
  let release: (() => void) | undefined;
  const view = composer(
    (value) =>
      new Promise((resolve) => {
        release = () => resolve({ intent: 'filter', confidence: 0.9 });
        void value;
      }),
  );

  fireEvent.change(view.input, { target: { value: 'only jets' } });
  await waitFor(() => expect(release).toBeDefined());
  fireEvent.submit(view.element.querySelector('form') as HTMLFormElement);
  expect(view.filtered).toEqual([]);
  act(() => release?.());
  await waitFor(() => expect(view.filtered).toEqual(['only jets']));

  expect(view.sent).toEqual([]);
});

test('typing again while Enter waits cancels that submission', async () => {
  vi.useFakeTimers();
  try {
    const view = composer(() => new Promise(() => undefined));
    fireEvent.change(view.input, { target: { value: 'first' } });
    fireEvent.submit(view.element.querySelector('form') as HTMLFormElement);

    fireEvent.change(view.input, { target: { value: 'first, then more' } });
    await act(() => vi.advanceTimersByTimeAsync(1500));

    expect(view.sent).toEqual([]);
    expect(view.input.value).toBe('first, then more');
  } finally {
    vi.useRealTimers();
  }
});

test('with no answer after 1000 ms Enter goes to chat', async () => {
  vi.useFakeTimers();
  try {
    const view = composer(() => new Promise(() => undefined));
    fireEvent.change(view.input, { target: { value: 'hello' } });

    fireEvent.submit(view.element.querySelector('form') as HTMLFormElement);
    await act(() => vi.advanceTimersByTimeAsync(999));
    const early = [...view.sent];
    await act(() => vi.advanceTimersByTimeAsync(2));

    expect(early).toEqual([]);
    expect(view.sent).toEqual(['hello']);
  } finally {
    vi.useRealTimers();
  }
});

test('unmounting while Enter waits leaves nothing to fire', async () => {
  vi.useFakeTimers();
  try {
    const view = composer(() => new Promise(() => undefined));
    fireEvent.change(view.input, { target: { value: 'hello' } });
    fireEvent.submit(view.element.querySelector('form') as HTMLFormElement);
    await act(() => vi.advanceTimersByTimeAsync(200));

    cleanup();
    const timers = vi.getTimerCount();
    await vi.advanceTimersByTimeAsync(2000);

    expect(timers).toBe(0);
    expect(view.sent).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

test('the badge is described to the input and shows no route for empty text', async () => {
  const view = composer();

  const idle = text(view.element.querySelector('.atc-route'));
  await typeAndDecide(view, 'hello', '→ chat 0.90');
  const badge = view.element.querySelector('.atc-route') as HTMLElement;

  expect(idle).toBe('');
  expect(view.input.getAttribute('aria-describedby')).toBe(badge.id);
  expect(badge.getAttribute('data-tone')).toBe('chat');
});

test('starters go straight to their route', () => {
  const picked: Starter[] = [];
  const { element } = setup(
    <EmptyState onPick={(starter) => picked.push(starter)} />,
  );

  const buttons = [...element.querySelectorAll('button')];
  buttons.at(-1)?.click();
  buttons[0]?.click();

  expect(picked.map((starter) => starter.route)).toEqual(['chat', 'filter']);
});

test('a running step shows as one shimmering line, then folds into a summary that expands to every step', () => {
  const find = {
    name: 'findAircraft',
    args: { approaching: 'KSEA', sortBy: 'distance' },
    status: 'pending' as const,
  };
  const highlight = {
    name: 'highlightAircraft',
    args: { hexes: ['a', 'b', 'c'] },
    status: 'pending' as const,
  };
  const { store, element, rerender } = setup(
    <ToolChips calls={[find, highlight]} busy />,
  );
  const live = () =>
    [...element.querySelectorAll('[data-testid="tool-current"]')].map(
      (line) => ({
        text: text(line),
        spinner: line.querySelector('.atc-tool-spinner') !== null,
        shimmer: line.querySelector('.atc-shimmer') !== null,
      }),
    );
  const summary = () =>
    element.querySelector<HTMLButtonElement>('[data-testid="tool-summary"]');

  const running = live();
  const before = summary();
  rerender(
    <AtcStoreProvider store={store}>
      <ToolChips
        calls={[
          { ...find, status: 'done', result: { status: 'fulfilled' } },
          { ...highlight, status: 'done', result: { status: 'rejected' } },
        ]}
        busy={false}
      />
    </AtcStoreProvider>,
  );
  const collapsed = summary()?.getAttribute('aria-expanded');
  act(() => summary()?.click());
  const steps = [...element.querySelectorAll('[data-testid="tool-step"]')].map(
    (step) => [step.getAttribute('data-state'), text(step)],
  );

  expect(running).toEqual([
    { text: 'Highlighting 3 aircraft…', spinner: true, shimmer: true },
  ]);
  expect(before).toBeNull();
  expect(live()).toEqual([]);
  expect(text(summary())).toBe('Searched traffic, 1 failed · 2 steps');
  expect(collapsed).toBe('false');
  expect(summary()?.getAttribute('aria-expanded')).toBe('true');
  expect(steps).toEqual([
    ['done', 'Finding aircraft approaching Seattle'],
    ['failed', 'Highlighting 3 aircraft (failed)'],
  ]);
});

test('consecutive tool calls fold into one activity line in a polite live region', () => {
  const messages: UiChatMessage<Chat.AnyTool>[] = [
    { id: 'user-1', role: 'user', content: 'Seattle?' },
    {
      id: 'assistant-1',
      role: 'assistant',
      toolCalls: [
        {
          role: 'tool',
          toolCallId: 't1',
          name: 'findAircraft',
          args: {},
          status: 'done',
          result: { status: 'fulfilled', value: [] },
        },
      ],
      ui: null,
    },
    {
      id: 'assistant-2',
      role: 'assistant',
      toolCalls: [
        {
          role: 'tool',
          toolCallId: 't2',
          name: 'clearHighlight',
          args: {},
          status: 'pending',
        },
      ],
      ui: null,
    },
  ];
  const items = transcriptItems(messages);

  const { element } = setup(<Transcript items={items} busy />);
  const list = element.querySelector('ol');
  const current = element.querySelector('[data-testid="tool-current"]');
  const status = element.querySelector('[data-testid="chat-status"]');

  expect(element.querySelectorAll('.atc-tool-run')).toHaveLength(1);
  expect(element.querySelector('[data-testid="tool-summary"]')).toBeNull();
  expect(text(current)).toBe('Clearing the highlight…');
  expect(current?.hasAttribute('aria-live')).toBe(false);
  expect(element.querySelector('[data-testid="thinking"]')).toBeNull();
  expect(list?.getAttribute('aria-live')).toBe('polite');
  expect(list?.getAttribute('aria-busy')).toBe('true');
  expect(status?.getAttribute('role')).toBe('status');
  expect(status?.closest('[aria-busy]')).toBeNull();
  expect(status?.classList.contains('atc-visually-hidden')).toBe(true);
  expect(text(status)).toBe('Clearing the highlight…');
});

test('a thinking line shimmers after the question until something else shows work', () => {
  const items = transcriptItems([{ role: 'user', content: 'Seattle?' }]);
  const { store, element, rerender } = setup(<Transcript items={items} busy />);

  const thinking = element.querySelector('[data-testid="thinking"]');
  const shimmer = thinking?.querySelector('.atc-shimmer');
  const label = text(thinking);
  const status = element.querySelector('[data-testid="chat-status"]');
  const announced = text(status);
  rerender(
    <AtcStoreProvider store={store}>
      <Transcript items={items} busy={false} />
    </AtcStoreProvider>,
  );

  expect(label).toBe('Thinking…');
  expect(shimmer).not.toBeUndefined();
  expect(shimmer).not.toBeNull();
  expect(element.querySelector('[data-testid="thinking"]')).toBeNull();
  expect(announced).toBe('Thinking…');
  expect(element.querySelector('[data-testid="chat-status"]')).toBe(status);
  expect(text(status)).toBe('');
});

test('reasoning shimmers while it streams and collapses to Reasoned once done', () => {
  const messages: UiChatMessage<Chat.AnyTool>[] = [
    { id: 'user-1', role: 'user', content: 'Highest?' },
    {
      id: 'assistant-1',
      role: 'assistant',
      reasoning: 'Comparing altitudes.',
      toolCalls: [],
      ui: null,
    },
  ];
  const { store, element, rerender } = setup(
    <Transcript items={transcriptItems(messages, true)} busy />,
  );

  const streaming = element.querySelector('[data-testid="reasoning"]');
  const label = text(streaming?.querySelector('.atc-shimmer'));
  const body = text(streaming?.querySelector('.atc-reasoning-text'));
  const thinking = element.querySelector('[data-testid="thinking"]');
  const announced = text(element.querySelector('[data-testid="chat-status"]'));
  rerender(
    <AtcStoreProvider store={store}>
      <Transcript items={transcriptItems(messages, false)} busy={false} />
    </AtcStoreProvider>,
  );
  const done = element.querySelector('[data-testid="reasoning"]');

  expect(streaming?.classList.contains('atc-reasoning')).toBe(true);
  expect(label).toBe('Reasoning');
  expect(body).toBe('Comparing altitudes.');
  expect(thinking).toBeNull();
  expect(announced).toBe('Reasoning…');
  expect(done?.querySelector('.atc-shimmer')).toBeNull();
  expect(done?.querySelector('details')?.open).toBe(false);
  expect(text(done?.querySelector('summary'))).toBe('Reasoned');
  expect(text(done?.querySelector('details .atc-reasoning-text'))).toBe(
    'Comparing altitudes.',
  );
});
