---
Created: 2026-01-25
Author: Mike Ryan
Affects: packages/core
---

# Initialize Missing Streaming Fields in Object Resolution

## Objective

Enable object resolution to initialize empty values for missing streaming fields (string/array/object) so other fields can resolve without waiting for later keys.

## Background

The JSON AST → schema resolution design allows streaming schemas to resolve from open nodes while preserving identity. However, object resolution today waits for all schema keys (or only emits keys that match). In component props like:

```ts
{
  content: s.streaming.string(...),
  citations: s.streaming.array(...)
}
```

`content` does not stream until `citations` appears because the object resolver is waiting for the missing key. For streaming arrays/objects/strings, we can safely initialize an empty value and let other fields stream immediately.

This change is constrained to core schema resolution (`fromJsonAst`) and should not alter public APIs.

## Goals

- Allow object schemas to emit empty defaults for missing streaming keys.
- Preserve identity guarantees from the JSON parser and schema resolver.
- Keep behavior unchanged for missing non-streaming keys.

## Non-Goals

- Changes to parsing, transport, or streaming reducer behavior.
- Adding new schema types or changing JSON Schema output.
- Introducing flags or metadata to distinguish initialized vs model-provided values.

## UX / Workflows

No user-facing workflow changes. Components with streaming props can render earlier because missing streaming keys are initialized with empty values.

## Data Model & API Changes

### Schema

No new public schema APIs. Behavior change only in `fromJsonAst` for object resolution.

### Validation

No new validation. The initialized empty values must conform to the streaming schema types:

- `s.streaming.string(...)` → `''`
- `s.streaming.array(...)` → `[]`
- `s.streaming.object(...)` → `{}`

### CRUD / Endpoints

None.

## Core Logic / Algorithms

### Current behavior (summary)

Object schemas emit partial objects from matched keys. Missing keys are not present until the model emits them, which can block other fields when consumers expect keys to exist.

### Proposed behavior

When resolving an object schema, initialize missing keys **only if** their schema type is streaming and has a safe empty identity:

- Streaming string → initialize to `''`.
- Streaming array → initialize to `[]`.
- Streaming object → initialize to `{}`.

Non-streaming keys keep existing behavior: missing keys are not initialized and still gate completion as they do today.

### Initialization rules

- Apply to all object schemas (`s.object(...)` and `s.streaming.object(...)`).
- Apply only when a key is missing from the AST object node.
- Only initialize for the streaming scalar/container types listed above.
- Do not initialize for `s.streaming.number`, `s.streaming.boolean`, `s.streaming.null`, `anyOf`, or `s.node` (no obvious safe empty value without user intent).
- Initialized values should participate in cache/identity rules just like resolved values, so repeated chunks preserve identity unless the key transitions to a real value.

### Identity and cache

- Use the `fromJsonAst` cache to preserve object identity across chunks.
- When an initialized value is later replaced by an actual AST-derived value, only that key’s subtree should receive a new identity, preserving other keys.

## Telemetry / Observability

None.

## Backward Compatibility

- Additive behavior for object resolution with streaming keys.
- Non-streaming schema behavior remains unchanged for missing non-streaming keys.
- No API surface or type changes.

## Permissions / Security

No changes.

## Rollout / Migration

No migration required. Ship as a standard behavior update in core.

## Testing

- Streaming object with missing streaming string key initializes to `''` and allows other keys to stream.
- Streaming object with missing streaming array key initializes to `[]`.
- Streaming object with missing streaming object key initializes to `{}`.
- Non-streaming object with missing streaming string key initializes to `''`.
- Non-streaming object with missing streaming array key initializes to `[]`.
- Non-streaming object with missing streaming object key initializes to `{}`.
- Missing non-streaming key does **not** initialize.
- Identity preservation: initialized values are stable across chunks until replaced by actual values; replacing one key does not reallocate unaffected keys.

## Open Questions

- Should `s.streaming.number` or `s.streaming.boolean` ever receive an empty default (e.g., `0` / `false`), or is that too opinionated?
  - There is no `s.streaming.number` or `s.streaming.boolean`
- Should `s.streaming.object` with nested required non-streaming keys still initialize to `{}` or remain blocked?
  - Remain blocked
