---
Created: 2026-01-20
Author: Mike Ryan
Affects: packages/core
---

# JSON AST -> Schema Integration + node Type

## Objective
Integrate the JSON AST produced by `packages/core/src/skillet/parser/json-parser.ts` with the built-in schema language in `packages/core/src/schema/base.ts`, enabling streaming value resolution and adding a `node` schema type that exposes parser node state.

## Background
The new JSON parser emits an AST with stable node identities, a “closed” indicator, and a `resolvedValue` per node. The schema system currently validates/derives types and can generate JSON Schema or TypeScript, but it does not yet consume this AST to produce streaming values. We want to walk the AST, preserve object identity against each node’s `resolvedValue`, and allow schemas to emit partial values when nodes are not closed.

## Goals
- Add per-type `fromJsonAstImpl` logic in `packages/core/src/schema/base.ts` to resolve streaming values from the JSON AST.
- Provide a top-level `s.fromJsonAst(schema, parserState)` entry point that uses the schema’s `fromJsonAstImpl`.
- Add an immutable, caller-maintained cache returned by `s.fromJsonAst` to preserve value identity across chunks.
- Represent match results as an explicit tri-state: `match`, `no-match`, `invalid`.
- Ensure `s.streaming.*` variants can resolve even when AST nodes are not closed; non-streaming variants should require closed nodes.
- Add a new schema type `s.node(inner)` that surfaces parser node state while remaining transparent to JSON Schema and TypeScript output.
- Preserve object identity between AST nodes and their `resolvedValue` when traversing.
- AnyOf matching is strict and order-sensitive: first schema that matches wins.

## Non-Goals
- Changing existing schema semantics or public behavior outside the new `fromJsonAst` / `node` capabilities.
- Introducing additional parser formats or non-JSON AST sources.
- Changing how JSON Schema or TypeScript generation works (except for transparency of `node`).
- Modifying the existing parser at `packages/core/src/streaming-json-parser` (it remains untouched).

## UX / Workflows
- Existing workflows (e.g., `s.string`, `s.object`, JSON Schema generation) remain unchanged.
- Streaming behavior:
  - `s.streaming.string('...')` can produce a value even if the AST node is not closed.
  - `s.string('...')` only resolves when the node is closed.
- `s.fromJsonAst` is called each time a chunk is parsed by `packages/core/src/skillet/parser/json-parser.ts`, and the caller reuses the returned cache for the next call.
- If `parserState.error` is present, no partial results are emitted and all matches return `invalid`.
- `s.node(inner)` is used to introspect parsing state within a schema:
  ```ts
  s.object('Some object', {
    value: s.node(
      s.streaming.string('some string')
    )
  })
  ```
  It returns an object like:
  ```ts
  {
    complete: true, // whether the node is closed
    partialValue: ..., // node.resolvedValue for the current AST node
    value: ..., // value resolved via inner schema's fromJsonAstImpl
  }
  ```
  - `value` is only set when the inner schema returns `match`. If the inner schema returns `no-match`, `value` is `undefined` while `partialValue` still mirrors `node.resolvedValue`.

## Data Model & API Changes

### Parser State / AST Input
`s.fromJsonAst` consumes the parser state from `packages/core/src/skillet/parser/json-parser.ts` so it can access both the AST and error state:

```ts
type FromJsonAstInput = {
  nodes: JsonAstNode[];
  rootId: number | null;
  error: ParserError | null;
};
```

`JsonAstNode` and `ParserError` use the exact shapes defined in `json-parser.ts`.

### Schema
- Add `fromJsonAstImpl` to each schema type in `packages/core/src/schema/base.ts`.
- Add new schema type `node` with API `s.node(inner)`.
- Add top-level API: `s.fromJsonAst(schema, parserState, cache?)`.
- Return a cache from `s.fromJsonAst` that the caller passes back on the next chunk.

### Matching Result
`fromJsonAstImpl` returns a tri-state result:

```ts
type FromJsonAstResult<T> =
  | { state: 'match'; value: T }
  | { state: 'no-match' }
  | { state: 'invalid' };
```

