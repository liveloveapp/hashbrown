---
Created: 2025-02-14
Author: Brian Love
Affects: @hashbrownai/core, @hashbrownai/openai, @hashbrownai/responses, @hashbrownai/react, @hashbrownai/angular, samples/*
---

# Hashbrown Open Responses Adapter (`@hashbrownai/responses`)

## Objective

Create a new Hashbrown backend adapter package that speaks the Open Responses API and emits an Open Responses-aligned frame protocol, enabling React/Angular clients to consume any Open Responses-compatible server over HTTP.

## Background

Hashbrown backend adapters normalize provider APIs into a streaming frame protocol consumed by the UI. The existing OpenAI adapter (`packages/openai/src/stream/text.fn.ts`) is the canonical reference today, but the long-term direction is to align the core model and frame protocol with Open Responses rather than the Chat API.

Open Responses defines a provider-agnostic request schema and SSE streaming protocol. The new adapter translates from Hashbrown's chat-centric model to Open Responses items/events and emits Open Responses-aligned frames. The Hashbrown client contract migrates from generation frames to these frames for response streaming; thread frame support is preserved.

## Goals

- Provide a drop-in Hashbrown backend adapter for any Open Responses-compatible API.
- Migrate core and all adapters to Open Responses-aligned frames for response streaming. Replace generation frames with Open Responses-aligned frames; do not maintain backward compatibility with generation-based frames. Keep thread frame types unchanged.
- Support tool calling, incremental text streaming, refusal, and reasoning.
- Support output item and content-part lifecycle events.
- Allow light customization of request mapping for provider-specific extensions.
- Migrate core models to the Open Responses schema across all packages.

## Non-Goals

- Full coverage of Open Responses features beyond text/tool/refusal/reasoning (images, audio, background, etc.).
- Building a general-purpose Open Responses SDK.
- Removing or changing existing thread frames and thread support; the new adapter and protocol coexist with current thread behavior.

## UX / Workflows

React/Angular clients will consume Open Responses-aligned frames (lifecycle, text deltas, tool calls, etc.) for response streaming instead of generation frames, and will continue to consume thread frames for thread operations. The **Open Responses adapter** (`@hashbrownai/responses`) emits only Open Responses-aligned frames (no thread frames); for that adapter, thread persistence is handled entirely by the application. Chat-based adapters (OpenAI, Anthropic, etc.) will be updated to emit Open Responses-aligned frames, conforming as much as possible to the Open Responses protocol, and will continue to support adapter-driven thread frames (`thread-load-*`, `thread-save-*`) and the `loadThread` / `saveThread` contract.

## Data Model & API Changes

### Schema

- Adopt Open Responses request/response schema in core model definitions.
- Update adapters and clients to use the new Open Responses-aligned frame protocol.

Open Responses endpoint (per OpenAPI schema):

- `POST /v1/responses`
- `stream: true` for SSE streaming

### Validation

- Input mapping validates minimal required Open Responses fields.
- SSE events are parsed and validated by `type` when possible; malformed JSON or missing fields emit `error` frames.

### CRUD / Endpoints

- Only `POST /v1/responses` required for v1 adapter.

## Core Logic / Algorithms

### Package Layout

```
packages/responses/
  src/
    index.ts
    stream/
      text.fn.ts        # main adapter entry point
      sse.ts            # streaming SSE parser
      mapping.ts        # request/response mapping helpers
      types.ts          # minimal Open Responses types
  package.json
  tsconfig.json
  README.md
  __tests__/
```

### Public API

```ts
export interface OpenResponsesTextStreamOptions {
  baseURL: string;
  apiKey?: string;
  headers?: Record<string, string>;

  request: Chat.Api.CompletionCreateParams;

  transformRequestOptions?: (
    options: OpenResponsesCreateResponseRequest
  ) => OpenResponsesCreateResponseRequest | Promise<OpenResponsesCreateResponseRequest>;

  fetchImpl?: typeof fetch;
}

export const HashbrownOpenResponses = {
  stream: { text }
};
```

### Frame Protocol (Open Responses-aligned)

All frame `type` values mirror the Open Responses spec. Field names are normalized to camelCase. Lifecycle frames include a `response` snapshot. Per the [Open Responses specification](https://www.openresponses.org/specification), payloads use **as much detail as is available at that time**—for items the spec says “the item is echoed in the payload with as much detail as is available at that time”; the same applies to the `response` field on lifecycle events. Adapters may emit a minimal projection (e.g. `id`, `status`) when that is all that is available (e.g. Chat adapters synthesizing from a provider that has no Response resource).

```ts
type ResponseFrame =
  | ResponseCreatedFrame
  | ResponseQueuedFrame
  | ResponseInProgressFrame
  | ResponseCompletedFrame
  | ResponseFailedFrame
  | ResponseIncompleteFrame
  | ResponseOutputItemAddedFrame
  | ResponseOutputItemDoneFrame
  | ResponseContentPartAddedFrame
  | ResponseContentPartDoneFrame
  | ResponseOutputTextDeltaFrame
  | ResponseOutputTextDoneFrame
  | ResponseRefusalDeltaFrame
  | ResponseRefusalDoneFrame
  | ResponseReasoningDeltaFrame
  | ResponseReasoningDoneFrame
  | ResponseReasoningSummaryDeltaFrame
  | ResponseReasoningSummaryDoneFrame
  | ResponseOutputTextAnnotationAddedFrame
  | ResponseFunctionCallArgumentsDeltaFrame
  | ResponseFunctionCallArgumentsDoneFrame
  | ErrorFrame;

type BaseResponseFrame = {
  type: string;
  sequenceNumber?: number;
};

type ResponseCreatedFrame = BaseResponseFrame & {
  type: 'response.created';
  response: ResponseResource;
};

type ResponseQueuedFrame = BaseResponseFrame & {
  type: 'response.queued';
  response: ResponseResource;
};

type ResponseInProgressFrame = BaseResponseFrame & {
  type: 'response.in_progress';
  response: ResponseResource;
};

type ResponseCompletedFrame = BaseResponseFrame & {
  type: 'response.completed';
  response: ResponseResource;
};

type ResponseFailedFrame = BaseResponseFrame & {
  type: 'response.failed';
  response: ResponseResource;
};

type ResponseIncompleteFrame = BaseResponseFrame & {
  type: 'response.incomplete';
  response: ResponseResource;
};

type ResponseOutputItemAddedFrame = BaseResponseFrame & {
  type: 'response.output_item.added';
  outputIndex: number;
  item: ItemField | null;
};

type ResponseOutputItemDoneFrame = BaseResponseFrame & {
  type: 'response.output_item.done';
  outputIndex: number;
  item: ItemField | null;
};

type ResponseContentPartAddedFrame = BaseResponseFrame & {
  type: 'response.content_part.added';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  part: ContentPart;
};

type ResponseContentPartDoneFrame = BaseResponseFrame & {
  type: 'response.content_part.done';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  part: ContentPart;
};

type ResponseOutputTextDeltaFrame = BaseResponseFrame & {
  type: 'response.output_text.delta';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  delta: string;
  logprobs?: LogProb[];
  obfuscation?: string;
};

type ResponseOutputTextDoneFrame = BaseResponseFrame & {
  type: 'response.output_text.done';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  text: string;
  logprobs?: LogProb[];
};

type ResponseRefusalDeltaFrame = BaseResponseFrame & {
  type: 'response.refusal.delta';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  delta: string;
};

type ResponseRefusalDoneFrame = BaseResponseFrame & {
  type: 'response.refusal.done';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  refusal: string;
};

type ResponseReasoningDeltaFrame = BaseResponseFrame & {
  type: 'response.reasoning.delta';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  delta: string;
  obfuscation?: string;
};

type ResponseReasoningDoneFrame = BaseResponseFrame & {
  type: 'response.reasoning.done';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  text: string;
};

type ResponseReasoningSummaryDeltaFrame = BaseResponseFrame & {
  type: 'response.reasoning_summary_text.delta';
  itemId: string;
  outputIndex: number;
  summaryIndex: number;
  delta: string;
  obfuscation?: string;
};

type ResponseReasoningSummaryDoneFrame = BaseResponseFrame & {
  type: 'response.reasoning_summary_text.done';
  itemId: string;
  outputIndex: number;
  summaryIndex: number;
  text: string;
};

type ResponseOutputTextAnnotationAddedFrame = BaseResponseFrame & {
  type: 'response.output_text.annotation.added';
  itemId: string;
  outputIndex: number;
  contentIndex: number;
  annotationIndex: number;
  annotation: Annotation | null;
};

type ResponseFunctionCallArgumentsDeltaFrame = BaseResponseFrame & {
  type: 'response.function_call_arguments.delta';
  itemId: string;
  outputIndex: number;
  delta: string;
  obfuscation?: string;
};

type ResponseFunctionCallArgumentsDoneFrame = BaseResponseFrame & {
  type: 'response.function_call_arguments.done';
  itemId: string;
  outputIndex: number;
  arguments: string;
};

type ErrorFrame = BaseResponseFrame & {
  type: 'error';
  error: {
    type: string;
    code?: string | null;
    message: string;
    param?: string | null;
    headers?: Record<string, string>;
  };
};
```

**Thread support.** The core frame protocol comprises (1) Open Responses-aligned frames above (for response streaming) and (2) thread frames (`thread-load-start`, `thread-load-success`, `thread-load-failure`, `thread-save-start`, `thread-save-success`, `thread-save-failure`). Generation frames are not supported; core and adapters emit and consume only (1) and (2). The Open Responses adapter emits only (1); it does not emit thread frames. Chat-based adapters conform as much as possible to Open Responses frames and emit (1) and (2). Core supports (1) and (2) only.

### Request Mapping

Field mapping (Hashbrown Chat -> Open Responses):

| Hashbrown (Chat) | Open Responses | Notes |
|------------------|----------------|-------|
| `model` | `model` | Direct |
| `system` | `instructions` | Spec-supported |
| `messages[]` | `input[]` | Convert to message/function items |
| `tools[]` | `tools[]` | Function tool definitions |
| `toolChoice` | `tool_choice` | Direct |
| `responseFormat` | `response_format` | Passed via transform hook |

Message conversion:

- User messages -> `message` item with role `user`
- Assistant messages:
  - Plain text -> assistant message item
  - Tool calls -> `function_call` items
- Tool outputs -> `function_call_output` items tied to `call_id`

Non-string payloads are serialized as JSON strings for parity with existing behavior.

### Streaming & SSE Handling

- Read `Response.body` as a byte stream.
- Split events on blank lines.
- Parse `event:` + `data:` fields.
- Stop on literal `[DONE]` or terminal `response.completed` / `response.failed` / `response.incomplete`.
- Parse JSON payloads and emit the corresponding Open Responses-aligned frame.

### Mapping Legacy Chat Adapter to New Frames

Chat-based adapters (OpenAI, Anthropic, Azure, Bedrock, Google, Ollama, Writer) will be updated to emit Open Responses-aligned frames, conforming as much as possible to the Open Responses frame protocol. They map Chat API stream deltas to the closest Open Responses events; where the Chat API does not provide an equivalent (e.g. some lifecycle or refusal events), adapters omit or approximate as documented. Thread support is unchanged: adapters continue to accept `loadThread` / `saveThread`, merge messages for threads, and emit `thread-*` frames. Generation frames are not emitted; response streaming uses only Open Responses-aligned frames.

### Chat → Open Responses mapping: guardrails

To minimize regressions and make mapping gaps explicit:

**1. Core frame contract (minimum required).** Adapters must emit a frame sequence that core can consume to produce correct state. Minimum for each scenario:

- **Text-only response:** At least one of `response.created` / `response.queued` / `response.in_progress` (so core can treat generation as started); `response.output_text.delta` and/or `response.output_text.done` for content; exactly one terminal: `response.completed`, `response.incomplete`, or `response.failed` (so core finalizes the turn). On error, an `error` frame.
- **Tool-call response:** Same lifecycle plus `response.output_item.added` (or `.done`) with `item.type === 'function_call'` and stable `itemId`; `response.function_call_arguments.delta` and `response.function_call_arguments.done` for each call so core can build tool call args and dispatch.
- **Thread operations:** Unchanged; `thread-load-*` and `thread-save-*` frames as today.

Adapters that omit events outside this minimum (e.g. `response.queued`, refusal, reasoning) must document the omission; core must not assume those events exist.

**2. Required vs optional events (checklist).** Each Chat adapter will document and test:

- **Required:** Lifecycle start (at least one of created/queued/in_progress), text deltas or done, terminal (completed/incomplete/failed), and for tool calls: output_item for function_call, function_call_arguments delta/done. Error frame on failure.
- **Optional (omit if provider has no equivalent):** `response.queued`, `response.in_progress`, `response.refusal.*`, `response.reasoning.*`. The `response` field on lifecycle frames may be a minimal projection (e.g. `id`, `status`) when that is all that is available; see Open Responses spec (“as much detail as is available at that time”). Document per adapter which optional events are emitted.

**3. Per-adapter mapping doc.** Each adapter package will document (in README or a dedicated mapping doc): which Open Responses event types it emits, in what order; which events it omits and why (e.g. "Chat API has no queued event"); and how Chat-specific fields (e.g. `choice.index`, `tool_calls[].id`) map to Open Responses fields (`outputIndex`, `itemId`). This makes gaps explicit and reviewable.

**4. Shared mapping helpers (recommended).** To reduce drift and per-adapter bugs, consider a shared helper (e.g. in core or a shared util) that turns a minimal Chat-delta representation into the next Open Responses-aligned frame(s). Adapters then call this helper instead of each implementing mapping from scratch. Conformance to the core contract is enforced in one place.

**5. Synthesis conventions (Chat adapters).** Agreed rules for synthesizing Open Responses frames from Chat API streams:

- **Lifecycle (start):** Emit `response.created` at first chunk (or stream open). Omit `response.queued` and `response.in_progress` unless the provider explicitly exposes those states; for most Chat APIs, one start event is sufficient.
- **Text – delta:** Emit `response.output_text.delta` for every stream chunk to preserve chunk boundaries. When a chunk has no content, emit `delta` with an empty string.
- **Text – itemId:** Use a stable UUID per response (generated when the response starts). Use the same `itemId` for all `response.output_text.delta` and the corresponding `response.output_text.done` for that output item.
- **Text – indexing:** For single-choice Chat APIs, use `outputIndex: 0` and `contentIndex: 0`. Use the same `itemId` for the response’s text output item (see above).
- **Terminal:** Emit exactly one of `response.completed`, `response.incomplete`, or `response.failed` when the response stream ends (so core can finalize the turn). Map from the provider’s `finish_reason` / `stop_reason` / `finishReason` (or stream end):
  - **response.completed** – Normal successful end. Map when finish reason is a normal-stop value (e.g. `stop`, `end`, `tool_calls`, or provider equivalent meaning “model finished normally”).
  - **response.incomplete** – Stopped before full completion (e.g. max tokens). Map when finish reason indicates truncation (e.g. `length`, `max_tokens`, or provider equivalent).
  - **response.failed** – Error, refusal, or content filter. Map when finish reason indicates failure (e.g. `content_filter`, refusal), or when the request/stream errors (in that case you may emit an `error` frame instead of or before the terminal; core treats either as end of turn).
  - If the stream ends with no finish reason (e.g. clean close), treat as **response.completed**.
- **Tool calls:** For each tool call in the Chat stream, emit Open Responses frames so core can build the call and dispatch. Use the same `outputIndex` scheme as for the response (increment per output item: text is one item, each tool call is one item).
  - **itemId for tool calls:** Use the provider’s tool call id when present (e.g. Chat `tool_calls[].id`); otherwise generate a stable id (e.g. UUID or `item_${outputIndex}`). Use this `itemId` in all frames for that call (`response.output_item.added`/`.done`, `response.function_call_arguments.delta`/`.done`).
  - **Order:** (1) When a tool call first appears in a chunk, emit `response.output_item.added` with `item: { id: itemId, type: 'function_call', call_id: <provider id or itemId>, name: <from provider when available> }`. (2) For each chunk that contains argument data for that call, emit `response.function_call_arguments.delta` with the new delta string. (3) When the call is complete (e.g. stream end or finish_reason), emit `response.function_call_arguments.done` with the full concatenated arguments string, then `response.output_item.done` with the same item shape.
  - **Arguments:** Accumulate argument deltas across chunks; emit `response.function_call_arguments.delta` for each chunk that has `function.arguments` (or provider equivalent); emit `response.function_call_arguments.done` with the full string when finalizing that call. When a chunk has no argument delta for a call, do not emit a delta for that call (no empty-string delta required for tool args, unlike text).
  - **outputIndex:** Assign a single `outputIndex` per output item in the response (0 for first item—e.g. text—, 1 for next—e.g. first tool call—, etc.). Use the same `outputIndex` for every frame pertaining to that item.
- **Errors:** When a request fails, the stream fails, or the API returns an error, emit a single `error` frame and stop. Core treats the error frame as terminal (end of turn); do not also emit `response.completed` / `response.incomplete` / `response.failed` after it.
  - **When to emit:** Emit on request validation failure (e.g. missing required params, unsupported operation such as `load-thread` when not supported), transport/stream errors (e.g. network failure, stream closed unexpectedly), or API errors (e.g. 4xx/5xx, rate limit, provider error payload). After emitting, stop producing frames for that response.
  - **Frame shape:** `{ type: 'error', error: { type: string, message: string, code?: string | null, param?: string | null, headers?: Record<string, string> } }`. Required: `error.type` and `error.message`. Use `error.code` when the provider supplies a code (e.g. HTTP status or provider error code); use `error.param` when the error is about a specific parameter.
  - **error.type:** Use the provider’s error type as-is; do not map to a Hashbrown enum. Pass through the type (and code/message) from the provider’s error response or transport. For errors that originate in the adapter (e.g. unsupported operation, stream failure before provider response), use a descriptive string (e.g. `invalid_request`, `stream_error`). Core treats any `error` frame as terminal and today uses only `error.message` for the dispatched Error.

## Telemetry / Observability

Minimal initially. No prompt/tool output logging by default. Optional future work: request IDs, latency, frame counts.

## Backward Compatibility

- **No backward compatibility with generation frames.** The goal is to migrate core and all adapters to Open Responses-aligned frames. Generation frames are removed; core and adapters do not emit or consume them during or after migration. We do not maintain support for generation-based frames.
- **Thread frames and thread support remain.** The existing `thread-*` frame types and the client contract (`threadId`, `loadThread`, `saveThread`, and related state/signals) are unchanged.
- Clients that use only the Open Responses adapter manage thread persistence out-of-band (that adapter does not emit thread frames).

## Permissions / Security

- No prompt/tool output logging by default.
- `apiKey` optional to support internal deployments.
- Allow custom headers for enterprise gateways.

## Rollout / Migration

1. Implement `@hashbrownai/responses` stream adapter.
2. Add README with usage examples.
3. Add tests (SSE parsing, mapping, tool calls).
4. Migrate core to Open Responses-aligned frames: add Open Responses-aligned frame types, update core effects to consume only these frames (and thread frames) for response streaming. Remove generation frame types and handling from core. Keep thread frame types and handling.
5. Update Chat-based adapters to emit Open Responses-aligned frames, conforming as much as possible to the Open Responses protocol; retain thread frame emission and `loadThread` / `saveThread` behavior. Do not maintain backward compatibility with generation frames. For each adapter: run existing integration tests (text streaming, tool calling, structured output, tool+structured, thread IDs across turns where present); fix mapping until all pass; add frame-level assertions where beneficial (see Testing).
6. Migrate core models to Open Responses schema where needed.
7. Run all adapter integration tests and core effect tests after migration; treat failures as regressions and fix before release.

## Testing

### Unit Tests

- SSE parsing (chunk boundaries, multiline `data`, `[DONE]`).
- Event-to-frame mapping.
- Tool-call indexing and argument streaming.
- Refusal/reasoning delta handling.

### Integration Tests

**Open Responses adapter (`@hashbrownai/responses`):**

- Mock Open Responses server:
  - Text-only stream
  - Tool-call stream
  - Refusal and reasoning stream
  - Error cases
- Verify emitted frames match the protocol.

**Chat-based adapters (regression prevention).** Each adapter package already has integration tests that run against the full stack (adapter → length-prefixed frames → core → Hashbrown state). These must be preserved and must pass after the migration to Open Responses-aligned frames. They are the primary guard against mapping regressions.

- **Existing coverage (keep and run):**
  - **OpenAI** (`packages/openai/src/integration.spec.ts`): Text streaming, tool calling, structured output, tool+structured; asserts on frame types (`response.created`, `response.completed`) and extracts text/tool calls from `response.output_text.*` and `response.output_item.added` / `response.function_call_arguments.*`. Use as the reference for frame-level expectations.
  - **Anthropic, Azure, Bedrock, Google, Ollama, Writer**: Text streaming, tool calling, structured output, tool calling + structured output; **thread IDs across turns** (loadThread/saveThread, two turns, same threadId, saved thread contents). Assertions are on Hashbrown state (final assistant message, tool handler args), not raw frames.
- **Requirements:**
  - All existing adapter integration tests must pass after core and adapters emit/consume only Open Responses-aligned frames (and thread frames). No removal or weakening of these tests.
  - Where beneficial, add frame-level assertions (as in OpenAI’s integration tests) to other adapters: e.g. assert that the stream contains at least one `response.created` (or equivalent start), one terminal `response.completed` or `response.incomplete`, and for tool calls the expected `response.output_item.*` and `response.function_call_arguments.*` sequence. This catches reordering or missing events even when final state might still match in simple cases.
  - Optionally, add a test per adapter that collects the sequence of frame `type` values for a fixed request and compares against an allowed pattern or snapshot, to detect unintended changes in frame order or presence.
- **Core effects tests:** Core’s generate-message effect tests (e.g. `packages/core/src/effects/generate-message.effects.spec.ts`) that drive on Open Responses-aligned frames must be kept and extended so that all code paths (text delta, tool call, refusal, completion, error) are covered with frame-based tests. These protect core from regressions when adapters change.

## Open Questions

- For the OpenAI Chat adapter mapping, which Open Responses events should be synthesized from Chat deltas vs. omitted when unavailable?
- How should the Open Responses adapter interact with threads in v1? (e.g. no thread support in v1, with apps managing persistence out-of-band; or optional mapping of thread state to/from Open Responses in a later iteration)
- Should a shared Chat → Open Responses mapping helper live in core or a shared package, and what minimal Chat-delta shape should it accept so all adapters can use it?
