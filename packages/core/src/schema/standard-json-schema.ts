/* eslint-disable @typescript-eslint/no-empty-interface */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-namespace */
import { type HashbrownType, type Infer, isHashbrownType } from './base';
import { fromJsonSchema } from './from-json-schema';

const standardSchemaCache = new WeakMap<
  object,
  { input?: HashbrownType; output?: HashbrownType }
>();

/**
 * The Standard Typed interface. This is a base type extended by other specs.
 */
export interface StandardTypedV1<Input = unknown, Output = Input> {
  /** The Standard properties. */
  readonly '~standard': StandardTypedV1.Props<Input, Output>;
}

export declare namespace StandardTypedV1 {
  /** The Standard Typed properties interface. */
  export interface Props<Input = unknown, Output = Input> {
    /** The version number of the standard. */
    readonly version: 1;
    /** The vendor name of the schema library. */
    readonly vendor: string;
    /** Inferred types associated with the schema. */
    readonly types?: Types<Input, Output> | undefined;
  }

  /** The Standard Typed types interface. */
  export interface Types<Input = unknown, Output = Input> {
    /** The input type of the schema. */
    readonly input: Input;
    /** The output type of the schema. */
    readonly output: Output;
  }

  /** Infers the input type of a Standard Typed. */
  export type InferInput<Schema extends StandardTypedV1> = NonNullable<
    Schema['~standard']['types']
  >['input'];

  /** Infers the output type of a Standard Typed. */
  export type InferOutput<Schema extends StandardTypedV1> = NonNullable<
    Schema['~standard']['types']
  >['output'];
}

/**
 * The Standard JSON Schema interface.
 */
export interface StandardJSONSchemaV1<Input = unknown, Output = Input> {
  /** The Standard JSON Schema properties. */
  readonly '~standard': StandardJSONSchemaV1.Props<Input, Output>;
}

export declare namespace StandardJSONSchemaV1 {
  /** The Standard JSON Schema properties interface. */
  export interface Props<Input = unknown, Output = Input>
    extends StandardTypedV1.Props<Input, Output> {
    /** Methods for generating the input/output JSON Schema. */
    readonly jsonSchema: StandardJSONSchemaV1.Converter;
  }

  /** The Standard JSON Schema converter interface. */
  export interface Converter {
    /** Converts the input type to JSON Schema. May throw if conversion is not supported. */
    readonly input: (
      options: StandardJSONSchemaV1.Options,
    ) => Record<string, unknown>;
    /** Converts the output type to JSON Schema. May throw if conversion is not supported. */
    readonly output: (
      options: StandardJSONSchemaV1.Options,
    ) => Record<string, unknown>;
  }

  /**
   * The target version of the generated JSON Schema.
   *
   * It is *strongly recommended* that implementers support `"draft-2020-12"` and `"draft-07"`, as they are both in wide use. All other targets can be implemented on a best-effort basis. Libraries should throw if they don't support a specified target.
   *
   * The `"openapi-3.0"` target is intended as a standardized specifier for OpenAPI 3.0 which is a superset of JSON Schema `"draft-04"`.
   */
  export type Target =
    | 'draft-2020-12'
    | 'draft-07'
    | 'openapi-3.0'
    // Accepts any string: allows future targets while preserving autocomplete
    | ({} & string);

  /** The options for the input/output methods. */
  export interface Options {
    /** Specifies the target version of the generated JSON Schema. Support for all versions is on a best-effort basis. If a given version is not supported, the library should throw. */
    readonly target: Target;

    /** Explicit support for additional vendor-specific parameters, if needed. */
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }

  /** The Standard types interface. */
  export interface Types<Input = unknown, Output = Input>
    extends StandardTypedV1.Types<Input, Output> {}

  /** Infers the input type of a Standard. */
  export type InferInput<Schema extends StandardTypedV1> =
    StandardTypedV1.InferInput<Schema>;

  /** Infers the output type of a Standard. */
  export type InferOutput<Schema extends StandardTypedV1> =
    StandardTypedV1.InferOutput<Schema>;
}

/**
 * Schema inputs accepted by Hashbrown APIs that take input schemas (tools,
 * component props, etc.).
 *
 * @public
 */
export type SchemaInput = HashbrownType | StandardJSONSchemaV1 | object;

