import { DecisionResponseError } from '@hashbrownai/core';
import type { Decision } from '@hashbrownai/core';
import { fromNativeResponse } from './from-native';
import type { NativeResponse } from './native.types';
import * as fixture from './__fixtures__/response.json';

const native = fixture as unknown as NativeResponse;

const questions: Record<string, Decision.Question> = {
  'flags.is_urgent': { type: 'yesNo', instructions: 'urgent?' },
  department: {
    type: 'choice',
    instructions: 'team?',
    options: { billing: null, technical: null },
  },
  frustration: {
    type: 'score',
    instructions: 'frustration?',
    levels: { '0': 'Calm', '1': 'Frustrated', '2': 'Very angry' },
  },
};

const withAnswers = (answers: NativeResponse['answers']): NativeResponse => ({
  ...native,
  answers,
});

const renamed = (answers: NativeResponse['answers']) => ({
  ...answers,
  'flags.is_urgent': answers['is_urgent'],
});

test('choice answers map to value and ChoiceMeta', () => {
  const response = fromNativeResponse(
    withAnswers(renamed(native.answers)),
    questions,
  );

  expect(response.kind).toBe('hashbrown.decision');
  expect(response.version).toBe(1);
  expect((response.value as Record<string, unknown>)['department']).toBe(
    'billing',
  );
  expect(response.meta['department']).toEqual({
    confidence: 0.81,
    probabilities: { billing: 0.88, technical: 0.12 },
  });
});

test('score answers take the nearest level for value and keep the weighted score in meta', () => {
  const response = fromNativeResponse(
    withAnswers(renamed(native.answers)),
    questions,
  );

  expect((response.value as Record<string, unknown>)['frustration']).toBe(1);
  expect(response.meta['frustration']).toEqual({
    confidence: 0.92,
    score: 1.05,
    probabilities: { '0': 0, '1': 0.95, '2': 0.05 },
  });
});

test('score uses the level keys rather than indexes', () => {
  const lettered: Record<string, Decision.Question> = {
    s: { type: 'score', instructions: 'x', levels: { '10': 'a', '20': 'b' } },
  };
  const input: NativeResponse = {
    answers: {
      s: {
        type: 'score',
        score: 0.8,
        probabilities: { '0': 0.2, '1': 0.8 },
        confidence: 0.5,
      },
    },
  };

  const response = fromNativeResponse(input, lettered);

  expect(response.value).toEqual({ s: 20 });
  expect(response.meta['s']).toEqual({
    confidence: 0.5,
    score: 18,
    probabilities: { '10': 0.2, '20': 0.8 },
  });
});

test('noul maps to a boolean at 0.5 and YesNoMeta, nested by dotted id', () => {
  const response = fromNativeResponse(
    withAnswers(renamed(native.answers)),
    questions,
  );
  const low = fromNativeResponse(
    withAnswers({
      ...renamed(native.answers),
      'flags.is_urgent': { type: 'noul', noul: 0.4 },
    }),
    questions,
  );

  expect((response.value as { flags: unknown }).flags).toEqual({
    is_urgent: true,
  });
  expect(response.meta['flags.is_urgent']).toEqual({ probability: 0.95 });
  expect((low.value as { flags: unknown }).flags).toEqual({ is_urgent: false });
  expect(
    fromNativeResponse(
      withAnswers({
        ...renamed(native.answers),
        'flags.is_urgent': { type: 'noul', noul: 0.5 },
      }),
      questions,
    ).meta['flags.is_urgent'],
  ).toEqual({ probability: 0.5 });
});

test('usage maps to camelCase', () => {
  const response = fromNativeResponse(
    withAnswers(renamed(native.answers)),
    questions,
  );

  expect(response.usage).toEqual({ inputTokens: 296, outputTokens: 20 });
});

test('usage is omitted when absent', () => {
  const rest: NativeResponse = { answers: native.answers };

  const response = fromNativeResponse(
    { ...rest, answers: renamed(native.answers) },
    questions,
  );

  expect('usage' in response).toBe(false);
});

test('an answer choice outside the question options throws DecisionResponseError', () => {
  const bad = withAnswers({
    ...renamed(native.answers),
    department: {
      type: 'choice',
      choice: 'legal',
      probabilities: { legal: 1 },
      confidence: 1,
    },
  });

  expect(() => fromNativeResponse(bad, questions)).toThrow(
    DecisionResponseError,
  );
});

test('a missing answer throws', () => {
  const missing = withAnswers({ department: native.answers['department'] });

  expect(() => fromNativeResponse(missing, questions)).toThrow(
    DecisionResponseError,
  );
});

