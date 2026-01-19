---
Created: 2026-01-19
Author: Mike Ryan
Affects: packages/core
---

# Pure Streaming JSON Parser

## Objective
Replace the existing schema-coupled streaming parser with a pure, isomorphic, functional streaming JSON parser that builds and maintains an immutable AST with closed/open node status, updates resolved values incrementally, preserves identity for unchanged subtrees, and never throws (errors are part of state).

## Background
The current parser at `packages/core/src/streaming-json-parser/index.ts` is tied to schema assumptions. For upcoming LLM streaming use cases (tool args and structured outputs in `packages/core/src/reducers/streaming-message.reducer.ts`), we need a schema-agnostic, high-performance streaming JSON parser that can handle partial chunks and report precise errors while maintaining a rich AST.

## Goals
- Pure streaming JSON parsing: no schema coupling.
- Functional interface: `(state, chunk) -> state`.
- Immutable state, with minimal invalidation when new chunks arrive.
- AST nodes track: id, type, parentId, closed/open, resolvedValue.
- When a node updates, its resolved value and all ancestor resolved values are updated.
- Preserve identity for unchanged subtrees to optimize UI change detection.
- Use POJOs + functions only (no classes).
- Errors are stored in state, never thrown; no partial results usable if error exists.
- Isomorphic (browser + Node) with standard ECMAScript only.
- Exhaustive unit tests covering streaming, boundary, and error cases.

## Non-Goals
- No schema validation or coercion.
- No streaming I/O integration (only consumes chunks).
- No telemetry or observability in this version.
- No performance SLAs in v1.

## UX / Workflows
- Callers maintain parser state and feed chunks as they arrive.
- When the stream ends, caller checks state for errors; if none, uses final resolved value.
- Used by `packages/core/src/reducers/streaming-message.reducer.ts` to incrementally parse tool arguments and structured outputs from LLM streams.

Example workflow (proposed API):
- `state = createParserState()`
- `state = parseChunk(state, chunk)`
- `if (state.error) => ignore results`
- `if (state.isComplete) => use state.root.resolvedValue`

## Data Model & API Changes

### Schema
Proposed state and AST shapes (draft):

```ts
type JsonAstType =
  | "null"
  | "boolean"
  | "number"
  | "string"
  | "array"
  | "object";

type JsonAstBase = {
  id: number;
  type: JsonAstType;
  parentId: number | null;
  closed: boolean;
  resolvedValue: JsonValue | undefined;
};

type JsonNullAstNode = JsonAstBase & {
  type: "null";
  resolvedValue: null | undefined;
};

type JsonBooleanAstNode = JsonAstBase & {
  type: "boolean";
  resolvedValue: boolean | undefined;
};

type JsonNumberAstNode = JsonAstBase & {
  type: "number";
  buffer: string;
  resolvedValue: number | undefined;
};

type JsonStringAstNode = JsonAstBase & {
  type: "string";
  buffer: string;
  resolvedValue: string | undefined;
};

type JsonArrayAstNode = JsonAstBase & {
  type: "array";
  children: number[];
  resolvedValue: JsonValue[] | undefined;
};

type JsonObjectAstNode = JsonAstBase & {
  type: "object";
  keys: string[];
  children: number[];
  resolvedValue: Record<string, JsonValue> | undefined;
};

type JsonAstNode =
  | JsonNullAstNode
  | JsonBooleanAstNode
  | JsonNumberAstNode
  | JsonStringAstNode
  | JsonArrayAstNode
  | JsonObjectAstNode;

type ParserError = {
  message: string;
  index: number; // absolute char index
  line: number;
  column: number;
};

type ParserState = {
  nextId: number;
  mode: ParseMode; // e.g., Value, String, Number, Array, Object, Key, Colon, Comma, Done, Error
  stack: number[]; // node ids (path to current container)
  nodes: JsonAstNode[];
  rootId: number | null;
  error: ParserError | null;
  isComplete: boolean;
  index: number; // absolute char index
  line: number;
  column: number;
};
```

Node ids are assigned deterministically by incrementing `nextId`.

### Identity + Immutability Contract
- For any chunk, only the path from the modified leaf to the root receives new object identities.
- All other subtrees preserve identity across chunks.
- The parser is fully immutable: every state transition returns new POJOs; no in-place mutation.
- Implementation is restricted to POJOs + functions (no classes).

