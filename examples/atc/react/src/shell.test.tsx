import {
  type Aircraft,
  createAtcStore,
  SELECTED_PROMPT,
  SOURCE_URLS,
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
import { FeedBadge } from './feed-badge';
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

test('the header shows the mark, the Hashbrown credit and a connecting chip', () => {
  const { element } = setup(<PanelHeader />);

  const status = element.querySelector('[role="status"]');

  expect(element.querySelector('[aria-label="ATC"]')).not.toBeNull();
  expect(text(element)).toContain('built with Hashbrown');
  expect(text(status)).toBe('Connecting…');
});

test('the status chip counts live aircraft beside a solid dot', () => {
  const { store, element } = setup(<FeedBadge />);

  act(() => {
    store.setFeedStatus('live');
    store.applySnapshot({
      at: 1,
      aircraft: [plane, { ...plane, hex: 'bbbbbb' }],
    });
  });
  const chip = element.querySelector('.atc-chip');
  const status = element.querySelector('[role="status"]');

  expect(text(chip)).toBe('Live · 2 aircraft');
  expect(text(status)).toBe('Live');
  expect(chip?.querySelector('.atc-chip-dot:not(.is-hollow)')).not.toBeNull();
});

test('the status chip shows a hollow dot while connecting or delayed', () => {
  const { store, element } = setup(<FeedBadge />);

  const connecting = element.querySelector('.atc-chip-dot.is-hollow');
  act(() => store.setFeedStatus('delayed'));

  expect(connecting).not.toBeNull();
  expect(text(element.querySelector('.atc-chip'))).toBe('Data delayed');
  expect(element.querySelector('.atc-chip-dot.is-hollow')).not.toBeNull();
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

test('tool calls run live, then fold into one summary that expands to every step', () => {
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
    [...element.querySelectorAll('[data-testid="tool-chip"]')].map((chip) => ({
      text: text(chip),
      spinner: chip.querySelector('.atc-tool-spinner') !== null,
    }));
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
  const steps = [
    ...element.querySelectorAll('[data-testid="tool-step"]'),
  ].map((step) => [step.getAttribute('data-state'), text(step)]);

  expect(running).toEqual([
    { text: 'Finding aircraft · approaching KSEA', spinner: true },
    { text: 'Highlighting 3 aircraft', spinner: true },
  ]);
  expect(before).toBeNull();
  expect(live()).toEqual([]);
  expect(text(summary())).toBe('Searched traffic, 1 failed');
  expect(collapsed).toBe('false');
  expect(summary()?.getAttribute('aria-expanded')).toBe('true');
  expect(steps).toEqual([
    ['done', 'Finding aircraft · approaching KSEA'],
    ['failed', 'Highlighting 3 aircraft · failed'],
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

test('consecutive tool calls fold into one row in a polite live region', () => {
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

  expect(element.querySelectorAll('.atc-tool-run')).toHaveLength(1);
  expect(text(element.querySelector('[data-testid="tool-summary"]'))).toBe(
    'Searched traffic',
  );
  expect(
    [...element.querySelectorAll('[data-testid="tool-chip"]')].map((chip) =>
      text(chip),
    ),
  ).toEqual(['Clearing the highlight']);
  expect(list?.getAttribute('aria-live')).toBe('polite');
  expect(list?.getAttribute('aria-busy')).toBe('true');
});

test('the composer keeps a footnote link to the React core file', () => {
  const { element } = composer();

  const link = element.querySelector('a');

  expect(text(link)).toBe('View the core file');
  expect(link?.getAttribute('href')).toBe(SOURCE_URLS.react);
});
