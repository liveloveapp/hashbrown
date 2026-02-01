Created: 2026-01-22
Author: Mike Ryan
Affects: core, angular, react

# Standard JSON Schema Ingestion

## Objective
Allow Hashbrown APIs to accept Standard JSON Schema objects (as defined by the standard-schema spec) and normalize them into Skillet schemas at the SDK boundary, while preserving strong typing for tools, structured outputs, and component props/inputs.

## Background
Hashbrown currently accepts Skillet schemas and, in some APIs, raw JSON Schema objects. There is growing adoption of the Standard JSON Schema spec by libraries like Zod and ArkType, enabling schema objects to carry both JSON Schema conversion and static type inference information. Hashbrown should leverage this to accept these schema objects without library-specific adapters.

## Goals
- Accept Standard JSON Schema objects wherever schemas are accepted today (tools, structured outputs, exposeComponent props/inputs).
- Convert Standard JSON Schema objects into Skillet schemas via a new helper `s.fromStandardJsonSchema(...)`.
- Preserve strong typing for input/output types from Standard JSON Schema definitions.
- Use draft-07 JSON Schema as the conversion target (current Hashbrown default).
- After normalization, use Skillet exclusively for parsing, validation, streaming, and printing.

## Non-Goals
- Removing support for raw JSON Schema objects.
- Changing existing Skillet schema authoring or validation behavior.
- Implementing additional JSON Schema drafts beyond draft-07.

## UX / Workflows
- Developers can pass Standard JSON Schema objects produced by libraries like Zod/ArkType directly into existing Hashbrown APIs.
- Hashbrown detects Standard JSON Schema objects via `~standard.jsonSchema` and immediately normalizes them into Skillet.
- Once normalized, the rest of the pipeline is Skillet-only (streaming parsing, validation, JSON Schema printing, etc.).
- Raw JSON Schema objects remain accepted as-is.

Example usage:
- Tools: pass Zod/ArkType schema object directly as `tool.schema`.
- Structured outputs: pass Zod/ArkType schema for `responseSchema`.
- `exposeComponent`: pass Standard JSON Schema for component props/inputs.

## Data Model & API Changes

### Schema
Add Standard JSON Schema type definitions in `packages/core/src/schema/standard-json-schema.ts` and re-export from `packages/core/src/schema/public_api.ts`.

Include these exact types in the codebase:

```ts
/** The Standard Typed interface. This is a base type extended by other specs. */
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

/** The Standard JSON Schema interface. */
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
      options: StandardJSONSchemaV1.Options
    ) => Record<string, unknown>;
    /** Converts the output type to JSON Schema. May throw if conversion is not supported. */
    readonly output: (
      options: StandardJSONSchemaV1.Options
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
```

### Validation
- Detect Standard JSON Schema objects by presence of `~standard` and `~standard.jsonSchema`.
- If `~standard` exists but `jsonSchema` or required methods are missing, throw a runtime error.
- If `jsonSchema.input/output` throws, surface the error.

### CRUD / Endpoints
No API endpoints changed.

## Core Logic / Algorithms
- Add `s.fromStandardJsonSchema(schema, { mode })` where `mode` determines `jsonSchema.input` vs `jsonSchema.output` usage.
  - Tools params: `input`
  - Component props/inputs: `input`
  - Structured outputs: `output`
- Convert via `schema['~standard'].jsonSchema.{input|output}({ target: 'draft-07' })`.
- Convert the resulting draft-07 JSON Schema to a Skillet schema (reuse the existing “raw JSON schema” pathway).
- After normalization, use Skillet everywhere:
  - Parsing and validation
  - Streaming JSON parsing / `resolveWithSchema`
  - JSON Schema printing
- Existing APIs accept:
  - Skillet schemas unchanged
  - Standard JSON Schema objects (normalized to Skillet)
  - Raw JSON Schema objects (pass-through)

## Telemetry / Observability
- None required beyond current error surfaces; conversion errors should bubble as runtime errors.

## Backward Compatibility
- Additive and non-breaking.
- Raw JSON schema support remains intact.

## Permissions / Security
- No new permissions.
- Ensure conversion errors do not leak sensitive data beyond existing error handling.

## Rollout / Migration
- Ship as additive change without migration.
- No deprecations planned.

## Testing
- Unit tests for `s.fromStandardJsonSchema`:
  - Zod and ArkType schema inputs.
  - `input` vs `output` path produces correct draft-07 JSON Schema.
  - Missing `jsonSchema` in `~standard` throws.
- Integration tests:
  - Tools: Standard JSON Schema input accepted, converted, and validated.
  - Structured outputs: Standard JSON Schema output accepted, converted.
  - `exposeComponent`: props/inputs accept Standard JSON Schema.
- Type tests:
  - `InferInput/InferOutput` types are preserved for Zod/ArkType.

## Open Questions
- Should we expose a public helper to detect Standard JSON Schema objects (`s.isStandardJsonSchema`) for user land?

## Supported JSON Schema Subset (Skillet Translation)
Skillet only supports a subset of draft-07. When ingesting Standard JSON Schema, normalize into the following supported surface and **throw** on anything unsupported (do not silently drop).

### Supported keywords and shapes
- **string**: `type: "string"` + `pattern` (string) + `format` (limited to `date-time`, `time`, `date`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid`)
- **number**: `type: "number"` + `multipleOf`, `maximum`, `exclusiveMaximum`, `minimum`, `exclusiveMinimum`
- **integer**: `type: "integer"` + numeric constraints above
- **boolean**: `type: "boolean"`
- **null**: `type: "null"`
- **const/literal**: `const` for **string/number/boolean only**
- **enum**: `enum` for **string values only** (`type: "string"`)
- **object**:
  - `type: "object"`
  - `properties` (all properties required)
  - `required` is **all keys**
  - `additionalProperties: false`
- **array**:
  - `type: "array"`
  - single `items` schema (no tuples)
  - `minItems`, `maxItems`
- **anyOf**: `anyOf` unions only

### Unsupported (must throw or transform)
- `oneOf`, `allOf`, `not`, `if/then/else`, `discriminator`
- optional properties (Skillet objects require all keys)
- `additionalProperties: true` / schemas; `patternProperties`; `propertyNames`; `unevaluated*`
- `minLength`, `maxLength`, `format` outside allowed list, `content*`
- tuple arrays (`items: []`, `prefixItems`)
- `nullable` (must model with `anyOf` + `null`)
- `title`, `default`, `examples`, `deprecated`, `$comment`, `readOnly`, `writeOnly`, etc.

### Translation guidance
- **Optional fields**: must be represented explicitly (e.g., lifting to `anyOf` with an object missing the field vs object with the field). If an optional property is detected in raw JSON Schema, throw unless the converter already produced a supported representation.
- **Nullable**: must be translated to `anyOf: [{...schema...}, { type: "null" }]`. If `nullable` is present, throw unless the converter already produced a supported representation.
- **Enums**: only strings; non-string enums must be rejected or rewritten as `anyOf` of `const` literals (string/number/boolean only).
