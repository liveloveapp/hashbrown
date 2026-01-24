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

Open Responses defines a provider-agnostic request schema and SSE streaming protocol. The new adapter translates from Hashbrown's chat-centric model to Open Responses items/events while preserving the Hashbrown client contract (now updated to Open Responses-aligned frames).

## Goals

- Provide a drop-in Hashbrown backend adapter for any Open Responses-compatible API.
- Migrate the frame protocol to match Open Responses event types (breaking change).
- Support tool calling, incremental text streaming, refusal, and reasoning.
- Support output item and content-part lifecycle events.
- Allow light customization of request mapping for provider-specific extensions.
- Migrate core models to the Open Responses schema across all packages.

## Non-Goals

- Full coverage of Open Responses features beyond text/tool/refusal/reasoning (images, audio, background, etc.).
- Building a general-purpose Open Responses SDK.
- Maintaining legacy `thread-*` frames (removed).

## UX / Workflows

React/Angular clients will be updated to consume the new Open Responses-aligned frame protocol. Thread persistence is handled entirely by the application (no adapter-driven thread frames). The adapter only emits Open Responses-aligned events.

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

All frame `type` values mirror the Open Responses spec. Field names are normalized to camelCase. Lifecycle frames include the full `response` snapshot.

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

The existing OpenAI Chat adapter will be updated to emit the new Open Responses-aligned frame protocol by mapping Chat stream deltas to the closest Open Responses events. No other behavior changes are made except those required to support the new shared protocol across all adapters.

## Telemetry / Observability

Minimal initially. No prompt/tool output logging by default. Optional future work: request IDs, latency, frame counts.

## Backward Compatibility

Breaking change:
- `thread-*` frames are removed.
- Clients must manage thread loading/saving out-of-band.
- Frame protocol now mirrors Open Responses event types.

## Permissions / Security

- No prompt/tool output logging by default.
- `apiKey` optional to support internal deployments.
- Allow custom headers for enterprise gateways.

## Rollout / Migration

1. Implement `@hashbrownai/responses` stream adapter.
2. Add README with usage examples.
3. Add tests (SSE parsing, mapping, tool calls).
4. Migrate core models to Open Responses schema across all packages.
5. Update adapters and clients to the new Open Responses-aligned frame protocol.

## Testing

### Unit Tests

- SSE parsing (chunk boundaries, multiline `data`, `[DONE]`).
- Event-to-frame mapping.
- Tool-call indexing and argument streaming.
- Refusal/reasoning delta handling.

### Integration Tests

- Mock Open Responses server:
  - Text-only stream
  - Tool-call stream
  - Refusal and reasoning stream
  - Error cases
- Verify emitted frames match the new protocol.

## Open Questions

- For the OpenAI Chat adapter mapping, which Open Responses events should be synthesized from Chat deltas vs. omitted when unavailable?
- Should response snapshots on lifecycle frames include the full `response` or a minimal projection to reduce payload size?
