// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import {
  addsUserMessage,
  focusOpensSheet,
  hoverless,
  isEmptyChat,
  isFocusShortcut,
  isNearBottom,
  isTyping,
  keyboardInset,
} from './dom';

test('isTyping is true inside inputs, textareas, selects and editable regions', () => {
  document.body.innerHTML =
    '<input id="a"><textarea id="b"></textarea><select id="c"></select><div contenteditable="true"><span id="d"></span></div><button id="e"></button>';

  const results = ['a', 'b', 'c', 'd', 'e'].map((id) =>
    isTyping(document.getElementById(id)),
  );

  expect(results).toEqual([true, true, true, true, false]);
  expect(isTyping(null)).toBe(false);
});

test('focusOpensSheet is true only for a text field, so tapping a starter or the handle does not open it', () => {
  document.body.innerHTML =
    '<button class="atc-sheet-handle"><span id="grip"></span></button><input id="field"><button id="starter"></button>';

  const results = [
    focusOpensSheet(document.getElementById('grip')),
    focusOpensSheet(document.getElementById('field')),
    focusOpensSheet(document.getElementById('starter')),
    focusOpensSheet(null),
  ];

  expect(results).toEqual([false, true, false, false]);
});

test('addsUserMessage sees a user message added directly or nested', () => {
  const direct = document.createElement('div');
  direct.className = 'atc-user';
  const nested = document.createElement('section');
  nested.innerHTML = '<div class="atc-user"></div>';
  const other = document.createElement('p');
  const record = (node: Node) =>
    ({ addedNodes: [node] }) as unknown as MutationRecord;

  const results = [direct, nested, other].map((n) =>
    addsUserMessage(record(n)),
  );

  expect(results).toEqual([true, true, false]);
});

test('isEmptyChat is true only while the empty state is shown', () => {
  document.body.innerHTML =
    '<div id="empty"><div class="atc-empty"></div></div><div id="chat"><ol class="atc-transcript"><li></li></ol></div>';

  const results = ['empty', 'chat'].map((id) =>
    isEmptyChat(document.getElementById(id) as Element),
  );

  expect(results).toEqual([true, false]);
});

test('a scroller at the end follows new content', () => {
  const metrics = { scrollTop: 500, scrollHeight: 1000, clientHeight: 500 };

  expect(isNearBottom(metrics)).toBe(true);
});

test('a scroller within the threshold still follows', () => {
  const metrics = { scrollTop: 460, scrollHeight: 1000, clientHeight: 500 };

  expect(isNearBottom(metrics)).toBe(true);
});

test('a user who scrolled up is left alone', () => {
  const metrics = { scrollTop: 100, scrollHeight: 1000, clientHeight: 500 };

  expect(isNearBottom(metrics)).toBe(false);
});

test('hoverless is true only where the primary pointer cannot hover (touch screens)', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(hover: none)',
  }));
  const touch = hoverless();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const mouse = hoverless();
  vi.unstubAllGlobals();

  expect([touch, mouse]).toEqual([true, false]);
});

test('isFocusShortcut is true for a bare slash outside a text field', () => {
  document.body.innerHTML = '<input id="field"><button id="button"></button>';
  const button = document.getElementById('button');
  const field = document.getElementById('field');
  const key = (target: Element | null, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      key: '/',
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target?.dispatchEvent(event);

    return event;
  };
  const handled = key(button);
  handled.preventDefault();

  const results = [
    key(button),
    key(document.body),
    key(field),
    key(button, { key: 'a' }),
    key(button, { ctrlKey: true }),
    key(button, { metaKey: true }),
    key(button, { altKey: true }),
    handled,
  ].map(isFocusShortcut);

  expect(results).toEqual([
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
});

test('keyboardInset is the height the keyboard covers, in whole pixels', () => {
  const open = keyboardInset({ height: 400.4, offsetTop: 0 }, 700);
  const scrolled = keyboardInset({ height: 400, offsetTop: 50 }, 700);
  const closed = keyboardInset({ height: 700, offsetTop: 0 }, 700);
  const zoomed = keyboardInset({ height: 500, offsetTop: 300 }, 700);

  expect([open, scrolled, closed, zoomed]).toEqual([
    '300px',
    '250px',
    '0px',
    '0px',
  ]);
});
