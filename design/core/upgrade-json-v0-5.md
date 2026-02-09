# Design Doc Template

---

Created: 2026-01-30
Author: Mike Ryan
Affects: packages/core (schema + UI schema helpers)

---

# upgradeJsonToV_0_5: Backward-Compatible JSON Upgrade

## Objective

Provide a public core helper `upgradeJsonToV_0_5(inputJson, skilletSchema)` that best-effort upgrades JSON emitted by the v0.4.1 interaction into the v0.5 schema-compatible JSON shape, with no streaming parser involvement.

## Background

The v0.5 core redesign replaces the legacy schema-coupled parser with a pure streaming JSON parser and a schema-aware JSON AST resolver. The new flow is described in `design/core/json-parser.md`, `design/core/json-parser-integration.md`, and `design/core/json-ast-schema-integration.md`, which emphasize immutable parser state, strict ordered `anyOf` matching, and schema-based resolution (`s.fromJsonAst`).

Generative UI schema building has also changed: `design/core/generative-ui.md` and `design/core/ui-kit.md` define a wrapper schema with a top-level `ui` array of component nodes and a new component node shape that uses `s.node(...)` and preserves streaming metadata. The current `packages/core/src/ui/expose-component.ts` implements this shape.

In v0.4.1, schema-to-JSON Schema conversion produced special `anyOf` discriminator wrappers. For complex options (`object`, `array`, nested `anyOf`, and streaming strings), the JSON schema encouraged wrapper objects keyed either by the option index (e.g. `{ "0": ... }`) or, when every object option had a single string-literal field, by the literal value (e.g. `{ "a": { ... } }` while omitting the literal field in the payload). This logic lived in `packages/core/src/schema/to-json-schema.ts` and `packages/core/src/schema/base.ts` at tag `v0.4.1`.

UI schema shape also changed between v0.4.1 and v0.5. In v0.4.1, component nodes were `{ $tag, $props, $children }`. In v0.5, component nodes are `{ [tagName]: { props?, children? } }`, and `props` is wrapped as a `s.node(...)` payload with `{ complete, partialValue, value? }` (see `packages/core/src/ui/expose-component.ts`).

This helper exists to smooth upgrades for users who have persisted v0.4.1 model outputs or rely on stored JSON, letting them adopt the v0.5 schemas without re-generating data.

## Goals

- Accept a v0.4.1 output JSON value and a v0.5 Skillet schema, returning a JSON value that conforms to the v0.5 schema.
- Handle all known incompatibilities from v0.4.1, including `anyOf` discriminator wrappers and legacy UI schema shapes.
- Be fully recursive: apply upgrades at any depth of the JSON tree using the provided schema as the guide.
- Keep behavior deterministic and aligned with v0.5 `anyOf` order (first matching option wins).

## Non-Goals

- Streaming/partial updates or incremental parsing (finalized outputs only).
- Support for non-Skillet schemas (Standard JSON Schema inputs were not supported in v0.4.1).
- Perfect recovery for arbitrary malformed or ambiguous JSON; best-effort is sufficient.
- Changes to the streaming parser or `fromJsonAst` behavior.

## UX / Workflows

- Core maintainers or SDK integrators call:
  ```ts
  const upgraded = upgradeJsonToV_0_5(inputJson, schema);
  ```
- Output can be fed into v0.5 code paths (UI rendering, structured outputs, tool args) without rewriting or re-asking the model.

## Data Model & API Changes

### Schema

- Add a public core API:
  - `upgradeJsonToV_0_5(inputJson: JsonValue, schema: s.HashbrownType): JsonValue`
- The function is a pure transformation with no parser state; it uses schema structure and `schema.validate` to choose paths.

### Validation

- The function may call `schema.validate` and any schema option `validate` methods to select `anyOf` branches and confirm transformed output.
- It does not introduce new validation rules.

### CRUD / Endpoints

- No new endpoints.

## Core Logic / Algorithms

### High-Level Algorithm

- The function is recursive and schema-directed:
  1. If schema is `anyOf`, attempt to match the input to one option using v0.5 ordering and v0.4.1 wrapper detection.
  2. If schema is an object or array, recurse into child schemas.
  3. If schema is a UI wrapper schema or UI node schema, apply special transformation rules.
  4. Handle the legacy primitive wrapper field at the root when the schema expects a primitive or array.
  5. Otherwise, return input as-is.

### Detect and Transform v0.4.1 anyOf Wrappers

v0.4.1 emitted two wrapper styles for `anyOf` options when `needsDiscriminatorWrapperInAnyOf` was true:

