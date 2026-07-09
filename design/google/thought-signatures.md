---
Created: 2026-01-22
Author: Mike Ryan
Affects: packages/google, packages/core
---

# Thought Signatures for Gemini 3 Function Calling

## Objective

Enable Hashbrown’s Google adapter to preserve and forward Gemini 3 “thought signatures” across multi-step function calling so Gemini 3 Pro/Flash works with tool calls + structured output without 4xx errors.

## Background

Gemini 3 models now return encrypted `thoughtSignature` values on function call parts, and Google validates that these signatures are returned on subsequent requests within the same turn. Hashbrown currently drops provider-specific metadata on tool calls, so these signatures never make it back to Google. This causes 400s for `gemini-3-flash` and `gemini-3-pro` when function calling is involved (including when `emulateStructuredOutput` is enabled). The Google adapter currently builds request content in `packages/google/src/stream/text.fn.ts` without carrying any per-tool-call metadata.

## Goals

- Update `@google/genai` peer dependency to the latest version.
- Preserve thought signatures on Gemini 3 function calls end-to-end.
- Add a generic, optional per-tool-call metadata envelope in `@hashbrownai/core` (API + internal) so adapters can carry provider-specific data.
- Add E2E tests in `packages/google/src/integration.spec.ts` for:
  - `gemini-3-flash`
  - `gemini-3-pro`
  using both structured output and function calls.

## Non-Goals

- Expose or render “thinking” content in Hashbrown UI.
- Add thought-signature handling for non-function text parts.
- Implement this for other adapters.

## UX / Workflows

- Developers should not have to opt in or pass new parameters.
- Thought signatures are captured and forwarded automatically by the Google adapter.

## Data Model & API Changes

### Schema

Add an optional metadata envelope on tool calls in core:

- `Chat.Api.ToolCall`
- `Chat.Internal.ToolCall`

Proposed shape:

```ts
// packages/core/src/models/api.models.ts
interface ToolCall {
  index: number;
  id: string;
  type: string;
  function: { name: string; arguments: string };
  metadata?: Record<string, unknown>;
}

// packages/core/src/models/internal.models.ts
interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  argumentsResolved?: JsonValue;
  result?: PromiseSettledResult<any>;
  progress?: number;
  status: 'pending' | 'done';
  metadata?: Record<string, unknown>;
}
```

Vendor-specific namespace example:

```ts
metadata: {
  google: {
    thoughtSignature: string;
  };
}
```

### Validation

- Core does not validate metadata; it is optional and pass-through only.
- Google adapter validates signature presence for Gemini 3 when tool calls are part of the current turn. If missing, throw an error (adapter-only behavior).

### CRUD / Endpoints

- No new endpoints.
- `Chat.Api.CompletionChunk` deltas will include `toolCalls[].metadata` so streaming merges preserve signatures.

## Core Logic / Algorithms

### Core

- Update tool-call merge logic in `packages/core/src/utils/assistant-message.ts` to retain/merge `metadata` when combining streaming deltas.
- Ensure conversions:
  - `toInternalToolCallsFromApi` copies `metadata` into internal tool calls.
  - `toInternalToolCallsFromApiMessages` retains `metadata`.
  - `toApiMessagesFromInternal` writes `metadata` back to API tool calls.
- No other behavior change for non-Google adapters.

### Google Adapter

In `packages/google/src/stream/text.fn.ts`:

1) Capture thought signatures from responses
   - When parsing `candidate.content.parts`, for each `functionCall` part:
     - Emit a tool call delta with `metadata.google.thoughtSignature` when `part.thoughtSignature` is present.
   - This metadata is stored in the assistant message and carried into thread saves.

2) Send thought signatures on follow-up requests
   - When mapping assistant messages to `Content` parts, include:
     - `thoughtSignature: toolCall.metadata?.google?.thoughtSignature`
     - Only on the matching function call part (same part where it was received).

3) Validation
   - If model name starts with `gemini-3-` and the current turn includes function calls:
     - Determine the current turn boundary by the most recent non-tool user message.
     - Ensure each assistant function call part in that turn has a `thoughtSignature`.
     - If missing, throw a descriptive error (adapter-only).

## Telemetry / Observability

- None beyond existing error handling (throw on missing signature).

## Backward Compatibility

- Gemini 1.x/2.x models unchanged.
- Metadata is optional; existing stored threads without metadata continue to work for older models.
- If a Gemini 3 thread has missing signatures, the adapter throws (expected).

## Permissions / Security

- No new permissions.
- Metadata is opaque and provider-specific; no new security surface.

## Rollout / Migration

- Bump `@google/genai` peer dependency to latest.
- No data migrations.
- Verify with new E2E tests.

## Testing

Add E2E tests to `packages/google/src/integration.spec.ts`:

- `Google with tool calling and structured output (gemini-3-flash)`
- `Google with tool calling and structured output (gemini-3-pro)`

Each test should:
- Use tool calling + structured output (e.g., `emulateStructuredOutput: true` + a tool).
- Fail today with 400 due to missing signatures.
- Pass after metadata capture + replay.

Add core unit tests (optional but recommended):
- `mergeToolCalls` preserves `metadata`.
- `toInternalToolCallsFromApi` / `toApiMessagesFromInternal` round-trip metadata.

## Open Questions

- Final name for the metadata envelope (`metadata` vs `extra` vs `providerMeta`).
- Whether we need to emit multiple tool calls per chunk when a response includes parallel function calls (future-proofing).
- Confirm latest `@google/genai` version once updated.
