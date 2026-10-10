// @vitest-environment jsdom
import { expect, test } from 'vitest';
import {
  addsUserMessage,
  focusOpensSheet,
  isEmptyChat,
  isNearBottom,
  isTyping,
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
