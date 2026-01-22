import * as s from './public_api';

test('string: pattern validates', () => {
  const schema = s.string('Handle', { pattern: /^@[a-z0-9_]+$/ });

  expect(() => schema.validate('@good_name')).not.toThrow();
  expect(() => schema.validate('bad-name')).toThrow();
});

test('number: numeric constraints validate', () => {
  const schema = s.number('Score', {
    minimum: 0,
    exclusiveMaximum: 10,
    multipleOf: 0.5,
  });

  expect(() => schema.validate(9.5)).not.toThrow();
  expect(() => schema.validate(10)).toThrow();
  expect(() => schema.validate(9.3)).toThrow();
});

test('integer: numeric constraints validate', () => {
  const schema = s.integer('Count', { minimum: 2, maximum: 6, multipleOf: 2 });

  expect(() => schema.validate(4)).not.toThrow();
  expect(() => schema.validate(3)).toThrow();
  expect(() => schema.validate(7)).toThrow();
});

test('array: minItems and maxItems validate', () => {
  const schema = s.array('Tags', s.string('Tag'), { minItems: 1, maxItems: 2 });

  expect(() => schema.validate([])).toThrow();
  expect(() => schema.validate(['a'])).not.toThrow();
  expect(() => schema.validate(['a', 'b', 'c'])).toThrow();
});
