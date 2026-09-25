// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { isSearchShortcut } from '../../src/components/search/search-shortcut';

function keydown(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  let captured: KeyboardEvent | undefined;
  const listener = (event: Event) => {
    captured = event as KeyboardEvent;
  };
  document.addEventListener('keydown', listener);
  target.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
  );
  document.removeEventListener('keydown', listener);
  if (!captured) {
    throw new Error('keydown did not reach the document');
  }
  return captured;
}

test('⌘K and Ctrl+K open search, in either case', () => {
  const inits: KeyboardEventInit[] = [
    { key: 'k', metaKey: true },
    { key: 'K', metaKey: true },
    { key: 'k', ctrlKey: true },
  ];

  const result = inits.map((init) =>
    isSearchShortcut(keydown(document.body, init)),
  );

  expect(result).toEqual([true, true, true]);
});

test('K without a modifier, or another key, does not open search', () => {
  const inits: KeyboardEventInit[] = [
    { key: 'k' },
    { key: 'j', metaKey: true },
  ];

  const result = inits.map((init) =>
    isSearchShortcut(keydown(document.body, init)),
  );

  expect(result).toEqual([false, false]);
});

test('typing in an input, textarea or contenteditable keeps ⌘K', () => {
  const input = document.createElement('input');
  const textarea = document.createElement('textarea');
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  document.body.replaceChildren(input, textarea, editable);

  const result = [input, textarea, editable].map((target) =>
    isSearchShortcut(keydown(target, { key: 'k', metaKey: true })),
  );

  expect(result).toEqual([false, false, false]);
});

test('a keydown another handler already took is ignored', () => {
  const button = document.createElement('button');
  document.body.replaceChildren(button);
  button.addEventListener('keydown', (event) => event.preventDefault());

  const result = isSearchShortcut(keydown(button, { key: 'k', metaKey: true }));

  expect(result).toBe(false);
});
