import {
  anyOf,
  array,
  boolean,
  enumeration,
  type HashbrownType,
  integer,
  LiteralType,
  nullish,
  number,
  object,
  string,
  type StringFormat,
} from './base';

type JsonSchema = Record<string, unknown> & {
  type?: string;
  anyOf?: unknown[];
  const?: unknown;
  enum?: unknown[];
  pattern?: unknown;
  format?: unknown;
  multipleOf?: unknown;
  maximum?: unknown;
  exclusiveMaximum?: unknown;
  minimum?: unknown;
  exclusiveMinimum?: unknown;
  properties?: Record<string, unknown> | undefined;
  required?: unknown;
  additionalProperties?: unknown;
  items?: unknown;
  minItems?: unknown;
  maxItems?: unknown;
  description?: unknown;
};

const ALLOWED_STRING_FORMATS = new Set<StringFormat>([
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'ipv4',
  'ipv6',
  'uuid',
]);

const BASE_ALLOWED_KEYS = new Set<string>(['$schema', '$id', 'description']);
const FORBIDDEN_KEYS = new Set<string>([
  'oneOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',
  'discriminator',
  'patternProperties',
  'propertyNames',
  'unevaluatedProperties',
  'unevaluatedItems',
  'prefixItems',
  'contains',
  'contentEncoding',
  'contentMediaType',
  'contentSchema',
  'minLength',
  'maxLength',
  'title',
  'default',
  'examples',
  'deprecated',
  '$comment',
  'readOnly',
  'writeOnly',
  'nullable',
]);

/**
 * Converts a draft-07 JSON Schema into a Skillet schema.
 *
 * @param schema - The JSON Schema to convert.
 * @returns A Skillet schema derived from the JSON Schema.
 * @throws If the JSON Schema uses unsupported keywords or shapes.
 * @internal
 */
export function fromJsonSchema(schema: Record<string, unknown>): HashbrownType {
  return parseSchema(schema, []);
}

function parseSchema(
  schema: Record<string, unknown>,
  path: string[],
): HashbrownType {
  assertIsObjectSchema(schema, path);
  assertNoForbiddenKeywords(schema, path);

  if ('anyOf' in schema) {
    return parseAnyOf(schema as JsonSchema, path);
  }

  if ('const' in schema) {
    return parseConst(schema as JsonSchema, path);
  }

  if ('enum' in schema) {
    return parseEnum(schema as JsonSchema, path);
  }

  const typeValue = (schema as JsonSchema).type;
  if (typeof typeValue !== 'string') {
    throw new Error(`Unsupported JSON Schema type at ${formatPath(path)}.`);
  }

  switch (typeValue) {
    case 'string':
      return parseString(schema as JsonSchema, path);
    case 'number':
      return parseNumber(schema as JsonSchema, path, 'number');
    case 'integer':
      return parseNumber(schema as JsonSchema, path, 'integer');
    case 'boolean':
      return parseBoolean(schema as JsonSchema, path);
    case 'null':
      return parseNull(schema as JsonSchema, path);
    case 'object':
      return parseObject(schema as JsonSchema, path);
    case 'array':
      return parseArray(schema as JsonSchema, path);
    default:
      throw new Error(
        `Unsupported JSON Schema type "${typeValue}" at ${formatPath(path)}.`,
      );
  }
}

function parseAnyOf(schema: JsonSchema, path: string[]): HashbrownType {
  assertAllowedKeys(
    schema as Record<string, unknown>,
    new Set([...BASE_ALLOWED_KEYS, 'anyOf']),
    path,
  );

  const options = schema.anyOf;
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error(
      `"anyOf" must be a non-empty array at ${formatPath(path)}.`,
    );
  }

  const schemas = options.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(
        `"anyOf" entries must be objects at ${formatPath([...path, `anyOf[${index}]`])}.`,
      );
    }
    return parseSchema(entry as Record<string, unknown>, [
      ...path,
      `anyOf[${index}]`,
    ]);
  });

  return anyOf(schemas);
}

function parseConst(schema: JsonSchema, path: string[]): HashbrownType {
  assertAllowedKeys(
    schema as Record<string, unknown>,
    new Set([...BASE_ALLOWED_KEYS, 'const', 'type']),
    path,
  );

  const value = schema.const;
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    throw new Error(
      `"const" must be a string, number, or boolean at ${formatPath(path)}.`,
    );
  }

  const typeValue = schema.type;
  if (typeof typeValue === 'string') {
    const matchesNumber =
      typeof value === 'number' &&
      (typeValue === 'number' || typeValue === 'integer');
    if (!matchesNumber && typeValue !== typeof value) {
      throw new Error(`"const" type mismatch at ${formatPath(path)}.`);
    }
    if (
      typeValue === 'integer' &&
      typeof value === 'number' &&
      !Number.isInteger(value)
    ) {
      throw new Error(`"const" must be an integer at ${formatPath(path)}.`);
    }
  }

  return createLiteral(value);
}

