import { fromJsonSchema } from './from-json-schema';

function expectValid(schema: Record<string, unknown>, value: unknown) {
  const parsed = fromJsonSchema(schema);
  expect(() => parsed.validate(value)).not.toThrow();
  return parsed;
}

function expectInvalid(schema: Record<string, unknown>, value: unknown) {
  const parsed = fromJsonSchema(schema);
  expect(() => parsed.validate(value)).toThrow();
}

test('converts string schema with pattern and format', () => {
  const schema = {
    type: 'string',
    pattern: '^a',
    format: 'email',
  };

  expectValid(schema, 'a@b.com');
  expectInvalid(schema, 'nope');
});

test('rejects unsupported string format', () => {
  expect(() => fromJsonSchema({ type: 'string', format: 'uri' })).toThrow(
    /format/i,
  );
});

test('converts number and integer constraints', () => {
  const numberSchema = {
    type: 'number',
    minimum: 1,
    maximum: 3,
    multipleOf: 0.5,
  };

  expectValid(numberSchema, 2.5);
  expectInvalid(numberSchema, 4);

  const integerSchema = {
    type: 'integer',
    minimum: 2,
    maximum: 6,
    multipleOf: 2,
  };

  expectValid(integerSchema, 4);
  expectInvalid(integerSchema, 3);
});

test('converts boolean and null', () => {
  expectValid({ type: 'boolean' }, true);
  expectInvalid({ type: 'boolean' }, 'true');

  expectValid({ type: 'null' }, null);
  expectInvalid({ type: 'null' }, undefined);
});

test('converts const literals', () => {
  expectValid({ const: 'hi' }, 'hi');
  expectInvalid({ const: 'hi' }, 'bye');

  expectValid({ const: 42, type: 'number' }, 42);
  expectInvalid({ const: 42, type: 'number' }, 41);

  expectValid({ const: true, type: 'boolean' }, true);
  expectInvalid({ const: true, type: 'boolean' }, false);
});

test('rejects non-integer const when type is integer', () => {
  expect(() => fromJsonSchema({ const: 1.5, type: 'integer' })).toThrow(
    /const/i,
  );
});

test('converts enum string values', () => {
  const schema = { type: 'string', enum: ['a', 'b'] };
  expectValid(schema, 'a');
  expectInvalid(schema, 'c');
});

test('converts enum non-string values into literal union', () => {
  const schema = { enum: [1, 2, true] };
  expectValid(schema, 1);
  expectValid(schema, true);
  expectInvalid(schema, '1');
});

test('rejects non-integer enum values when type is integer', () => {
  expect(() => fromJsonSchema({ type: 'integer', enum: [1, 2.5] })).toThrow(
    /enum/i,
  );
});

test('converts object with required properties', () => {
  const schema = {
    type: 'object',
    properties: {
      city: { type: 'string' },
      zip: { type: 'integer' },
    },
    required: ['city', 'zip'],
    additionalProperties: false,
  };

  expectValid(schema, { city: 'LA', zip: 90001 });
  expectInvalid(schema, { city: 'LA' });
});

test('rejects optional object properties', () => {
  const schema = {
    type: 'object',
    properties: {
      city: { type: 'string' },
      zip: { type: 'integer' },
    },
    required: ['city'],
    additionalProperties: false,
  };

  expect(() => fromJsonSchema(schema)).toThrow(/required/i);
});

test('converts array schemas', () => {
  const schema = {
    type: 'array',
    items: { type: 'string' },
    minItems: 1,
    maxItems: 2,
  };

  expectValid(schema, ['a']);
  expectInvalid(schema, []);
  expectInvalid(schema, ['a', 'b', 'c']);
});

test('rejects non-integer or negative array constraints', () => {
  expect(() =>
    fromJsonSchema({ type: 'array', items: { type: 'string' }, minItems: 1.2 }),
  ).toThrow(/minItems/i);
  expect(() =>
    fromJsonSchema({ type: 'array', items: { type: 'string' }, maxItems: -1 }),
  ).toThrow(/maxItems/i);
});

test('rejects array constraints where minItems exceeds maxItems', () => {
  expect(() =>
    fromJsonSchema({
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 2,
    }),
  ).toThrow(/minItems/i);
});

test('converts anyOf schemas', () => {
  const schema = {
    anyOf: [{ type: 'string' }, { type: 'number' }],
  };

  expectValid(schema, 'ok');
  expectValid(schema, 2);
  expectInvalid(schema, false);
});

test('rejects unsupported keywords', () => {
  expect(() => fromJsonSchema({ oneOf: [] })).toThrow(/oneOf/i);
  expect(() => fromJsonSchema({ allOf: [] })).toThrow(/allOf/i);
  expect(() => fromJsonSchema({ not: {} })).toThrow(/not/i);
  expect(() => fromJsonSchema({ if: {}, then: {} })).toThrow(/if/i);
});

test('rejects tuple arrays', () => {
  expect(() => fromJsonSchema({ type: 'array', items: [] })).toThrow(/items/i);
});

test('rejects additionalProperties true', () => {
  const schema = {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: true,
  };
  expect(() => fromJsonSchema(schema)).toThrow(/additionalProperties/i);
});

test('rejects nullable keyword', () => {
  expect(() => fromJsonSchema({ type: 'string', nullable: true })).toThrow(
    /nullable/i,
  );
});

test('rejects string length constraints', () => {
  expect(() => fromJsonSchema({ type: 'string', minLength: 1 })).toThrow(
    /minLength/i,
  );
});

test('rejects missing type', () => {
  expect(() => fromJsonSchema({})).toThrow(/type/i);
});
