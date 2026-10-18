import { s } from '../schema';
import { DecidableSchema, Decision } from './index';

function decidable<S extends DecidableSchema>(schema: S): S {
  return schema;
}

test('accepts enumeration, boolean, number and integer schemas', () => {
  const kind = decidable(s.enumeration('Kind', { jet: 'Jets', heli: 'Helis' }));
  const flag = decidable(s.boolean('Flag'));
  const score = decidable(s.number('Score'));
  const count = decidable(s.integer('Count'));

  expect(kind).toBeDefined();
  expect(flag).toBeDefined();
  expect(score).toBeDefined();
  expect(count).toBeDefined();
});

test('accepts nested objects of decidable schemas', () => {
  const schema = decidable(
    s.object('Triage', {
      intent: s.enumeration('Intent', ['a', 'b']),
      clear: s.boolean('Clear'),
      inner: s.object('Inner', { n: s.integer('N') }),
    }),
  );

  expect(schema).toBeDefined();
});

test('rejects schemas that cannot be decided', () => {
  // @ts-expect-error strings are not decidable
  decidable(s.string('Text'));
  // @ts-expect-error arrays are not decidable
  decidable(s.array('List', s.boolean('Flag')));
  // @ts-expect-error unions are not decidable
  decidable(s.anyOf([s.boolean('A'), s.number('B')]));
  // @ts-expect-error streaming strings are not decidable
  decidable(s.streaming.string('Text'));
  // @ts-expect-error objects containing strings are not decidable
  decidable(s.object('Bad', { text: s.string('Text') }));

  expect(true).toBe(true);
});

test('Decision.Meta mirrors the schema shape', () => {
  const schema = decidable(
    s.object('Triage', {
      intent: s.enumeration('Intent', ['a', 'b']),
      clear: s.boolean('Clear'),
    }),
  );

  const meta: Decision.Meta<typeof schema> = {
    intent: { confidence: 1, probabilities: {} },
    clear: { probability: 1 },
  };

  expect(schema).toBeDefined();
  expect(meta.clear.probability).toBe(1);
});