### Validation
- No schema validation.
- JSON grammar validation only.
- Error states set `error` and `mode = Error`, `isComplete = false`.

### CRUD / Endpoints
New exports (proposal):
- `createParserState(): ParserState`
- `parseChunk(state: ParserState, chunk: string): ParserState`
- `finalize(state: ParserState): ParserState` (optional; sets complete if in valid final mode)
- `getResolvedValue(state: ParserState): JsonValue | undefined` (returns undefined if error or not complete)

This can live alongside existing parser for now, and replace it after integration in `streaming-message.reducer.ts`.

## Core Logic / Algorithms
- Single-pass streaming JSON parser.
- Stateless function wrapper that takes state + chunk and returns new state.
- Uses an explicit `mode` to track current parse context.
- Decouple tokenization state from AST state while keeping both immutable.
- AST is updated immutably: when a node is updated, create new node objects and update parent chain to update resolved values.
- Minimal invalidation: only re-derive nodes touched by new chunk.

### Tokenization vs AST Updates
- Tokenizer returns a new immutable `tokenState` plus a compact list of ops for the chunk.
- Ops are applied in a single reducer pass to produce a new `astState`.
- This reduces per-character allocation and keeps GC pressure lower.

### Ops Protocol (Draft)
Ops are plain objects describing minimal AST edits. Example shapes:

```ts
type AstOp =
  | { kind: "open-node"; id: number; type: JsonAstType; parentId: number | null }
  | { kind: "append-string-slice"; id: number; chunkId: number; start: number; end: number }
  | { kind: "append-number-slice"; id: number; chunkId: number; start: number; end: number }
  | { kind: "set-key"; id: number; key: string }
  | { kind: "append-child"; id: number; childId: number }
  | { kind: "close-node"; id: number }
  | { kind: "error"; error: ParserError };
```

Reducer rules (sketch):
- `open-node`: create a new node and attach to parent if provided.
- `append-*-slice`: add slice metadata to node buffer without materializing string/number.
- `set-key`: for object nodes, stage the key for the next `append-child`.
- `append-child`: append child id to `children` and `keys` (if object) using persistent arrays.
- `close-node`: mark closed, materialize buffer if needed, compute `resolvedValue`.
- `error`: set `error`, `mode = Error`, and stop further ops.

### Persistent Structures (POJO-Only)
- Store `nodes` in a persistent, chunked array implemented as plain objects and arrays (no classes).
- Arrays/objects store `children`/`keys` in the same persistent chunked form.
- Appends and updates return new POJO roots that share most structure with prior versions.
- Number/string buffers are stored as chunk slices (array of `{ start, end }` + chunk references) and only materialized on close.

Algorithm outline:
- Iterate characters in chunk.
- Use `mode` and stack to decide transitions.
- Maintain buffers for strings/numbers in current node.
- On closing tokens (`"`, `]`, `}`), mark node closed, compute `resolvedValue`.
- Propagate resolvedValue up: for arrays/objects, reconstruct value from children; for parents, only recompute along the path to root.

### Resolved Value & Identity
- Closed nodes compute `resolvedValue` from buffers or children.
- Open container nodes maintain a partially-resolved value that reuses child identities.
- Only the dirty path gets new identities; unchanged subtree values are preserved.

## Telemetry / Observability
None.

## Backward Compatibility
- Breaking changes: new API and AST shapes; no compatibility with old parser’s exports.
- Side-by-side: new module added under `packages/core/src/skillet/parser/` while old module remains until integration is complete.

## Permissions / Security
- Pure parsing of JSON; no execution.
- Error messaging should avoid leaking sensitive data; only include short context (line/column/index).

## Rollout / Migration
- Implement new parser in parallel.
- Switch `packages/core/src/reducers/streaming-message.reducer.ts` to use new parser once tests pass.
- Remove old parser after validation (future step).

## Testing
- Exhaustive unit tests for:
  - Chunk boundaries across all token types.
  - Deep nesting.
  - Arrays/objects with incremental closure.
  - Strings with escaped characters split across chunks.
  - Numbers split across chunks.
  - Whitespace handling.
  - Error states (unexpected tokens, premature EOF, trailing tokens).
- Optional: property-based fuzz tests (if available in repo).

## Open Questions
- Should `parseChunk` accept `Uint8Array` as well as string?
- Do we want a separate “debug AST” vs production shape to control overhead?
- Should `finalize` be required to mark completion, or inferred by parser state?
