---
Created: 2026-01-22
Author: Codex
Affects: packages/core/src/schema, www/analog/docs (Angular + React)
---

# Expand Skillet Schema Constraints

## Objective

Add OpenAI-supported JSON Schema constraint fields to Skillet (string, number/integer, array) with full serialization to JSON Schema and runtime validation, without breaking existing APIs.

## Background

Skillet currently mirrors a minimal JSON Schema subset for LLM compatibility. OpenAI now supports additional string, number, and array constraint keywords. We want `packages/core/src/schema` to align with these capabilities and update docs accordingly.

## Goals

- Support string constraints: `pattern`, `format`
- Support number/integer constraints: `multipleOf`, `maximum`, `exclusiveMaximum`, `minimum`, `exclusiveMinimum`
- Support array constraints: `minItems`, `maxItems`
- Serialize these constraints in JSON Schema output
- Validate these constraints in Skillet runtime validation
- Update Angular + React Skillet docs to reflect new support and remove outdated limitation notes
- Add unit tests covering serialization and validation

## Non-Goals

- Adding new JSON Schema keywords beyond the list above
- Changing schema parsing semantics beyond constraint support
- Adding new streaming behavior guarantees (constraints should not block partial streaming)
- Breaking changes to existing Skillet API surface

## UX / Workflows

No new workflows. Existing schema definitions should be able to opt into constraints through optional parameters.

## Data Model & API Changes

### Schema

Proposed constraint-bearing definitions:

- `StringTypeDefinition`: add optional `pattern?: string`, `format?: string`
- `NumberTypeDefinition` and `IntegerTypeDefinition`: add optional `multipleOf?: number`, `maximum?: number`, `exclusiveMaximum?: number`, `minimum?: number`, `exclusiveMinimum?: number`
- `ArrayTypeDefinition`: add optional `minItems?: number`, `maxItems?: number`

Proposed API shape (backward compatible):

- Add optional constraints parameter to constructors:
  - `string(description: string, constraints?: { pattern?: string | RegExp; format?: string })`
  - `number(description: string, constraints?: { multipleOf?: number; maximum?: number; exclusiveMaximum?: number; minimum?: number; exclusiveMinimum?: number })`
  - `integer(description: string, constraints?: { multipleOf?: number; maximum?: number; exclusiveMaximum?: number; minimum?: number; exclusiveMinimum?: number })`
  - `array(description: string, item: Item, constraints?: { minItems?: number; maxItems?: number })`
- Mirror in `s.streaming.*` helpers for `string`, `number`, `integer`, `array` if available (or only where defined).
- Keep existing call sites valid (constraints optional, no behavior change when omitted).

### Validation

- Extend `validateImpl` for each affected type to enforce constraints.
- For arrays: validate length against `minItems`/`maxItems`.
- For numbers/integers: check bounds and `multipleOf`, respecting exclusive vs inclusive.
- For strings: enforce `pattern` via regex.
- For `format`: do not validate client-side; leave to the LLM provider (serialize only).
- When `pattern` is provided as `RegExp`, serialize to `.source` for JSON Schema.

### CRUD / Endpoints

None.

## Core Logic / Algorithms

- `packages/core/src/schema/base.ts`
  - Extend type definitions with constraint fields.
  - Update `toJsonSchemaImpl` for string/number/integer/array to include constraints when present (string pattern/format, number bounds, array min/max).
  - Update `validateImpl` for string/number/integer/array to enforce constraints (except `format`).
- `packages/core/src/schema/streaming.ts`
  - Support passing constraints in streaming constructors to keep parity.
- `packages/core/src/schema/to-json-schema.ts`
  - No algorithm changes expected; it will consume updated `toJsonSchemaImpl` results.

## Telemetry / Observability

None.

## Backward Compatibility

- All constraints are optional and additive.
- Existing schema constructors remain valid with the same call signatures.
- No changes to required properties or existing behavior when constraints are omitted.

## Permissions / Security

No changes. Constraints are local validation only.

## Rollout / Migration

None. Ship as a normal minor/patch update.

## Testing

Unit tests only:

- `packages/core/src/schema/to-json-schema.spec.ts`
  - Add cases verifying constraints are emitted in JSON Schema for string, number/integer, array.
- Add new validation unit tests:
  - For string `pattern` validation (including `RegExp` input serialized form)
  - For number/integer bounds and `multipleOf`
  - For array `minItems`/`maxItems`
  - Consider a new spec file (e.g., `packages/core/src/schema/validation.spec.ts`) or extend existing schema tests.

## Docs Updates (www)

Update these docs to reflect new supported constraints and remove outdated limitations:

- `www/analog/src/app/pages/docs/angular/concept/schema.md`
  - Update "Numeric Types" section (remove “does not support minimum/maximum” note).
  - Add new sections (or a short table) for string constraints (`pattern`, `format`), numeric constraints, and array constraints with examples.
- `www/analog/src/app/pages/docs/react/concept/schema.md`
  - Same updates as Angular docs.

## Open Questions

None.
