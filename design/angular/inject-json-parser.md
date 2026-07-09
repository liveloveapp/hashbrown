---
Created: 2026-01-28
Author: Mike Ryan
Affects: angular, core
---

# injectJsonParser (Angular, prop-driven)

## Objective

Provide a prop-driven Angular signal API that consumes an incrementally growing JSON signal and exposes parser state, resolved value, and errors without imperative callbacks.

## Background

Hashbrown’s streaming JSON parser is built around an immutable AST, identity-preserving updates, and a reducer-like `(state, chunk) -> state` interface. The schema layer (`fromJsonAst`) resolves streaming values according to Skillet schemas, with caching to preserve object identity and avoid unnecessary allocations. The existing integration in core reducers demonstrates how to combine parser state + schema resolution incrementally.

The existing Angular API is imperative (`parseChunk`). This doc defines a prop-driven variant using the same core parser that is reactive to a growing JSON signal.

## Goals

- Provide a public Angular signal factory (`injectJsonParser`) that:
  - Accepts a `Signal<string>` containing a full JSON string that grows over time.
  - Optionally accepts a `schema` as either `s.HashbrownType` or `Signal<s.HashbrownType>`.
  - Exposes `value`, `error`, and `parserState` signals.
  - Supports streaming, partial value resolution per Skillet schemas.
  - Preserves identity for streaming objects/arrays when schema caching applies.
- On input updates, only parse new content when the updated string extends the previous string.
- On input updates that differ from the previous string, reset parser state and treat the new input as a full restart.
- Keep core logic pure and immutable; framework layers only manage state.

## Non-Goals

- Exposing the full Hashbrown UI/chat runtime or UI kit APIs.
- Supporting non-string inputs (e.g., `Uint8Array`, `ArrayBuffer`).
- Adding imperative methods (`parseChunk`, `reset`) to this API.
- Implementing new schema semantics; use existing `fromJsonAst` behavior.

## UX / Workflows

```ts
import { Component, Signal, signal } from '@angular/core';
import { injectJsonParser } from '@hashbrownai/angular';
import * as s from '@hashbrownai/core/schema';

@Component({
  standalone: true,
  template: `{{ parser.value() | json }}`,
})
export class DemoComponent {
  json = signal('{"content":"Hel');

  parser = injectJsonParser(
    this.json,
    s.object('root', {
      content: s.streaming.string('content'),
      citations: s.streaming.array('citations', s.string('citation')),
    }),
  );

  constructor() {
    this.json.set('{"content":"Hello","citations":[]}');
  }
}
```

## Data Model & API Changes

### Schema

- Angular: `injectJsonParser(json: Signal<string>, schema?: s.HashbrownType | Signal<s.HashbrownType>)`

Schema is optional. When provided, `value` is derived from `fromJsonAst` using the parser state and schema cache, and supports streaming types (e.g., `s.streaming.string`, `s.streaming.array`, `s.streaming.object`). When no schema is provided, `value` is the root node’s resolvedValue when available; it does not require the full JSON payload to be closed.

### Validation

- `value` streams partial results per Skillet streaming semantics.
- `error` reflects parser errors or schema invalid states. If invalid occurs mid-stream, `value` remains at the last successful match.

### CRUD / Endpoints

None.

## Core Logic / Algorithms

`injectJsonParser` keeps the parser state and schema cache in signals and derives `value` via `fromJsonAst`.

It reacts to changes in the `json` signal (and optionally a `schema` signal). When `json` updates, it compares the new string to the previous string:

- If `previous === current`, do nothing.
- If `current` starts with `previous`, parse only the new suffix (`current.slice(previous.length)`).
- Otherwise, reset parser state and parse `current` as a fresh stream from the beginning.

When the schema changes, the function keeps the existing parser state and re-resolves `value` from the current AST with the new schema.

## Telemetry / Observability

None.

## Backward Compatibility

No changes to existing public APIs. New export in `@hashbrownai/angular` only.

## Permissions / Security

No new permissions. Parser still rejects prototype-polluting keys and invalid JSON.

## Rollout / Migration

Ship behind a minor release for `@hashbrownai/angular`. No migration needed.

## Testing

- Angular: ensures `value/error/parserState` update when JSON grows and when input resets.
- Angular: ensures suffix-only updates parse only new content.
- Angular: ensures schema signal changes re-resolve without resetting parser state.
- Core: ensure parser + schema streaming behavior stays aligned with `schema-parser-interaction.spec.ts`.
- Tests use top-level `test(...)` and arrange/act/assert style.

## Open Questions

- Should `value` be `undefined` or `null` when no schema is provided?
- Do we want an opt-in for exposing raw AST or parser tokens for advanced use cases?