/**
 * Schema inputs accepted by Hashbrown APIs that produce structured outputs.
 *
 * @public
 */
export type SchemaOutput = HashbrownType | StandardJSONSchemaV1;

/**
 * Infers the input type for a schema-like value.
 *
 * @public
 */
export type InferSchemaInput<Schema> = Schema extends HashbrownType
  ? Infer<Schema>
  : Schema extends StandardJSONSchemaV1
    ? StandardJSONSchemaV1.InferInput<Schema>
    : unknown;

/**
 * Infers the output type for a schema-like value.
 *
 * @public
 */
export type InferSchemaOutput<Schema> = Schema extends HashbrownType
  ? Infer<Schema>
  : Schema extends StandardJSONSchemaV1
    ? StandardJSONSchemaV1.InferOutput<Schema>
    : unknown;

/**
 * Checks whether a value is a Standard JSON Schema object.
 *
 * @param schema - The value to inspect.
 * @returns True when the value is a Standard JSON Schema object.
 * @throws If a `~standard` property exists but is missing `jsonSchema` or its
 * required `input`/`output` methods.
 * @public
 */
export function isStandardJsonSchema(
  schema: unknown,
): schema is StandardJSONSchemaV1 {
  return readStandardJsonSchemaProps(schema) !== undefined;
}

/**
 * Converts a Standard JSON Schema object into a Skillet schema.
 *
 * @typeParam Schema - The Standard JSON Schema type.
 * @param schema - The Standard JSON Schema object to convert.
 * @param options - Conversion options.
 * @returns A Skillet schema derived from the Standard JSON Schema.
 * @throws If the Standard JSON Schema object is malformed or if conversion
 * fails.
 * @public
 */
export function fromStandardJsonSchema<Schema extends StandardJSONSchemaV1>(
  schema: Schema,
  options: { mode: 'input' },
): HashbrownType<StandardJSONSchemaV1.InferInput<Schema>>;
/**
 * Converts a Standard JSON Schema object into a Skillet schema.
 *
 * @typeParam Schema - The Standard JSON Schema type.
 * @param schema - The Standard JSON Schema object to convert.
 * @param options - Conversion options.
 * @returns A Skillet schema derived from the Standard JSON Schema.
 * @throws If the Standard JSON Schema object is malformed or if conversion
 * fails.
 * @public
 */
export function fromStandardJsonSchema<Schema extends StandardJSONSchemaV1>(
  schema: Schema,
  options: { mode: 'output' },
): HashbrownType<StandardJSONSchemaV1.InferOutput<Schema>>;
export function fromStandardJsonSchema(
  schema: StandardJSONSchemaV1,
  options: { mode: 'input' | 'output' },
): HashbrownType {
  if (schema && (typeof schema === 'object' || typeof schema === 'function')) {
    const cached = standardSchemaCache.get(schema as object);
    if (options.mode === 'input' && cached?.input) {
      return cached.input;
    }
    if (options.mode === 'output' && cached?.output) {
      return cached.output;
    }
  }

  const props = readStandardJsonSchemaProps(schema);
  if (!props) {
    throw new Error('Expected a Standard JSON Schema object.');
  }

  const converter = props.jsonSchema;
  const jsonSchema =
    options.mode === 'input'
      ? converter.input({ target: 'draft-07' })
      : converter.output({ target: 'draft-07' });

  if (
    !jsonSchema ||
    typeof jsonSchema !== 'object' ||
    Array.isArray(jsonSchema)
  ) {
    throw new Error('Standard JSON Schema converter returned a non-object.');
  }

  const parsed = fromJsonSchema(jsonSchema);
  if (schema && (typeof schema === 'object' || typeof schema === 'function')) {
    const entry = standardSchemaCache.get(schema as object) ?? {};
    if (options.mode === 'input') {
      entry.input = parsed;
    } else {
      entry.output = parsed;
    }
    standardSchemaCache.set(schema as object, entry);
  }
  return parsed;
}

/**
 * Normalizes an input schema into a Skillet schema when possible.
 *
 * @param schema - The schema to normalize.
 * @returns A Skillet schema for Skillet or Standard JSON Schema inputs, or the
 * original raw JSON Schema object.
 * @throws If the schema advertises `~standard` metadata but is missing required
 * Standard JSON Schema fields.
 * @public
 */
