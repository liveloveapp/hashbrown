// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { addsUserMessage, focusOpensSheet, isTyping } from './dom';

test('isTyping is true inside inputs, textareas, selects and editable regions', () => {
  document.body.innerHTML =
    '<input id="a"><textarea id="b"></textarea><select id="c"></select><div contenteditable="true"><span id="d"></span></div><button id="e"></button>';

  const results = ['a', 'b', 'c', 'd', 'e'].map((id) =>
    isTyping(document.getElementById(id)),
  );

  expect(results).toEqual([true, true, true, true, false]);
  expect(isTyping(null)).toBe(false);
});

test('focusOpensSheet is false only for the handle', () => {
  document.body.innerHTML =
    '<button class="atc-sheet-handle"><span id="grip"></span></button><input id="field">';

  const results = [
    focusOpensSheet(document.getElementById('grip')),
    focusOpensSheet(document.getElementById('field')),
    focusOpensSheet(null),
  ];

  expect(results).toEqual([false, true, true]);
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