function parseEnum(schema: JsonSchema, path: string[]): HashbrownType {
  assertAllowedKeys(
    schema as Record<string, unknown>,
    new Set([...BASE_ALLOWED_KEYS, 'enum', 'type']),
    path,
  );

  const entries = schema.enum;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`"enum" must be a non-empty array at ${formatPath(path)}.`);
  }

  const allString = entries.every((entry) => typeof entry === 'string');
  if (allString) {
    if (schema.type && schema.type !== 'string') {
      throw new Error(`"enum" type must be "string" at ${formatPath(path)}.`);
    }
    return enumeration(getDescription(schema, 'Enum'), entries as string[]);
  }

  const allLiteral = entries.every(
    (entry) =>
      typeof entry === 'string' ||
      typeof entry === 'number' ||
      typeof entry === 'boolean',
  );

  if (!allLiteral) {
    throw new Error(
      `"enum" values must be string, number, or boolean at ${formatPath(path)}.`,
    );
  }

  if (
    schema.type &&
    schema.type !== 'number' &&
    schema.type !== 'integer' &&
    schema.type !== 'boolean'
  ) {
    throw new Error(`"enum" type is not supported at ${formatPath(path)}.`);
  }

  if (schema.type === 'integer') {
    const allIntegers = entries.every(
      (entry) => typeof entry === 'number' && Number.isInteger(entry),
    );
    if (!allIntegers) {
      throw new Error(`"enum" values must be integers at ${formatPath(path)}.`);
    }
  }

  return anyOf(
    entries.map((entry) => createLiteral(entry as string | number | boolean)),
  );
}

function parseString(schema: JsonSchema, path: string[]): HashbrownType {
  assertAllowedKeys(
    schema as Record<string, unknown>,
    new Set([...BASE_ALLOWED_KEYS, 'type', 'pattern', 'format']),
    path,
  );

  const pattern = schema.pattern;
  if (pattern !== undefined && typeof pattern !== 'string') {
    throw new Error(`"pattern" must be a string at ${formatPath(path)}.`);
  }

  const format = schema.format;
  if (format !== undefined) {
    if (
      typeof format !== 'string' ||
      !ALLOWED_STRING_FORMATS.has(format as StringFormat)
    ) {
      throw new Error(
        `Unsupported string format "${String(format)}" at ${formatPath(path)}.`,
      );
    }
  }

  return string(getDescription(schema, 'String'), {
    pattern: pattern ?? undefined,
    format: format as StringFormat | undefined,
  });
}

function parseNumber(
  schema: JsonSchema,
  path: string[],
  kind: 'number' | 'integer',
): HashbrownType {
  assertAllowedKeys(
    schema as Record<string, unknown>,
    new Set([
      ...BASE_ALLOWED_KEYS,
      'type',
      'multipleOf',
      'maximum',
      'exclusiveMaximum',
      'minimum',
      'exclusiveMinimum',
    ]),
    path,
  );

  const constraints = {
    multipleOf: parseNumberConstraint(schema.multipleOf, 'multipleOf', path),
    maximum: parseNumberConstraint(schema.maximum, 'maximum', path),
    exclusiveMaximum: parseNumberConstraint(
      schema.exclusiveMaximum,
      'exclusiveMaximum',
      path,
    ),
    minimum: parseNumberConstraint(schema.minimum, 'minimum', path),
    exclusiveMinimum: parseNumberConstraint(
      schema.exclusiveMinimum,
      'exclusiveMinimum',
      path,
    ),
  };

  if (kind === 'integer') {
    return integer(getDescription(schema, 'Integer'), constraints);
  }

  return number(getDescription(schema, 'Number'), constraints);
}

function parseBoolean(schema: JsonSchema, path: string[]): HashbrownType {
  assertAllowedKeys(
    schema as Record<string, unknown>,
    new Set([...BASE_ALLOWED_KEYS, 'type']),
    path,
  );
  return boolean(getDescription(schema, 'Boolean'));
}

function parseNull(schema: JsonSchema, path: string[]): HashbrownType {
  assertAllowedKeys(
    schema as Record<string, unknown>,
    new Set([...BASE_ALLOWED_KEYS, 'type']),
    path,
  );
  return nullish();
}

