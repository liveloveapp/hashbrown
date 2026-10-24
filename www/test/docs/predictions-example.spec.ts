import { expect, test } from 'vitest';
import {
  acceptPrediction,
  getApplicableSuggestions,
  type PredictionRun,
} from '../../examples/quickstart/runtime/predictions';

const completed: PredictionRun = {
  input: { contextId: 'city-1', context: 'city', currentItemIds: ['passport'] },
  output: {
    contextId: 'city-1',
    suggestions: [
      { itemId: 'charger', reason: ' Charge your phone. ' },
      { itemId: 'water', reason: 'Stay hydrated.' },
    ],
  },
  appliedItemIds: ['passport'],
  hiddenItemIds: [],
  cancelled: false,
  isSending: false,
  isReceiving: false,
  isGenerating: false,
  isLoading: false,
};

test('validates a current completed result and returns trimmed independent suggestions', () => {
  const original = structuredClone(completed);

  const result = getApplicableSuggestions(completed);

  expect(result).toEqual([
    { itemId: 'charger', reason: 'Charge your phone.' },
    { itemId: 'water', reason: 'Stay hydrated.' },
  ]);
  expect(completed).toEqual(original);
  expect(result).not.toBe(completed.output);
});

test('withholds old context output immediately even before debounce flags change', () => {
  const next = {
    ...completed,
    input: {
      contextId: 'hiking-2',
      context: 'hiking' as const,
      currentItemIds: [],
    },
  };

  const result = getApplicableSuggestions(next);

  expect(result).toBeUndefined();
  expect(acceptPrediction(next, 'charger')).toBeUndefined();
  expect(
    getApplicableSuggestions({ ...completed, input: null }),
  ).toBeUndefined();
});

test('requires settled flags and rejects cancellation, error and non-stop finishes', () => {
  const blocked: PredictionRun[] = [
    ...(['isSending', 'isReceiving', 'isGenerating', 'isLoading'] as const).map(
      (flag) => ({ ...completed, [flag]: true }),
    ),
    { ...completed, cancelled: true },
    { ...completed, error: new Error('failed') },
    ...['length', 'content_filter', 'tool_calls'].map((finishReason) => ({
      ...completed,
      finishReason,
    })),
  ];

  const results = blocked.map(getApplicableSuggestions);

  expect(results.every((result) => result === undefined)).toBe(true);
  expect(
    getApplicableSuggestions({ ...completed, finishReason: 'stop' }),
  ).toHaveLength(2);
});

test('accepts empty results and rejects malformed, oversized and unbounded suggestions', () => {
  const invalid = [
    null,
    {},
    { contextId: 'city-1', suggestions: 'charger' },
    ...[
      null,
      { itemId: 'unknown', reason: 'Useful' },
      { itemId: 'charger', reason: ' ' },
      { itemId: 'charger', reason: 'x'.repeat(141) },
      { itemId: 'charger', reason: 42 },
    ].map((item) => ({ contextId: 'city-1', suggestions: [item] })),
    {
      contextId: 'city-1',
      suggestions: Array.from({ length: 5 }, () => ({
        itemId: 'charger',
        reason: 'Useful',
      })),
    },
  ];

  const results = invalid.map((output) =>
    getApplicableSuggestions({ ...completed, output }),
  );

  expect(results.every((result) => result === undefined)).toBe(true);
  expect(
    getApplicableSuggestions({
      ...completed,
      output: { contextId: 'city-1', suggestions: [] },
    }),
  ).toEqual([]);
  expect(
    getApplicableSuggestions({
      ...completed,
      output: {
        contextId: 'city-1',
        suggestions: [{ itemId: 'charger', reason: 'x'.repeat(140) }],
      },
    }),
  ).toHaveLength(1);
});

test('filters duplicate, snapshot, already applied and dismissed item IDs', () => {
  const run: PredictionRun = {
    ...completed,
    appliedItemIds: ['passport', 'water'],
    hiddenItemIds: ['sunscreen'],
    output: {
      contextId: 'city-1',
      suggestions: [
        { itemId: 'passport', reason: 'Identity' },
        { itemId: 'charger', reason: 'Phone' },
        { itemId: 'charger', reason: 'Duplicate' },
        { itemId: 'water', reason: 'Drink' },
      ],
    },
  };

  const result = getApplicableSuggestions(run);

  expect(result).toEqual([{ itemId: 'charger', reason: 'Phone' }]);
  expect(
    getApplicableSuggestions({
      ...completed,
      hiddenItemIds: ['charger', 'water'],
    }),
  ).toEqual([]);
});

test('accept revalidates current context, cancellation and duplicates without mutating the snapshot', () => {
  const original = structuredClone(completed);

  const accepted = acceptPrediction(completed, 'charger');

  expect(accepted).toEqual(['passport', 'charger']);
  expect(completed).toEqual(original);
  expect(
    acceptPrediction(
      { ...completed, appliedItemIds: accepted ?? [] },
      'charger',
    ),
  ).toBeUndefined();
  expect(
    acceptPrediction({ ...completed, cancelled: true }, 'charger'),
  ).toBeUndefined();
  expect(
    acceptPrediction({ ...completed, hiddenItemIds: ['charger'] }, 'charger'),
  ).toBeUndefined();
  expect(acceptPrediction(completed, 'sunscreen')).toBeUndefined();
});
