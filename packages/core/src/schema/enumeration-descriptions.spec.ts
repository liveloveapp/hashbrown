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

test('enumeration with descriptions emits a plain enum with a described list', () => {
  const schema = s.enumeration('Kind', { jet: 'Jets', rotor: 'Helicopters' });

  const json = schema.toJsonSchema();

  expect(json).toEqual({
    type: 'string',
    enum: ['jet', 'rotor'],
    description: 'Kind\n\n- jet: Jets\n- rotor: Helicopters',
  });
});

test('enumeration stores entry descriptions and ordered entries on the definition', () => {
  const record = { jet: 'Jets', rotor: 'Helicopters' };

  const schema = s.enumeration('Kind', record);

  const definition = (schema as any)['~schema'].definition;
  expect(definition.entryDescriptions).toEqual(record);
  expect(definition.entries).toEqual(['jet', 'rotor']);
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

test('fromJsonSchema of a described enumeration is lossy: array form with combined description', () => {
  const emitted = s
    .enumeration('Kind', { jet: 'Jets', rotor: 'Helicopters' })
    .toJsonSchema();

  const parsed = fromJsonSchema(emitted);

  expect(parsed.toJsonSchema()).toEqual(emitted);
  expect(
    (parsed as any)['~schema'].definition.entryDescriptions,
  ).toBeUndefined();
});
