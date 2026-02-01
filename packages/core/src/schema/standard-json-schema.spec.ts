import { z } from 'zod-v4';
import { type } from 'arktype';
import { s } from '../schema';

const standardSchema = {
  '~standard': {
    version: 1,
    vendor: 'test',
    types: {
      input: '' as string,
      output: 0 as number,
    },
    jsonSchema: {
      input: () => ({ type: 'string', pattern: '^a' }),
      output: () => ({ type: 'number', minimum: 1 }),
    },
  },
} as const satisfies s.StandardJSONSchemaV1<string, number>;

test('fromStandardJsonSchema uses input/output converters', () => {
  const inputSchema = s.fromStandardJsonSchema(standardSchema, {
    mode: 'input',
  });
  expect(s.isHashbrownType(inputSchema)).toBe(true);
  expect(() => inputSchema.validate('abc')).not.toThrow();
  expect(() => inputSchema.validate('xbc')).toThrow();
  expect(() => inputSchema.validate(2 as unknown)).toThrow();

  const outputSchema = s.fromStandardJsonSchema(standardSchema, {
    mode: 'output',
  });
  expect(() => outputSchema.validate(2)).not.toThrow();
  expect(() => outputSchema.validate('2' as unknown)).toThrow();
});

test('fromStandardJsonSchema integrates with Zod Standard JSON Schema', () => {
  const zodSchema = z.object({ city: z.string() }).strict();

  const schema = s.fromStandardJsonSchema(zodSchema, { mode: 'input' });

  expect(() => schema.validate({ city: 'LA' })).not.toThrow();
  expect(() => schema.validate({})).toThrow();
});

test('fromStandardJsonSchema adds a Zod strictness hint for additionalProperties', () => {
  const zodSchema = z.object({ city: z.string() });

  let error: unknown;
  try {
    s.normalizeSchemaInput(zodSchema);
  } catch (err) {
    error = err;
  }

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toMatch(/additionalProperties/i);
  expect((error as Error).message).toMatch(/strict/i);
});

test('fromStandardJsonSchema integrates with ArkType Standard JSON Schema', async () => {
  const arktypeSchema = type({ '+': 'reject', active: 'boolean' });

  const schema = s.fromStandardJsonSchema(arktypeSchema, { mode: 'input' });

  expect(() => schema.validate({ active: true })).not.toThrow();
  expect(() => schema.validate({})).toThrow();
});

test('fromStandardJsonSchema adds an ArkType strictness hint for additionalProperties', () => {
  const arktypeSchema = type({ active: 'boolean' });

  let error: unknown;
  try {
    s.normalizeSchemaInput(arktypeSchema);
  } catch (err) {
    error = err;
  }

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toMatch(/additionalProperties/i);
  expect((error as Error).message).toMatch(/\+"?:\s*"?reject/i);
});

test('fromStandardJsonSchema throws when ~standard.jsonSchema is missing', () => {
  const invalid = {
    '~standard': {
      version: 1,
      vendor: 'test',
    },
  } as unknown as s.StandardJSONSchemaV1;

  expect(() => s.fromStandardJsonSchema(invalid, { mode: 'input' })).toThrow(
    /jsonSchema/i,
  );
});

test('fromStandardJsonSchema rejects unsupported keywords', () => {
  const invalid = {
    '~standard': {
      version: 1,
      vendor: 'test',
      jsonSchema: {
        input: () => ({ oneOf: [] }),
        output: () => ({ oneOf: [] }),
      },
    },
  } as unknown as s.StandardJSONSchemaV1;

  expect(() => s.fromStandardJsonSchema(invalid, { mode: 'input' })).toThrow(
    /oneOf/i,
  );
});