- `match`: the schema matched; `value` may be `null`.
- `no-match`: the schema does not apply or is not yet satisfied (e.g., non-streaming schema with an open node).
- `invalid`: the parser state is in error, or the AST node is internally inconsistent for this schema.

### Validation
- `fromJsonAstImpl` never throws; invalid parser state yields `{ state: 'invalid' }`.
- For `anyOf`, iterate in order and return the first `match`. If no schema matches, return `invalid` if any branch is `invalid`, otherwise `no-match`.

### CRUD / Endpoints
- Not applicable.

## Core Logic / Algorithms
- Implement a tree-walking algorithm in `packages/core/src/schema/base.ts` that consumes the JSON AST emitted by `packages/core/src/skillet/parser/json-parser.ts`.
- The algorithm should:
  - Maintain stable object identity aligned with each AST node’s `resolvedValue` (for arrays/objects, prefer returning `node.resolvedValue` when matched).
  - Use the AST’s `closed` signal to determine whether non-streaming schema types can resolve.
  - Allow streaming schema types to resolve from partial nodes.
  - Treat `node.resolvedValue` as the source of truth for partial values (no additional materialization).
  - Preserve container identity across chunks by reusing cached values when no new matched children appear.
- The AST has no cycles; schema cycles are supported by recursive traversal without special casing.
- `s.fromJsonAst(schema, parserState)` delegates to the schema’s `fromJsonAstImpl`.

### Cache (Draft)
`s.fromJsonAst` returns an immutable cache POJO that callers pass back on the next chunk. This allows streaming containers to preserve identity even when partial nodes do not yet match.

```ts
type FromJsonAstCache = {
  byNodeId: Record<number, JsonValue>;
  byNodeIdAndSchemaId: Record<string, JsonValue>;
};

type FromJsonAstOutput<T> = {
  result: FromJsonAstResult<T>;
  cache: FromJsonAstCache;
};
```

Rules:
- The cache is optional input and always returned as a new POJO with structural sharing.
- Streaming arrays/objects reuse cached container values when no new matched children appear.
- When schemas reshape/filter values (e.g., element schema on arrays), use `byNodeIdAndSchemaId` to avoid collisions.

## Telemetry / Observability
- None planned.

## Backward Compatibility
- Existing schema behavior stays unchanged by default.

## Permissions / Security
- No new permissions or security changes.

## Rollout / Migration
- No migration or feature flags; land as standard behavior.

## Match Semantics by Type
- Scalars (`string`, `number`, `boolean`, `null`, `literal`):
  - Streaming: `match` whenever the node type aligns and `node.resolvedValue` is defined.
  - Non-streaming: `match` only when `node.closed === true`.
- Objects:
  - Streaming object schema: emit partial objects from matched keys; missing keys are allowed while open.
  - Non-streaming object schema: all schema keys must be present and each key schema must `match`; the object node may still be open (e.g., when all keys are already present and matched).
- Arrays:
  - Streaming array schema: emit only the items whose element schema currently `match` (non-streaming element schemas still require their element nodes to be closed).
  - Non-streaming array schema: requires closed array and all elements must `match`.
- AnyOf:
  - Strict, ordered match: return the first `match` from the schema list.
  - If no schema matches, return `invalid` if any branch is `invalid`, otherwise `no-match`.

## Testing
- Must-have tests (see `packages/core/src/schema/schema-parser-interaction.spec.ts`):
  - Streaming vs closed nodes for scalar and composite types.
  - Distinguishing `match` + `value: null` from `no-match`.
  - `anyOf` matching order (first match wins) and `invalid` propagation.
  - `s.node` returning `complete`, `partialValue`, and resolved `value`.
  - Arrays: streaming arrays emit only matched elements; non-streaming arrays require closed array.
  - Objects: non-streaming requires all keys present and matched (object may still be open).
- All parser-interaction tests should be cut over to use `packages/core/src/skillet/parser/json-parser.ts` instead of `packages/core/src/streaming-json-parser`.
- Re-enable all tests in `packages/core/src/schema/schema-parser-interaction.spec.ts` and get the suite green.
