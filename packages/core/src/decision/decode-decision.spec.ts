import { s } from '../schema';
import { decodeDecision } from './decode-decision';
import { DecisionResponseError } from './errors';

const schema = s.object('Decision', {
  intent: s.enumeration('Intent', ['filter', 'chat']),
  filter: s.object('Filter', {
    urgent: s.boolean('Urgent'),
    rating: s.integer('Rating', { minimum: 1, maximum: 5 }),
  }),
});

const choice = { confidence: 0.9, probabilities: { filter: 0.9, chat: 0.1 } };
const yesNo = { probability: 0.8 };
const score = { confidence: 0.7, score: 3.5, probabilities: { '3': 0.7 } };

function validResponse(): Record<string, unknown> {
  return {
    kind: 'hashbrown.decision',
    version: 1,
    value: { intent: 'filter', filter: { urgent: true, rating: 3 } },
    meta: { intent: choice, 'filter.urgent': yesNo, 'filter.rating': score },
  };
}

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected to throw');
}

test('decodes a valid envelope into a typed value and nested meta', () => {
  const response = validResponse();

  const result = decodeDecision(schema, response);

  expect(result.value).toEqual({
    intent: 'filter',
    filter: { urgent: true, rating: 3 },
  });
  expect(result.meta).toEqual({
    intent: choice,
    filter: { urgent: yesNo, rating: score },
  });
});

test('rejects a non-object response', () => {
  const error = catchError(() => decodeDecision(schema, 'nope'));

  expect(error).toBeInstanceOf(DecisionResponseError);
});

test('rejects a wrong kind', () => {
  const response = { ...validResponse(), kind: 'other' };

  const error = catchError(() => decodeDecision(schema, response));

  expect(error).toBeInstanceOf(DecisionResponseError);
});

test('rejects a wrong version', () => {
  const response = { ...validResponse(), version: 2 };

  const error = catchError(() => decodeDecision(schema, response));

  expect(error).toBeInstanceOf(DecisionResponseError);
});

test('rejects an enum value outside the entries', () => {
  const response = {
    ...validResponse(),
    value: { intent: 'nope', filter: { urgent: true, rating: 3 } },
  };

  const error = catchError(() => decodeDecision(schema, response));

  expect(error).toBeInstanceOf(DecisionResponseError);
  expect((error as Error).cause).toBeDefined();
});

test('rejects a score outside its bounds', () => {
  const response = {
    ...validResponse(),
    value: { intent: 'filter', filter: { urgent: true, rating: 9 } },
  };

  const error = catchError(() => decodeDecision(schema, response));

  expect(error).toBeInstanceOf(DecisionResponseError);
});

test('rejects meta missing a question id', () => {
  const response = validResponse();
  const meta = { ...(response['meta'] as Record<string, unknown>) };
  delete meta['filter.urgent'];

  const error = catchError(() => decodeDecision(schema, { ...response, meta }));

  expect(error).toBeInstanceOf(DecisionResponseError);
});

test('rejects meta of the wrong kind', () => {
  const response = validResponse();
  const meta = { ...(response['meta'] as object), 'filter.urgent': choice };

  const error = catchError(() => decodeDecision(schema, { ...response, meta }));

  expect(error).toBeInstanceOf(DecisionResponseError);
});

test('rejects extra meta ids', () => {
  const response = validResponse();
  const meta = { ...(response['meta'] as object), extra: yesNo };

  const error = catchError(() => decodeDecision(schema, { ...response, meta }));

  expect(error).toBeInstanceOf(DecisionResponseError);
});
