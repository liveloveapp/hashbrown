import { expect, test } from 'vitest';
import {
  getApplicableShoppingList,
  type ShoppingListRun,
  validateShoppingList,
} from '../../examples/quickstart/runtime/shopping-list';

const valid = { items: [{ name: ' apples ', quantity: 2 }] };
const completed: ShoppingListRun = {
  requestId: 'request-2',
  cancelled: false,
  messages: [
    { id: 'request-2', role: 'user', content: 'Apples' },
    { id: 'answer-2', role: 'assistant', content: valid },
  ],
  isSending: false,
  isReceiving: false,
  isGenerating: false,
  isLoading: false,
};

test('validates and trims a fresh copy without mutating the draft', () => {
  const draft = structuredClone(valid);

  const result = validateShoppingList(draft);

  expect(result).toEqual({ items: [{ name: 'apples', quantity: 2 }] });
  expect(draft).toEqual(valid);
  expect(result).not.toBe(draft);
  expect(result?.items[0]).not.toBe(draft.items[0]);
});

test('rejects malformed data and schema-valid values outside application limits', () => {
  const invalid = [
    null,
    {},
    { items: [] },
    { items: 'apples' },
    { items: [null] },
    { items: [{ name: 'apples' }] },
    { items: [{ name: ' ', quantity: 2 }] },
    { items: [{ name: 'x'.repeat(81), quantity: 2 }] },
    ...[0, 21, 1.5, '2', NaN, Infinity].map((quantity) => ({
      items: [{ name: 'apples', quantity }],
    })),
    {
      items: Array.from({ length: 11 }, () => ({ name: 'apple', quantity: 1 })),
    },
  ];

  const results = invalid.map(validateShoppingList);

  expect(results.every((value) => value === undefined)).toBe(true);
});

test('accepts the inclusive application boundaries', () => {
  const draft = {
    items: Array.from({ length: 10 }, (_, index) => ({
      name: 'x'.repeat(80),
      quantity: index === 0 ? 1 : 20,
    })),
  };

  const result = validateShoppingList(draft);

  expect(result).toEqual(draft);
});

test('permits only the completed current request and revalidates its contents', () => {
  const invalid = {
    ...completed,
    messages: [
      ...completed.messages.slice(0, 1),
      {
        id: 'answer-2',
        role: 'assistant',
        content: { items: [{ name: 'apple', quantity: 0 }] },
      },
    ],
  };

  const result = getApplicableShoppingList(completed);

  expect(result).toEqual({ items: [{ name: 'apples', quantity: 2 }] });
  expect(getApplicableShoppingList(invalid)).toBeUndefined();
});

test('withholds complete JSON until runtime completion, including the debounce window', () => {
  const stages = [
    'isSending',
    'isReceiving',
    'isGenerating',
    'isLoading',
  ] as const;

  const results = stages.map((stage) =>
    getApplicableShoppingList({ ...completed, [stage]: true }),
  );

  expect(results).toEqual([undefined, undefined, undefined, undefined]);
});

test('rejects cancellation, errors, truncation, and stale or absent replacement answers', () => {
  const blocked: ShoppingListRun[] = [
    { ...completed, cancelled: true },
    { ...completed, error: new Error('parse failed') },
    { ...completed, finishReason: 'length' },
    { ...completed, requestId: 'request-3' },
    { ...completed, requestId: undefined },
    {
      ...completed,
      messages: [
        ...completed.messages,
        { id: 'request-3', role: 'user', content: 'Bread' },
      ],
      requestId: 'request-3',
    },
    {
      ...completed,
      messages: [{ id: 'request-2', role: 'user', content: 'Apples' }],
    },
    {
      ...completed,
      messages: [
        ...completed.messages.slice(0, 1),
        { id: 'answer-2', role: 'assistant', content: { items: [] } },
      ],
    },
  ];

  const results = blocked.map(getApplicableShoppingList);

  expect(results.every((value) => value === undefined)).toBe(true);
});

test('accepts histories containing ID-less error messages but requires the current user ID', () => {
  const history: ShoppingListRun['messages'] = [
    { role: 'error', content: 'An earlier request failed' },
    ...completed.messages,
  ];
  const original = structuredClone(history);
  const missingUserId: ShoppingListRun = {
    ...completed,
    messages: [{ role: 'user', content: 'Apples' }, completed.messages[1]],
  };

  const result = getApplicableShoppingList({ ...completed, messages: history });

  expect(result).toEqual({ items: [{ name: 'apples', quantity: 2 }] });
  expect(history).toEqual(original);
  expect(getApplicableShoppingList(missingUserId)).toBeUndefined();
});
