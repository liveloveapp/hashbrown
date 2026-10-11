import {
  type Aircraft,
  ATC_SOURCE_URL,
  createAtcStore,
  SELECTED_PROMPT,
  STARTER_PROMPTS,
  transcriptItems,
} from '@atc/shared';
import type { Chat } from '@hashbrownai/core';
import type { UiChatMessage } from '@hashbrownai/react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { expect, test } from 'vitest';
import { Composer } from './composer';
import { EmptyState } from './empty-state';
import { PanelHeader } from './panel-header';
import { AtcStoreProvider } from './store';
import { ToolChips } from './tool-chips';
import { Transcript } from './transcript';

const plane: Aircraft = {
  hex: 'aaaaaa',
  label: 'UAL100',
  callsign: 'UAL100',
  registration: null,
  typeCode: 'B39M',
  category: null,
  kind: 'jet',
  lat: 47.5716,
  lon: -122.3088,
  altitudeFt: 5000,
  onGround: false,
  groundSpeedKt: 240,
  trackDeg: 180,
  verticalRateFpm: -800,
};

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

test('the empty state asks a question and offers every starter prompt', () => {
  const picked: string[] = [];
  const { element } = setup(
    <EmptyState onPick={(prompt) => picked.push(prompt)} />,
  );

  const buttons = [...element.querySelectorAll('button')];
  buttons[1]?.click();

  expect(text(element.querySelector('.atc-empty-title'))).toBe(
    'Ask about the planes over the Pacific Northwest.',
  );
  expect(buttons.map((button) => text(button))).toEqual([...STARTER_PROMPTS]);
  expect(picked).toEqual([STARTER_PROMPTS[1]]);
});

test('the empty state offers the selected-plane question first while a plane is selected', () => {
  const { store, element } = setup(<EmptyState onPick={() => undefined} />);

  act(() => store.select('aaaaaa'));
  const buttons = [...element.querySelectorAll('button')];

  expect(buttons.map((button) => text(button))).toEqual([
    SELECTED_PROMPT,
    ...STARTER_PROMPTS,
  ]);
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

function composer() {
  const sent: string[] = [];
  const { element } = setup(
    <Composer onSend={(message) => sent.push(message)} />,
  );
  const input = element.querySelector('input') as HTMLInputElement;

  return { element, input, sent };
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

test('Enter sends the trimmed draft, clears the input and keeps focus', () => {
  const { element, input, sent } = composer();
  input.focus();

  fireEvent.change(input, { target: { value: '  Show me Seattle  ' } });
  fireEvent.submit(element.querySelector('form') as HTMLFormElement);

  expect(sent).toEqual(['Show me Seattle']);
  expect(input.value).toBe('');
  expect(document.activeElement).toBe(input);
});

test('consecutive tool calls fold into one activity line in a polite live region', () => {
  const messages: UiChatMessage<Chat.AnyTool>[] = [
    { role: 'user', content: 'Seattle?' },
    {
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

test('the composer has no footnote under it', () => {
  const { element } = composer();

  const link = element.querySelector('a');

  expect(link).toBeNull();
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
