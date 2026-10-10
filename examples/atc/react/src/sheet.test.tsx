import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { expect, test } from 'vitest';
import { useAutoScroll } from './dom-hooks';
import { focusOpensSheet, SheetHandle } from './sheet-handle';

/** A sheet section like the app's: focus inside opens it, the handle toggles. */
function Sheet({ initial = false }: { initial?: boolean }) {
  const [expanded, setExpanded] = useState(initial);

  return (
    <section
      data-expanded={expanded}
      onFocus={(event) => {
        if (focusOpensSheet(event.target)) setExpanded(true);
      }}
    >
      <SheetHandle expanded={expanded} onExpandedChange={setExpanded} />
      <input aria-label="Message" />
    </section>
  );
}

function sheet(initial = false) {
  cleanup();
  const { container } = render(<Sheet initial={initial} />);
  const section = container.querySelector('section') as HTMLElement;
  const button = container.querySelector('button') as HTMLButtonElement;

  return {
    button,
    input: container.querySelector('input') as HTMLInputElement,
    expanded: () => section.dataset['expanded'] === 'true',
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

test('dragging the handle up opens the sheet without a second toggle from the click', () => {
  const { button, expanded } = sheet();

  fireEvent.pointerDown(button, { clientY: 700, pointerId: 1 });
  fireEvent.pointerUp(button, { clientY: 600, pointerId: 1 });
  act(() => button.click());

  expect(expanded()).toBe(true);
  expect(button.getAttribute('aria-expanded')).toBe('true');
});

test('dragging the handle down closes an open sheet', () => {
  const { button, expanded } = sheet(true);

  fireEvent.pointerDown(button, { clientY: 300, pointerId: 1 });
  fireEvent.pointerUp(button, { clientY: 420, pointerId: 1 });
  act(() => button.click());

  expect(expanded()).toBe(false);
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
