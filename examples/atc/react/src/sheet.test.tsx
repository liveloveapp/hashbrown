import {
  focusOpensSheet,
  INITIAL_SHEET,
  nextSheet,
  sheetExpanded,
} from '@atc/shared';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useReducer } from 'react';
import { expect, test } from 'vitest';
import { useAutoScroll } from './dom-hooks';
import { SheetHandle } from './sheet-handle';

/** A sheet section like the app's: the handle and a text field drive `nextSheet`. */
function Sheet({ initial = INITIAL_SHEET }: { initial?: typeof INITIAL_SHEET }) {
  const [sheet, move] = useReducer(nextSheet, initial);

  return (
    <section
      data-snap={sheet.snap}
      onFocus={(event) => {
        if (focusOpensSheet(event.target)) move({ type: 'focus' });
      }}
    >
      <SheetHandle expanded={sheetExpanded(sheet)} onMove={move} />
      <input aria-label="Message" />
    </section>
  );
}

/** A pointer event with a position (jsdom has no PointerEvent constructor). */
function pointer(button: HTMLElement, type: string, clientY: number) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { clientY, pointerId: 1 });
  fireEvent(button, event);
}

function sheet(initial = INITIAL_SHEET) {
  cleanup();
  const { container } = render(<Sheet initial={initial} />);
  const section = container.querySelector('section') as HTMLElement;
  const button = container.querySelector('button') as HTMLButtonElement;

  return {
    button,
    input: container.querySelector('input') as HTMLInputElement,
    snap: () => section.dataset['snap'],
    expanded: () => section.dataset['snap'] === 'full',
  };
}

test('the sheet handle is a button that reports and toggles aria-expanded', () => {
  const { button } = sheet();

  const before = button.getAttribute('aria-expanded');
  const label = button.getAttribute('aria-label');
  act(() => button.click());
  const opened = button.getAttribute('aria-expanded');
  act(() => button.click());

  expect([before, opened, button.getAttribute('aria-expanded')]).toEqual([
    'false',
    'true',
    'false',
  ]);
  expect(label).toBe('Expand chat');
  expect(button.getAttribute('aria-controls')).toBe('atc-chat-sheet');
});

test('dragging the handle up moves the sheet one snap, without a second toggle from the click', () => {
  const { button, snap } = sheet();

  const drag = () => {
    pointer(button, 'pointerdown', 700);
    pointer(button, 'pointerup', 600);
    act(() => button.click());
    return snap();
  };
  const first = drag();
  const second = drag();

  expect([first, second]).toEqual(['half', 'full']);
  expect(button.getAttribute('aria-expanded')).toBe('true');
});

test('dragging the handle down lowers an open sheet one snap', () => {
  const { button, snap } = sheet({ snap: 'full', held: true });

  pointer(button, 'pointerdown', 300);
  pointer(button, 'pointerup', 420);
  act(() => button.click());

  expect(snap()).toBe('half');
});

test('focusing the handle does not open the sheet, so one tap opens and the next closes', () => {
  const { button, expanded } = sheet();
  const opened: boolean[] = [];

  const tap = () => {
    act(() => {
      button.focus();
      button.click();
    });
    opened.push(expanded());
  };
  tap();
  button.blur();
  tap();

  expect(opened).toEqual([true, false]);
});

test('focusing the composer opens the sheet', () => {
  const { input, expanded } = sheet();

  act(() => input.focus());

  expect(expanded()).toBe(true);
});

function Scroller() {
  return <div className="scroller" {...useAutoScroll<HTMLDivElement>()} />;
}

function scroller() {
  cleanup();
  const { container } = render(<Scroller />);
  const element = container.querySelector('.scroller') as HTMLElement;
  Object.defineProperty(element, 'scrollHeight', { value: 1000 });
  Object.defineProperty(element, 'clientHeight', { value: 500 });

  return element;
}

async function append(element: HTMLElement, node: Element) {
  element.append(node);
  await new Promise((resolve) => setTimeout(resolve));
}

function row(className: string): HTMLElement {
  const element = document.createElement('p');
  element.className = className;
  return element;
}

test('streamed content scrolls to the newest row while the user is at the end', async () => {
  const element = scroller();
  element.scrollTop = 0;

  await append(element, row('atc-prose'));

  expect(element.scrollTop).toBe(1000);
});

test('a user who scrolled up is not yanked down, until they send a message', async () => {
  const element = scroller();
  element.scrollTop = 100;
  fireEvent.scroll(element);

  await append(element, row('atc-prose'));
  const stayed = element.scrollTop;
  const li = document.createElement('li');
  li.append(row('atc-user'));
  await append(element, li);

  expect(stayed).toBe(100);
  expect(element.scrollTop).toBe(1000);
});

test('an empty chat is not scrolled, so the headline and starters stay in view', async () => {
  const element = scroller();
  element.scrollTop = 0;

  await append(element, row('atc-empty'));

  expect(element.scrollTop).toBe(0);
});