test('an answer of the wrong type throws', () => {
  const wrong = withAnswers({
    ...renamed(native.answers),
    department: { type: 'noul', noul: 1 },
  });

  expect(() => fromNativeResponse(wrong, questions)).toThrow(
    DecisionResponseError,
  );
});

test('meta.score interpolates between non-uniform level values', () => {
  const uneven: Record<string, Decision.Question> = {
    s: {
      type: 'score',
      instructions: 'x',
      levels: { '0': 'a', '1': 'b', '10': 'c' },
    },
  };
  const input: NativeResponse = {
    answers: {
      s: {
        type: 'score',
        score: 1.5,
        probabilities: { '0': 0, '1': 0.5, '2': 0.5 },
        confidence: 0.5,
      },
    },
  };

  const response = fromNativeResponse(input, uneven);

  expect(response.value).toEqual({ s: 10 });
  expect((response.meta['s'] as Decision.ScoreMeta).score).toBe(5.5);
});

test('fractional score indexes map to levels in numeric order', () => {
  const fractional: Record<string, Decision.Question> = {
    w: {
      type: 'score',
      instructions: 'w',
      levels: { '0': 'a', '0.25': 'b', '0.5': 'c', '0.75': 'd', '1': 'e' },
    },
  };
  const input: NativeResponse = {
    answers: {
      w: {
        type: 'score',
        score: 1,
        probabilities: { '0': 0.1, '1': 0.6, '2': 0.1, '3': 0.1, '4': 0.1 },
        confidence: 0.5,
      },
    },
  };

  const response = fromNativeResponse(input, fractional);

  expect(response.value).toEqual({ w: 0.25 });
  const meta = response.meta['w'] as Decision.ScoreMeta;
  expect(meta.score).toBe(0.25);
  expect(
    Object.entries(meta.probabilities).sort(
      ([a], [b]) => Number(a) - Number(b),
    ),
  ).toEqual([
    ['0', 0.1],
    ['0.25', 0.6],
    ['0.5', 0.1],
    ['0.75', 0.1],
    ['1', 0.1],
  ]);
});

test('negative score indexes map to levels in numeric order', () => {
  const negative: Record<string, Decision.Question> = {
    t: {
      type: 'score',
      instructions: 't',
      levels: { '-2': 'a', '-1': 'b', '0': 'c', '1': 'd', '2': 'e' },
    },
  };
  const input: NativeResponse = {
    answers: {
      t: {
        type: 'score',
        score: 0.75,
        probabilities: { '0': 0.3, '1': 0.6, '2': 0.1, '3': 0, '4': 0 },
        confidence: 0.5,
      },
    },
  };

  const response = fromNativeResponse(input, negative);

  expect(response.value).toEqual({ t: -1 });
  const meta = response.meta['t'] as Decision.ScoreMeta;
  expect(meta.score).toBe(-1.25);
  expect(meta.probabilities).toEqual({
    '-2': 0.3,
    '-1': 0.6,
    '0': 0.1,
    '1': 0,
    '2': 0,
  });
});

test('null probabilities throw DecisionResponseError', () => {
  const bad = withAnswers({
    ...renamed(native.answers),
    frustration: {
      type: 'score',
      score: 1,
      probabilities: null as unknown as Record<string, number>,
      confidence: 0.5,
    },
  });

  expect(() => fromNativeResponse(bad, questions)).toThrow(
    DecisionResponseError,
  );
});

test('non-numeric confidence or score throws DecisionResponseError', () => {
  const badConfidence = withAnswers({
    ...renamed(native.answers),
    department: {
      type: 'choice',
      choice: 'billing',
      probabilities: { billing: 1 },
      confidence: 'high' as unknown as number,
    },
  });
  const badScore = withAnswers({
    ...renamed(native.answers),
    frustration: {
      type: 'score',
      score: 'one' as unknown as number,
      probabilities: { '0': 1 },
      confidence: 0.5,
    },
  });
  const badProbability = withAnswers({
    ...renamed(native.answers),
    department: {
      type: 'choice',
      choice: 'billing',
      probabilities: { billing: 'most' as unknown as number },
      confidence: 1,
    },
  });

  expect(() => fromNativeResponse(badConfidence, questions)).toThrow(
    DecisionResponseError,
  );
  expect(() => fromNativeResponse(badScore, questions)).toThrow(
    DecisionResponseError,
  );
  expect(() => fromNativeResponse(badProbability, questions)).toThrow(
    DecisionResponseError,
  );
});

test('a non-numeric noul throws DecisionResponseError', () => {
  const bad = withAnswers({
    ...renamed(native.answers),
    'flags.is_urgent': { type: 'noul', noul: null as unknown as number },
  });

  expect(() => fromNativeResponse(bad, questions)).toThrow(
    DecisionResponseError,
  );
});
