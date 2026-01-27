---
Created: 2026-01-27
Author: Mike Ryan
Affects: angular, core
---

# injectJsonParser (Angular)

## Objective

Enable Angular developers to consume Hashbrown’s streaming JSON parser independently of the full UI/chat runtime via a signal-backed API that accepts chunks, exposes parser state, and streams partial values (optionally guided by a Skillet schema).

## Background

Hashbrown’s streaming JSON parser is built around an immutable AST, identity-preserving updates, and a reducer-like `(state, chunk) -> state` interface. The schema layer (`fromJsonAst`) resolves streaming values according to Skillet schemas, with caching to preserve object identity and to avoid unnecessary allocations. The existing integration in core reducers demonstrates how to combine parser state + schema resolution incrementally.

We want a framework-native API that keeps the parser core in core, but lets Angular users drive it with their own state systems, without adopting the full Hashbrown runtime.

## Goals

- Provide a public Angular signal factory (`injectJsonParser`) that:
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
import { Component } from '@angular/core';
import { injectJsonParser } from '@hashbrownai/angular';
import * as s from '@hashbrownai/core/schema';

@Component({
  standalone: true,
  template: `{{ parser.value() | json }}`,
})
export class DemoComponent {
  parser = injectJsonParser(
    s.object('root', {
      content: s.streaming.string('content'),
      citations: s.streaming.array('citations', s.string('citation')),
    }),
  );

  constructor() {
    this.parser.parseChunk('{"content":"Hel');
    this.parser.parseChunk('lo","citations":[]}');
  }
}
```

## Data Model & API Changes

### Schema

- Angular: `injectJsonParser(schema?: s.HashbrownType)`

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

`injectJsonParser` creates signals for `parserState`, `value`, `error`, and maintains schema cache/last value internally. It exposes imperative methods `parseChunk` and `reset`, and uses core `createParserState/parseChunk/fromJsonAst` for updates.

## Telemetry / Observability

None.

## Backward Compatibility

No changes to existing public APIs. New export in `@hashbrownai/angular` only.

## Permissions / Security

No new permissions. Parser still rejects prototype-polluting keys and invalid JSON.

## Rollout / Migration

Ship behind a minor release for `@hashbrownai/angular`. No migration needed.

## Testing

- Angular: ensures signals update properly and identity is preserved across chunks.
- Core: ensure parser + schema streaming behavior stays aligned with `schema-parser-interaction.spec.ts`.
- Tests use top-level `test(...)` and arrange/act/assert style.

## Open Questions

- Should `value` be `undefined` or `null` when no schema is provided?
- Do we want an opt-in for exposing raw AST or parser tokens for advanced use cases?
