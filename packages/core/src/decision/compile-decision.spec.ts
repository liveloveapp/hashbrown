/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '../schema';
import { compileDecision } from './compile-decision';
import { DecisionSchemaError } from './errors';

function catchError(fn: () => unknown): DecisionSchemaError {
  try {
    fn();
  } catch (error) {
    return error as DecisionSchemaError;
  }
  throw new Error('expected to throw');
}

test('compiles an enumeration to a choice with entry descriptions', () => {
  const schema = s.object('Decision', {
    intent: s.enumeration('What the user wants', ['filter', 'chat']),
  });

  const questions = compileDecision(schema);

  expect(questions).toEqual({
    intent: {
      type: 'choice',
      instructions: 'What the user wants',
      options: { filter: null, chat: null },
    },
  });
});

test('compiles record-form entries with their descriptions', () => {
  const schema = s.object('Decision', {
    intent: s.enumeration('What the user wants', {
      filter: 'Filter the map',
      chat: 'Just chat',
    }),
  });

  const questions = compileDecision(schema);

  expect(questions['intent']).toEqual({
    type: 'choice',
    instructions: 'What the user wants',
    options: { filter: 'Filter the map', chat: 'Just chat' },
  });
});

test('compiles a boolean to yesNo', () => {
  const schema = s.object('Decision', { ok: s.boolean('Is it ok') });

  const questions = compileDecision(schema);

  expect(questions).toEqual({
    ok: { type: 'yesNo', instructions: 'Is it ok' },
  });
});

test('compiles a bounded integer to a score with generated levels', () => {
  const schema = s.object('Decision', {
    urgency: s.integer('Urgency', { minimum: 0, maximum: 4 }),
  });

  const questions = compileDecision(schema);

  expect(questions['urgency']).toEqual({
    type: 'score',
    instructions: 'Urgency',
    levels: {
      '0': '0 of 0 to 4',
      '1': '1 of 0 to 4',
      '2': '2 of 0 to 4',
      '3': '3 of 0 to 4',
      '4': '4 of 0 to 4',
    },
  });
});

test('compiles a number with multipleOf to levels', () => {
  const schema = s.object('Decision', {
    weight: s.number('Weight', { minimum: 0, maximum: 1, multipleOf: 0.25 }),
  });

  const questions = compileDecision(schema);

  expect(questions['weight']).toEqual({
    type: 'score',
    instructions: 'Weight',
    levels: {
      '0': '0 of 0 to 1',
      '0.25': '0.25 of 0 to 1',
      '0.5': '0.5 of 0 to 1',
      '0.75': '0.75 of 0 to 1',
      '1': '1 of 0 to 1',
    },
  });
});

test('avoids floating-point drift in level keys', () => {
  const schema = s.object('Decision', {
    weight: s.number('Weight', { minimum: 0, maximum: 0.3, multipleOf: 0.1 }),
  });

  const questions = compileDecision(schema);

  expect(Object.keys((questions['weight'] as any).levels)).toEqual([
    '0',
    '0.1',
    '0.2',
    '0.3',
  ]);
});

test('flattens nested objects to dotted ids', () => {
  const schema = s.object('Decision', {
    filter: s.object('Filter', {
      altitude: s.enumeration('Altitude', ['low', 'high']),
    }),
  });

  const questions = compileDecision(schema);

  expect(Object.keys(questions)).toEqual(['filter.altitude']);
});

test('throws for an unbounded score with the field path', () => {
  const schema = s.object('Decision', {
    a: s.object('A', { b: s.integer('B', { minimum: 0 }) }),
  });

  const error = catchError(() => compileDecision(schema as any));

  expect(error).toBeInstanceOf(DecisionSchemaError);
  expect(error.path).toBe('a.b');
});

test('throws for too many score levels', () => {
  const schema = s.object('Decision', {
    n: s.integer('N', { minimum: 0, maximum: 10 }),
  });

  const error = catchError(() => compileDecision(schema));

  expect(error).toBeInstanceOf(DecisionSchemaError);
  expect(error.path).toBe('n');
});

test('throws for exclusive bounds', () => {
  const schema = s.object('Decision', {
    n: s.integer('N', { exclusiveMinimum: 0, maximum: 4 }),
  });

  const error = catchError(() => compileDecision(schema));

  expect(error.path).toBe('n');
});

test('throws for a number without multipleOf', () => {
  const schema = s.object('Decision', {
    n: s.number('N', { minimum: 0, maximum: 1 }),
  });

  const error = catchError(() => compileDecision(schema));

  expect(error.path).toBe('n');
});

test('throws for more than 255 options', () => {
  const entries = Array.from({ length: 256 }, (_, i) => `o${i}`);
  const schema = s.object('Decision', {
    pick: s.enumeration('Pick', entries),
  });

  const error = catchError(() => compileDecision(schema));

  expect(error).toBeInstanceOf(DecisionSchemaError);
  expect(error.path).toBe('pick');
});

test('throws when a property name contains a dot', () => {
  const schema = s.object('Decision', { 'a.b': s.boolean('Flag') });

  const error = catchError(() => compileDecision(schema));

  expect(error).toBeInstanceOf(DecisionSchemaError);
  expect(error.path).toBe('a.b');
});

test('throws when the root schema is not an object', () => {
  const schema = s.boolean('Flag');

  const error = catchError(() => compileDecision(schema as any));

  expect(error).toBeInstanceOf(DecisionSchemaError);
  expect(error.path).toBe('');
});

test('shuffled option order is deterministic with an injected random and keeps all options', () => {
  const schema = s.object('Decision', {
    pick: s.enumeration('Pick', ['a', 'b', 'c', 'd']),
  });
  const seeded = () => {
    let i = 0;
    const values = [0.1, 0.9, 0.4];
    return () => values[i++ % values.length];
  };

  const first = compileDecision(schema, {
    optionOrder: 'shuffled',
    random: seeded(),
  });
  const second = compileDecision(schema, {
    optionOrder: 'shuffled',
    random: seeded(),
  });

  const keys = Object.keys((first['pick'] as any).options);
  expect(keys).toEqual(Object.keys((second['pick'] as any).options));
  expect([...keys].sort()).toEqual(['a', 'b', 'c', 'd']);
});
