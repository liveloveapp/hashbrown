---
Created: 2026-01-27
Author: Mike Ryan
Affects: react, core
---

# useImperativeJsonParser (React)

## Objective

Enable React developers to consume Hashbrown’s streaming JSON parser independently of the full UI/chat runtime via a hook that accepts chunks, exposes parser state, and streams partial values (optionally guided by a Skillet schema).

## Background

Hashbrown’s streaming JSON parser is built around an immutable AST, identity-preserving updates, and a reducer-like `(state, chunk) -> state` interface. The schema layer (`fromJsonAst`) resolves streaming values according to Skillet schemas, with caching to preserve object identity and to avoid unnecessary allocations. The existing integration in core reducers demonstrates how to combine parser state + schema resolution incrementally.

We want a framework-native API that keeps the parser core in core, but lets React users drive it with their own state systems, without adopting the full Hashbrown runtime.

## Goals

- Provide a public React hook (`useImperativeJsonParser`) that:
  - Accepts streaming JSON chunks as strings only.
  - Exposes `value`, `error`, `parserState`, and `parseChunk(...)`.
  - Supports optional Skillet schemas for streaming, partial value resolution.
  - Preserves identity for streaming objects/arrays when schema caching applies.
  - Supports `reset()` to return to a clean parser state.
- Integrate schema behavior consistent with `packages/core/src/schema/schema-parser-interaction.spec.ts`.
- Keep core logic pure and immutable; framework layers only manage state.

## Non-Goals

- Exposing the full Hashbrown UI/chat runtime or UI kit APIs.
- Supporting non-string chunk inputs (e.g., `Uint8Array`, `ArrayBuffer`).
- Adding extra lifecycle events (e.g., `complete`, `setSchema`, `parseChunks`) beyond `parseChunk` and `reset`.
- Implementing new schema semantics; use existing `fromJsonAst` behavior.

## UX / Workflows

```ts
import { useImperativeJsonParser } from '@hashbrownai/react';
import * as s from '@hashbrownai/core/schema';

const schema = s.object('root', {
  content: s.streaming.string('content'),
  citations: s.streaming.array('citations', s.string('citation')),
});

function Demo() {
  const { value, error, parserState, parseChunk, reset } = useImperativeJsonParser(schema);

  useEffect(() => {
    parseChunk('{"content":"Hel');
    parseChunk('lo","citations":[]}');
  }, [parseChunk]);

  return (
    <pre>{JSON.stringify({ value, error, parserState }, null, 2)}</pre>
  );
}
```

## Data Model & API Changes

### Schema

- React: `useImperativeJsonParser(schema?: s.HashbrownType)`

Schema is optional. When provided, `value` is derived from `fromJsonAst` using the parser state and schema cache, and supports streaming types (e.g., `s.streaming.string`, `s.streaming.array`, `s.streaming.object`). When no schema is provided, `value` is the root node’s resolvedValue when available; it does not require the full JSON payload to be closed.

### Validation

- `value` streams partial results per Skillet streaming semantics.
- `error` reflects parser errors or schema invalid states. If invalid occurs mid-stream, `value` remains at the last successful match.

### CRUD / Endpoints

None.

## Core Logic / Algorithms

Reuse existing parser and schema APIs directly from core:

- `createParserState()` to initialize parser state.
- `parseChunk(state, chunk)` to advance the parser.
- `fromJsonAst(schema, state, cache)` to resolve streaming values and preserve identity.

`useImperativeJsonParser` keeps parser + schema state in React state and updates with the existing core functions. The hook only returns public types (no `ɵ` types), and is pure:

- `parserState`: current parser state (AST + error + metadata)
- `value`: last successful match (streaming partials allowed)
- `error`: parser error or schema invalid
- `parseChunk(chunk: string)` updates session state
- `reset()` resets to initial session

## Telemetry / Observability

None.

## Backward Compatibility

No changes to existing public APIs. New export in `@hashbrownai/react` only.

## Permissions / Security

No new permissions. Parser still rejects prototype-polluting keys and invalid JSON.

## Rollout / Migration

Ship behind a minor release for `@hashbrownai/react`. No migration needed.

## Testing

- React: ensures hook updates value/error/parserState and preserves identity across chunks.
- Core: ensure parser + schema streaming behavior stays aligned with `schema-parser-interaction.spec.ts`.
- Tests use top-level `test(...)` and arrange/act/assert style.

## Open Questions

- Should `value` be `undefined` or `null` when no schema is provided?
- Do we want an opt-in for exposing raw AST or parser tokens for advanced use cases?