function parseObject(schema: JsonSchema, path: string[]): HashbrownType {
  assertAllowedKeys(
    schema as Record<string, unknown>,
    new Set([
      ...BASE_ALLOWED_KEYS,
      'type',
      'properties',
      'required',
      'additionalProperties',
    ]),
    path,
  );

  if (schema.additionalProperties !== false) {
    throw new Error(
      `"additionalProperties" must be false at ${formatPath(path)}.`,
    );
  }

  if (
    !schema.properties ||
    typeof schema.properties !== 'object' ||
    Array.isArray(schema.properties)
  ) {
    throw new Error(`"properties" must be an object at ${formatPath(path)}.`);
  }

  if (!Array.isArray(schema.required)) {
    throw new Error(`"required" must be an array at ${formatPath(path)}.`);
  }

  const keys = Object.keys(schema.properties);
  const requiredSet = new Set(schema.required);

  if (schema.required.length !== keys.length) {
    throw new Error(
      `All object properties must be required at ${formatPath(path)}.`,
    );
  }

  for (const key of keys) {
    if (!requiredSet.has(key)) {
      throw new Error(
        `Missing required property "${key}" at ${formatPath(path)}.`,
      );
    }
  }

  for (const required of schema.required) {
    if (!Object.prototype.hasOwnProperty.call(schema.properties, required)) {
      throw new Error(
        `Required property "${required}" is not defined at ${formatPath(path)}.`,
      );
    }
  }

  const shape: Record<string, HashbrownType> = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(
        `Property "${key}" schema must be an object at ${formatPath(path)}.`,
      );
    }
    shape[key] = parseSchema(value as Record<string, unknown>, [...path, key]);
  }

  return object(getDescription(schema, 'Object'), shape);
}

function parseArray(schema: JsonSchema, path: string[]): HashbrownType {
  assertAllowedKeys(
    schema as Record<string, unknown>,
    new Set([...BASE_ALLOWED_KEYS, 'type', 'items', 'minItems', 'maxItems']),
    path,
  );

  const items = schema.items;
  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    throw new Error(`"items" must be a schema object at ${formatPath(path)}.`);
  }

  const minItems = parseArrayCountConstraint(schema.minItems, 'minItems', path);
  const maxItems = parseArrayCountConstraint(schema.maxItems, 'maxItems', path);
  if (minItems !== undefined && maxItems !== undefined && minItems > maxItems) {
    throw new Error(
      `"minItems" cannot exceed "maxItems" at ${formatPath(path)}.`,
    );
  }

  const element = parseSchema(items as Record<string, unknown>, [
    ...path,
    'items',
  ]);
  return array(getDescription(schema, 'Array'), element, {
    minItems: minItems ?? undefined,
    maxItems: maxItems ?? undefined,
  });
}

function parseNumberConstraint(
  value: unknown,
  name: string,
  path: string[],
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`"${name}" must be a number at ${formatPath(path)}.`);
  }

  return value;
}

function parseArrayCountConstraint(
  value: unknown,
  name: string,
  path: string[],
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== 'number' ||
    Number.isNaN(value) ||
    !Number.isInteger(value)
  ) {
    throw new Error(`"${name}" must be an integer at ${formatPath(path)}.`);
  }

  if (value < 0) {
    throw new Error(`"${name}" must be non-negative at ${formatPath(path)}.`);
  }

  return value;
}

function assertIsObjectSchema(schema: Record<string, unknown>, path: string[]) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error(`Expected a JSON Schema object at ${formatPath(path)}.`);
  }
}

function assertNoForbiddenKeywords(
  schema: Record<string, unknown>,
  path: string[],
) {
  for (const key of Object.keys(schema)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(
        `Unsupported JSON Schema keyword "${key}" at ${formatPath(path)}.`,
      );
    }
  }
}

function assertAllowedKeys(
  schema: Record<string, unknown>,
  allowed: Set<string>,
  path: string[],
) {
  for (const key of Object.keys(schema)) {
    if (!allowed.has(key)) {
      throw new Error(
        `Unsupported JSON Schema keyword "${key}" at ${formatPath(path)}.`,
      );
    }
  }
}

function getDescription(schema: JsonSchema, fallback: string): string {
  if (
    typeof schema.description === 'string' &&
    schema.description.trim().length > 0
  ) {
    return schema.description;
  }

  return fallback;
}

function formatPath(path: string[]): string {
  return path.length === 0 ? 'schema root' : path.join('.');
}

function createLiteral(value: string | number | boolean): HashbrownType {
  return new LiteralType({
    type: 'literal',
    description: `${value}`,
    value,
    streaming: false,
  }) as HashbrownType;
}