1. **Index-based wrapper** (default)
   - Input: `{ "0": <payload> }`
   - Transformation: unwrap to `<payload>`, transform with `options[0]`, then validate.

2. **Literal-discriminator wrapper** (object options only)
   - When each option is an object with exactly one string-literal field, v0.4.1 emitted `{ "<literalValue>": <payloadWithoutLiteralField> }`.
   - Transformation:
     - Identify the literal-discriminator map from the schema options (same logic as v0.4.1).
     - If wrapper key matches a discriminator literal, unwrap to payload, reinsert the literal field into the object, then transform with that option schema.

AnyOf matching should proceed as follows:

- **Step 1: Wrapper detection**
  - If input is an object with a single key:
    - If key is a numeric index and within options length, unwrap and try that option.
    - Else, if key matches a discriminator literal value for a literal-discriminator map, unwrap/reinsert literal field and try that option.
- **Step 2: Direct matching**
  - If no wrapper or wrapper fails, try options in order:
    - Recursively transform input against option schema.
    - Use `option.validate` on the transformed result; first passing option wins.
- **Step 3: Fallback**
  - If no option validates, return the recursively transformed value (best-effort) and allow the caller to validate separately.

### UI Schema Upgrade (v0.4.1 → v0.5)

v0.4.1 component node shape:

```ts
{
  $tag: string;
  $props: Record<string, any>;
  $children: ComponentTree[] | string;
}
```

v0.5 component node shape:

```ts
{
  [tagName: string]: {
    props?: {
      complete: boolean;
      partialValue: JsonResolvedValue;
      value?: Record<string, JsonValue>;
    };
    children?: ComponentNode[] | string;
  };
}
```

Upgrade rules for finalized outputs:

- If the schema matches the UI wrapper (`{ ui: ComponentTree }`), emit `{ ui: <upgradedTree> }`.
- For each legacy node:
  - Use `$tag` as the key.
  - Convert `$props` to `{ props: { complete: true, partialValue: $props, value: $props } }`.
  - Convert `$children`:
    - If string, map to `children: string`.
    - If array, recursively upgrade each child node.
  - If `$children` missing, omit `children`.

The upgrade should be schema-directed: only apply UI conversion where the schema indicates the UI shape (i.e., component wrapper or component node shapes from `createComponentSchema`).

### Primitive Wrapper Unwrap (Root)

v0.4.1 wrapped root primitives/arrays when emitting JSON Schema (the `PRIMITIVE_WRAPPER_FIELD_NAME` envelope). If the schema expects a primitive or array and the input is an object containing only the wrapper field, unwrap it at the top level before continuing.

### Recursion and Shape Preservation

- Recursion is pure and immutable (no in-place mutation).
- Preserve unknown keys when schema does not define a shape (best-effort), but still recursively traverse known keys when schema is an object.

## Telemetry / Observability

- No new telemetry required.
- Optional: a debug flag in future could log transformations (out of scope).

## Backward Compatibility

- This helper is a compatibility layer for v0.4.1 output with v0.5 schemas.
- It does not alter existing parsing or schema generation behavior.
- It will be safe for users already on v0.5 because it only transforms when legacy shapes or wrappers are detected.

## Permissions / Security

- No new permissions or security considerations.
- Pure in-memory transformation of provided JSON.

## Rollout / Migration

- Add as a public core API, documented for migration from v0.4.1.
- Update migration notes to recommend running old stored outputs through this helper.

## Testing

Must-have tests (top-level `test(...)`, arrange/act/assert):

- `anyOf` wrapper conversions:
  - Index-based wrapper `{ "0": ... }` unwraps and validates.
  - Literal-discriminator wrapper `{ "a": ... }` reinserts literal field and validates.
  - Nested anyOf wrapper handling inside arrays and objects.
- UI schema conversion:
  - Single node with `$tag/$props/$children` array.
  - String children (`$children: "text"`).
  - Missing `$children` or `$props`.
  - Full wrapper `{ ui: [...] }` output.
- Primitive wrapper:
  - Root primitive wrapper unwrapped when schema expects primitive/array.
- Non-upgrade inputs:
  - Already v0.5-shaped UI nodes remain unchanged.
  - No-op when no wrapper or legacy shape is present.

## Open Questions

- Should the helper return only the upgraded JSON or also structured warnings about transformations? (Currently planned: JSON only.)
- Should failure to match any `anyOf` option throw or return best-effort transformed input? (Currently planned: best-effort transform without throw.)
