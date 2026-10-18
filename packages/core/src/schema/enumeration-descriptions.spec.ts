import * as s from './public_api';
import { fromJsonSchema } from './from-json-schema';

test('enumeration accepts a record of entry descriptions', () => {
  const schema = s.enumeration('Kind', { jet: 'Jets', rotor: 'Helicopters' });
  type Kind = s.Infer<typeof schema>;

  const valid = () => schema.validate('jet');
  const invalid = () => schema.validate('twin');

  expect(valid).not.toThrow();
  expect(invalid).toThrow();
  // @ts-expect-error 'twin' is not a member of the entry union
  const bad: Kind = 'twin';
  expect(bad).toBe('twin');
});

test('enumeration with descriptions emits oneOf of const and description', () => {
  const schema = s.enumeration('Kind', { jet: 'Jets', rotor: 'Helicopters' });

  const json = schema.toJsonSchema();

  expect(json).toEqual({
    type: 'string',
    description: 'Kind',
    oneOf: [
      { const: 'jet', description: 'Jets' },
      { const: 'rotor', description: 'Helicopters' },
    ],
  });
});

test('array enumeration still emits enum', () => {
  const schema = s.enumeration('Kind', ['jet', 'rotor']);

  const json = schema.toJsonSchema();

  expect(json).toEqual({
    type: 'string',
    enum: ['jet', 'rotor'],
    description: 'Kind',
  });
});

test('fromJsonSchema reads oneOf const entries into an enumeration with descriptions', () => {
  const original = {
    type: 'string',
    description: 'Kind',
    oneOf: [
      { const: 'jet', description: 'Jets' },
      { const: 'rotor', description: 'Helicopters' },
    ],
  };

  const parsed = fromJsonSchema(original);

  expect(parsed.toJsonSchema()).toEqual(original);
  expect(() => parsed.validate('rotor')).not.toThrow();
  expect(() => parsed.validate('twin')).toThrow();
});