export function normalizeSchemaInput(
  schema: SchemaInput,
): HashbrownType | object {
  if (isHashbrownType(schema)) {
    return schema;
  }

  if (hasStandardMetadata(schema)) {
    try {
      return fromStandardJsonSchema(schema as StandardJSONSchemaV1, {
        mode: 'input',
      });
    } catch (error) {
      throw createStandardSchemaError('input', schema, error);
    }
  }

  return schema;
}

/**
 * Normalizes an output schema into a Skillet schema.
 *
 * @param schema - The schema to normalize.
 * @returns A Skillet schema derived from the input.
 * @throws If the schema is not a Skillet schema or a valid Standard JSON Schema
 * object.
 * @public
 */
export function normalizeSchemaOutput(schema: SchemaOutput): HashbrownType {
  if (isHashbrownType(schema)) {
    return schema;
  }

  if (hasStandardMetadata(schema)) {
    try {
      return fromStandardJsonSchema(schema, { mode: 'output' });
    } catch (error) {
      throw createStandardSchemaError('output', schema, error);
    }
  }

  throw new Error(
    'Response schema must be a Skillet schema or Standard JSON Schema.',
  );
}

function readStandardJsonSchemaProps(
  schema: unknown,
): StandardJSONSchemaV1.Props | undefined {
  if (!schema || (typeof schema !== 'object' && typeof schema !== 'function')) {
    return undefined;
  }

  if (!('~standard' in schema)) {
    return undefined;
  }

  const standard = (schema as StandardJSONSchemaV1)['~standard'] as
    | StandardJSONSchemaV1.Props
    | undefined;

  if (!standard || typeof standard !== 'object') {
    throw new Error('Standard schema "~standard" property must be an object.');
  }

  const jsonSchema = (standard as StandardJSONSchemaV1.Props).jsonSchema as
    | StandardJSONSchemaV1.Converter
    | undefined;

  if (!jsonSchema || typeof jsonSchema !== 'object') {
    throw new Error('Standard schema "~standard.jsonSchema" is required.');
  }

  if (typeof jsonSchema.input !== 'function') {
    throw new Error(
      'Standard schema "~standard.jsonSchema.input" must be a function.',
    );
  }

  if (typeof jsonSchema.output !== 'function') {
    throw new Error(
      'Standard schema "~standard.jsonSchema.output" must be a function.',
    );
  }

  return standard;
}

function hasStandardMetadata(schema: unknown): boolean {
  if (!schema || (typeof schema !== 'object' && typeof schema !== 'function')) {
    return false;
  }

  return '~standard' in schema;
}

function getStandardVendor(schema: unknown): string | undefined {
  if (!schema || (typeof schema !== 'object' && typeof schema !== 'function')) {
    return undefined;
  }

  if (!('~standard' in schema)) {
    return undefined;
  }

  const standard = (schema as StandardJSONSchemaV1)['~standard'] as
    | StandardJSONSchemaV1.Props
    | undefined;

  const vendor =
    standard && typeof standard === 'object' ? standard.vendor : undefined;
  return typeof vendor === 'string' && vendor.length > 0 ? vendor : undefined;
}

function createStandardSchemaError(
  mode: 'input' | 'output',
  schema: unknown,
  error: unknown,
): Error {
  const vendor = getStandardVendor(schema);
  const suffix = vendor ? ` (vendor: ${vendor})` : '';
  const message = error instanceof Error ? error.message : String(error);
  const hint = getStandardSchemaHint(vendor, message);
  const hintSuffix = hint ? ` ${hint}` : '';
  return new Error(
    `Failed to normalize Standard JSON Schema (${mode})${suffix}: ${message}${hintSuffix}`,
  );
}

function getStandardSchemaHint(
  vendor: string | undefined,
  message: string,
): string | undefined {
  if (!message.includes('"additionalProperties" must be false')) {
    return undefined;
  }

  if (vendor === 'zod') {
    return 'For Zod, call .strict() on the object schema to set "additionalProperties: false".';
  }

  if (vendor === 'arktype') {
    return 'For ArkType, set "+": "reject" on object schemas to enforce "additionalProperties: false".';
  }

  return 'Ensure object schemas specify "additionalProperties: false", or use a Skillet schema.';
}
