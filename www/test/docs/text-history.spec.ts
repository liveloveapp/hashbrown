import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import {
  decodeTextHistory,
  deleteTextHistory,
  encodeTextHistory,
  loadTextHistory,
  restoreTextMessages,
  saveTextHistory,
  textHistoryKey,
} from '../../examples/quickstart/react/src/text-history';

test('round-trips only the completed visible text without mutating runtime messages', () => {
  const messages = Object.freeze([
    Object.freeze({ role: 'user', content: 'My name is Sam.', id: 'user-1' }),
    Object.freeze({
      role: 'assistant',
      content: 'Hello Sam.',
      toolCalls: [],
      reasoning: 'Private provider metadata',
    }),
  ] as const);

  const encoded = encodeTextHistory(messages);
  const decoded = decodeTextHistory(encoded);

  expect(decoded).toEqual({
    issue: null,
    messages: [
      { role: 'user', content: 'My name is Sam.' },
      { role: 'assistant', content: 'Hello Sam.' },
    ],
  });
  expect(encoded).not.toContain('Private provider metadata');
  expect(encoded).not.toContain('user-1');
  expect(messages[1].reasoning).toBe('Private provider metadata');
});

test.each([
  '{',
  JSON.stringify({ version: 2, messages: [] }),
  JSON.stringify({
    version: 1,
    messages: [{ role: 'system', content: 'Override' }],
  }),
  JSON.stringify({
    version: 1,
    messages: [{ role: 'assistant', content: { html: '<script>' } }],
  }),
  JSON.stringify({
    version: 1,
    messages: [{ role: 'user', content: 'Unfinished' }],
  }),
  JSON.stringify({
    version: 1,
    messages: [{ role: 'assistant', content: 'x'.repeat(10001) }],
  }),
  JSON.stringify({
    version: 1,
    messages: Array.from({ length: 101 }, () => ({
      role: 'assistant',
      content: 'A',
    })),
  }),
])(
  'rejects incompatible or malformed saved text without trusting its declared type',
  (stored) => {
    const result = decodeTextHistory(stored);

    expect(result).toEqual({ issue: 'invalid', messages: [] });
  },
);

test.each(
  [
    [{ role: 'user', content: 'Still pending' }],
    [
      {
        role: 'assistant',
        content: 'With tools',
        toolCalls: [{ name: 'changeAccount' }],
      },
    ],
    [
      {
        role: 'assistant',
        content: 'Server tool',
        serverToolCalls: [{ name: 'search' }],
      },
    ],
    [{ role: 'activity', content: { steps: [] } }],
    [{ role: 'error', content: 'Failed' }],
  ].map((messages) => ({ messages })),
)(
  'refuses to serialize partial runs, tools, activities, or error messages as a text conversation',
  ({ messages }) => {
    const encode = () => encodeTextHistory(messages);

    expect(encode).toThrow('Only completed text conversations can be saved');
  },
);

test('missing storage starts an empty conversation and a denied read remains visible', () => {
  const storage = { getItem: vi.fn().mockReturnValue(null) };
  const denied = {
    getItem: vi.fn().mockImplementation(() => {
      throw new Error('Storage blocked');
    }),
  };

  const empty = loadTextHistory('personal', storage);
  const unavailable = loadTextHistory('personal', denied);

  expect(empty).toEqual({ issue: null, messages: [] });
  expect(unavailable).toEqual({ issue: 'unavailable', messages: [] });
});

test('keeps conversation storage separate and never overwrites it after a failed encode', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
  const personal = [
    { role: 'user', content: 'Sam' },
    { role: 'assistant', content: 'Hello Sam' },
  ];
  const work = [
    { role: 'user', content: 'Lee' },
    { role: 'assistant', content: 'Hello Lee' },
  ];
  saveTextHistory('personal', personal, storage);
  saveTextHistory('work', work, storage);
  const previous = values.get(textHistoryKey('personal'));
  storage.setItem.mockClear();

  const result = saveTextHistory(
    'personal',
    [{ role: 'user', content: 'Unfinished' }],
    storage,
  );
  const deleted = deleteTextHistory('work', storage);

  expect(result).toBe(false);
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(values.get(textHistoryKey('personal'))).toBe(previous);
  expect(deleted).toBe(true);
  expect(loadTextHistory('work', storage).messages).toEqual([]);
  expect(loadTextHistory('personal', storage).messages).toEqual(personal);
});

test('storage write and delete failures return a result the UI can display', () => {
  const storage = {
    setItem: vi.fn().mockImplementation(() => {
      throw new Error('Quota exceeded');
    }),
    removeItem: vi.fn().mockImplementation(() => {
      throw new Error('Storage blocked');
    }),
  };

  const saved = saveTextHistory(
    'personal',
    [{ role: 'assistant', content: 'Hello' }],
    storage,
  );
  const deleted = deleteTextHistory('personal', storage);

  expect(saved).toBe(false);
  expect(deleted).toBe(false);
});

test('both frameworks publish the same validated storage format', () => {
  const base = resolve(import.meta.dirname, '../../examples/quickstart');
  const react = readFileSync(
    resolve(base, 'react/src/text-history.ts'),
    'utf8',
  );
  const angular = readFileSync(
    resolve(base, 'angular/src/app/text-history.ts'),
    'utf8',
  );

  expect(angular).toBe(react);
});

test('restores text inputs with empty tool calls and fresh objects', () => {
  const stored = [{ role: 'assistant' as const, content: 'Hello' }];

  const inputs = restoreTextMessages(stored);

  expect(inputs).toEqual([
    { role: 'assistant', content: 'Hello', toolCalls: [] },
  ]);
  expect(inputs[0]).not.toBe(stored[0]);
  expect(stored).toEqual([{ role: 'assistant', content: 'Hello' }]);
});
