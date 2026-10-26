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

test('streaming object: missing keys do not invalidate partial values', () => {
  const schema = s.streaming.object('root', {
    props: s.node(s.object('Props', {})),
  });
  const subject = () => schema.validate({});

  expect(subject).not.toThrow();
});

test('streaming object: unknown keys invalidate values', () => {
  const schema = s.streaming.object('root', {
    known: s.string('Known'),
  });
  const subject = () => schema.validate({ unknown: 'value' });

  expect(subject).toThrow();
});

test('object: rejects an empty array for an empty object schema', () => {
  const schema = s.object('Options', {});

  const act = () => schema.validate([]);

  expect(act).toThrow('Expected an object');
});

test('object: rejects a nonempty array even when numeric properties match', () => {
  const schema = s.object('Options', { '0': s.string('First') });

  const act = () => schema.validate(['x']);

  expect(act).toThrow('Expected an object');
});

test('object: rejects arrays at nested object positions', () => {
  const schema = s.object('Options', { nested: s.object('Nested', {}) });

  const act = () => schema.validate({ nested: [] });

  expect(act).toThrow('Expected an object');
});

test('array: rejects arrays at object element positions', () => {
  const schema = s.array('Rows', s.object('Row', {}));

  const act = () => schema.validate([[]]);

  expect(act).toThrow('Expected an object');
});

test('anyOf: an array cannot bypass minItems through an object branch', () => {
  const schema = s.anyOf([
    s.object('Options', {}),
    s.array('Tags', s.string('Tag'), { minItems: 1 }),
  ]);

  const act = () => schema.validate([]);

  expect(act).toThrow();
});

test('anyOf: valid objects and arrays retain their matching branch constraints', () => {
  const schema = s.anyOf([
    s.object('Options', {}),
    s.array('Tags', s.string('Tag', { pattern: '^ok' }), { minItems: 1 }),
  ]);

  const object = () => schema.validate({});
  const array = () => schema.validate(['ok']);
  const invalid = () => schema.validate(['bad']);

  expect(object).not.toThrow();
  expect(array).not.toThrow();
  expect(invalid).toThrow();
});

test('object: accepts JSON objects including a null-prototype object', () => {
  const schema = s.object('Options', {});
  const nullPrototype = Object.create(null);

  const plain = schema.validate({});
  const nullResult = schema.validate(nullPrototype);

  expect(plain).toEqual({});
  expect(nullResult).toBe(nullPrototype);
});

test('streaming object: rejects arrays while retaining partial object support', () => {
  const schema = s.streaming.object('Options', { name: s.string('Name') });

  const act = () => schema.validate([]);
  const partial = schema.validate({});

  expect(act).toThrow('Expected an object');
  expect(partial).toEqual({});
});
