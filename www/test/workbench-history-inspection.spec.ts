import { expect, test } from 'vitest';
import { assertWorkbenchSavedTextInspection } from '../src/tools/workbench-history-inspection';

const encoded = JSON.stringify({
  version: 1,
  messages: [
    { role: 'user', content: 'Lighthouse' },
    { role: 'assistant', content: 'Outline, then record.' },
  ],
});
const source = {
  selectedSlot: 'Lighthouse',
  cachedRead: { status: 'valid', document: JSON.parse(encoded), error: null },
};
const detail = {
  action: 'load',
  replacementIntent: null,
  error: null,
  canSave: false,
  successfulGeneration: false,
  note: 'Cached explicit read; browser storage is origin-local.',
};
const expected = {
  slot: 'Lighthouse' as const,
  encoded,
  action: 'load',
  canSave: false,
  successfulGeneration: false,
};

test('saved inspector compares the cached versioned document to actual selected-slot bytes', () => {
  expect(() =>
    assertWorkbenchSavedTextInspection(source, detail, expected),
  ).not.toThrow();
  expect(() =>
    assertWorkbenchSavedTextInspection(
      { ...source, selectedSlot: 'Harbor' },
      detail,
      expected,
    ),
  ).toThrow();
  expect(() =>
    assertWorkbenchSavedTextInspection(source, detail, {
      ...expected,
      encoded: JSON.stringify({ version: 1, messages: [] }),
    }),
  ).toThrow();
});

test('saved inspector rejects stale save eligibility after reload or restoration', () => {
  expect(() =>
    assertWorkbenchSavedTextInspection(
      source,
      { ...detail, canSave: true },
      expected,
    ),
  ).toThrow();
  expect(() =>
    assertWorkbenchSavedTextInspection(
      source,
      { ...detail, successfulGeneration: true },
      expected,
    ),
  ).toThrow();
  expect(() =>
    assertWorkbenchSavedTextInspection(
      source,
      { ...detail, action: 'save' },
      expected,
    ),
  ).toThrow();
});

test('saved inspector keeps full SDK history out of both saved-document panes', () => {
  expect(() =>
    assertWorkbenchSavedTextInspection(
      { ...source, sdk: { messages: [{ id: 'sdk-message' }] } },
      detail,
      expected,
    ),
  ).toThrow();
  expect(() =>
    assertWorkbenchSavedTextInspection(
      source,
      { ...detail, messages: source.cachedRead.document.messages },
      expected,
    ),
  ).toThrow();
});
