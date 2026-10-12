import {
  focusOpensSheet,
  INITIAL_SHEET,
  nextSheet,
  sheetExpanded,
} from '@atc/shared';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useReducer } from 'react';
import { expect, test } from 'vitest';
import { Composer } from './composer';
import { SheetHandle } from './sheet-handle';

/** A sheet section like the app's: the handle and a text field drive `nextSheet`. */
function Sheet({
  initial = INITIAL_SHEET,
}: {
  initial?: typeof INITIAL_SHEET;
}) {
  const [sheet, move] = useReducer(nextSheet, initial);

  return (
    <section
      data-snap={sheet.snap}
      onFocus={(event) => {
        if (focusOpensSheet(event.target)) {
          move({ type: 'focus' });
        }
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
  act(() => button.click());
  const opened = button.getAttribute('aria-expanded');
  const label = button.getAttribute('aria-label');
  act(() => button.click());

  expect([before, opened, button.getAttribute('aria-expanded')]).toEqual([
    'false',
    'true',
    'false',
  ]);
  expect(label).toBe('Collapse chat');
  expect(button.getAttribute('aria-label')).toBe('Expand chat');
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

test('focusing the composer opens the sheet fully', () => {
  const { input, expanded } = sheet();

  act(() => input.focus());

  expect(expanded()).toBe(true);
});

/** The app's sheet around the real composer: focus opens it, sending lowers it. */
function ComposerSheet() {
  const [sheet, move] = useReducer(nextSheet, INITIAL_SHEET);

  return (
    <section
      data-snap={sheet.snap}
      onFocus={(event) => {
        if (focusOpensSheet(event.target)) {
          move({ type: 'focus' });
        }
      }}
    >
      <Composer onSend={() => move({ type: 'send' })} />
    </section>
  );
}

function composerSheet() {
  cleanup();
  const { container } = render(<ComposerSheet />);

  return container;
}

test('tapping Send lowers the sheet to half, though the composer takes focus back', () => {
  const container = composerSheet();
  const field = container.querySelector('input') as HTMLInputElement;
  const send = container.querySelector('.atc-send') as HTMLButtonElement;
  act(() => field.focus());
  fireEvent.change(field, { target: { value: "What's flying near Seattle?" } });
  // A tap moves focus to the Send button before it submits.
  act(() => send.focus());

  fireEvent.click(send);

  expect(container.querySelector('section')?.getAttribute('data-snap')).toBe(
    'half',
  );
  expect(document.activeElement).toBe(field);
});
