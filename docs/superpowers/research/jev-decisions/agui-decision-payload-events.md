# Ship plain JSON, mirror it in RUN_FINISHED.result

Yes, Hashbrown can carry a decision payload over AG-UI 1.0 without `CUSTOM`, but only one standard field is honest about it: **`RUN_FINISHED.result`, which the 1.0 spec defines as "the run's return value, if it has one" and types as any non-null JSON** ([AG-UI 1.0 lifecycle](https://docs.ag-ui.com/spec/1.0/events/lifecycle.md); [1.0 schema](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/spec/1.0/schema.mdx)). Every other candidate misuses its semantics. `TEXT_MESSAGE_*` makes the answer chat. `STATE_*` overwrites app state. `ACTIVITY_*` is frontend-only progress UI. `TOOL_CALL_*` leaves a dangling call that Hashbrown core turns into a follow-up run. Interrupts point the wrong way, and reasoning, step, `RAW` and metadata events cannot carry a primary payload. Even `result` gives Hashbrown no typing: AG-UI has no result schema, no output-schema input field and no draft that proposes one, so per-question answers, per-option probabilities and confidence would still be a Hashbrown-defined JSON shape. The only change is that it arrives inside an SSE stream of at least `RUN_STARTED` and `RUN_FINISHED`. AG-UI has no non-streaming binding, and Hashbrown's `HttpTransport` rejects any non-SSE response today. AG-UI therefore adds framing, not meaning, to a one-request/one-response decision, so **the plain-JSON decision protocol the team chose remains correct as the default**. An AG-UI-backed `DecisionTransport` is still worth defining as a thin, opt-in adapter for one reason: generic AG-UI clients (`@ag-ui/client`'s `runAgent()` already returns `result`) and agent servers that already speak AG-UI could then use Hashbrown decisions with no custom events. It should use `RUN_FINISHED.result` for the answer, `RUN_ERROR` for failures, `RUN_FINISHED.usage` for token accounting and `forwardedProps` for the request. Its `result` should be byte-for-byte the plain-JSON response body plus a `kind`/`version` discriminator.

## AG-UI 1.0 has exactly one honest return slot, and it is untyped

AG-UI 1.0 shipped on 2026-09-17 and was declared frozen. Future changes go through drafts ([discussion #2792](https://github.com/ag-ui-protocol/ag-ui/discussions/2792)), and the 1.1 draft changelog lists no changes yet ([draft changelog](https://docs.ag-ui.com/spec/draft/changelog)). The baseline here is the `@ag-ui/core` 1.0.2 package that Hashbrown pins. Two structural facts frame every option. First, **all events flow server to client. The client sends only a `RunAgentInput` POST, and HTTP implementations MUST support the SSE binding**. The only alternative is a length-prefixed protobuf binding, so a single `application/json` response is not available ([transports 1.0](https://docs.ag-ui.com/spec/1.0/basic/transports)). Second, **the 1.0 JSON Schema treats objects as exact**. An undeclared property fails validation. The exceptions are objects that are "open by meaning": metadata, activity content and carried JSON Schemas ([schema.json](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/spec/1.0/schema.json)). A decision payload therefore cannot ride as a new top-level field on any event. It has to live inside `result`, activity `content`, state, a string, or `metadata`.

On the request side, `RunAgentInput` requires only `threadId`, `runId` and `messages`. It has no output-schema or result-schema field ([run-input 1.0](https://docs.ag-ui.com/spec/1.0/basic/run-input)). The decision questions have four possible homes: `forwardedProps`, `state`, `context` (string-valued and model-facing) or a synthetic tool's `parameters`. Of these, **only `forwardedProps` is defined as opaque: "The protocol attaches no meaning to the payload, and intermediaries MUST NOT alter it"** ([run-input 1.0](https://docs.ag-ui.com/spec/1.0/basic/run-input)). AG-UI does let an agent advertise `capabilities.output.structuredOutput` ("can produce structured JSON output matching a provided schema"). It gives no slot for supplying that schema and names no event for returning the output ([1.0 schema](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/spec/1.0/schema.mdx)).

The table rates each standard carrier against the spec's own semantics.

| Carrier | Spec semantics | Fit for a decision result |
|---|---|---|
| `RUN_FINISHED.result` (+ `usage`) | "The run's return value", any JSON; SHOULD be absent on cancel ([lifecycle](https://docs.ag-ui.com/spec/1.0/events/lifecycle.md)) | **Honest fit**, untyped, arrives once at the end |
| `RUN_FINISHED.outcome` | Closed union `success`/`interrupt`/`cancelled`; producers MUST NOT invent values ([lifecycle](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/spec/1.0/events/lifecycle.mdx)) | Impossible as a payload carrier |
| `RUN_ERROR` | Failure; consumers MUST NOT report success; `code` is an open string ([lifecycle](https://docs.ag-ui.com/spec/1.0/events/lifecycle.md)) | Correct for decision **failures** only |
| `SUBAGENT_FINISHED.result` | "Any JSON value, mirroring RUN_FINISHED.result" ([1.0 schema](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/spec/1.0/schema.mdx)) | Honest fit when a decision is one step inside a larger agent run |
| `ACTIVITY_SNAPSHOT`/`DELTA` | Structured progress "that is not conversation content", open `activityType`, frontend-only, stripped before sending ([activity](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/spec/1.0/events/activity.mdx); [run-input](https://docs.ag-ui.com/spec/1.0/basic/run-input)) | Best structural fit (native object); a semantic stretch for a return value; fine as a display mirror |
| `STATE_SNAPSHOT`/`DELTA` | Shared run-scoped state; snapshot "replaces the agent state wholesale" ([concepts/events](https://docs.ag-ui.com/concepts/events)) | Misuse: answers clobber or pollute app state |
| `TOOL_CALL_*` (+ `TOOL_CALL_RESULT`) | Args "conventionally JSON" but carried as text; a frontend tool call MUST NOT be answered by the producer ([tool-calls 1.0](https://docs.ag-ui.com/spec/1.0/events/tool-calls)) | Workable convention; JSON-in-a-string; leaves a pending call |
| `TEXT_MESSAGE_*` (JSON content) | Conversation text; no JSON content part exists in 1.0 ([tool-calls 1.0](https://docs.ag-ui.com/spec/1.0/events/tool-calls)) | Misuse: the answer becomes a chat message resent to the model |
| `MESSAGES_SNAPSHOT` | The complete message set the producer owns | Only a wrapper for one of the above |
| Interrupt `responseSchema` | Agent asks the client a question; the answer returns via the next run's `resume` ([interrupt-resume](https://docs.ag-ui.com/spec/1.0/basic/patterns/interrupt-resume)) | **Inverse direction**; pauses the run |
| `REASONING_*` | Model rationale text | Only for an optional rationale; Jev returns none |
| `STEP_*`, `RAW`, `metadata` | Step markers; untranslated passthrough consumers MUST NOT derive behaviour from; "extra information" merged last-write-wins ([passthrough](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/spec/1.0/events/passthrough.mdx); [concepts/events](https://docs.ag-ui.com/concepts/events)) | Not a primary carrier; metadata suits auxiliary fields |

The interrupt row is worth a second look because `responseSchema` resembles a typed decision on the surface. It is "a JSON Schema describing the answer this interrupt expects, so a consumer can build a form for it". There, the agent asks the human. A decision call is the opposite: the client asks the model. Routing it through an interrupt would pause a run that the client must then `resume`, and every interrupt must be covered before a new run starts ([interrupt-resume](https://docs.ag-ui.com/spec/1.0/basic/patterns/interrupt-resume)). Interrupts are useful only as precedent: AG-UI is willing to carry a JSON Schema opaquely inside protocol data.

## Hashbrown core reads none of the honest slots today

Hashbrown's chat runtime consumes AG-UI as three things: canonical message history, shared state and run lifecycle. Everything outside those is validated and then dropped. The HTTP transport POSTs JSON and **requires a `text/event-stream` response. Any other content type is a non-retryable `TransportError`** (`packages/core/src/transport/http-transport.ts:132-140, 170-175`). Each SSE frame is validated with AG-UI's `EventSchemas.parse` (`http-transport.ts:329-338`). The run driver enforces the lifecycle: `RUN_STARTED` first, with matching ids, and a terminal `RUN_FINISHED` or `RUN_ERROR` last (`packages/core/src/transport/ag-ui-run-driver.ts:203-292`). The canonical-messages reducer sends unknown event types to `default: return messages` (`packages/core/src/reducers/ag-ui-messages.reducer.ts:239-294, 314-423`).

The per-event picture determines what each carrier would cost:

- **`RUN_FINISHED.result` is never read.** The terminal event is kept on the attempt only so that `outcome` can be read (`packages/core/src/effects/generate-message.effects.ts:179-183, 597-602`).
- **`ACTIVITY_SNAPSHOT`/`ACTIVITY_DELTA` are an explicit no-op** (`ag-ui-messages.reducer.ts:325-327`). `activity`-role messages that arrive in a `MESSAGES_SNAPSHOT` stay in canonical history and are resent on later runs, but projection never surfaces them to hooks (`packages/core/src/reducers/ag-ui-message-history.ts:486-578`).
- **`STEP_*`, `RAW` and `CUSTOM` fall to `default` in every reducer** (`ag-ui-messages.reducer.ts:420-421`; `packages/core/src/reducers/status.reducer.ts:127-128`).
- **Events that do reach hooks:**
  - `TEXT_MESSAGE_*`, as `messages[].content`, Skillet-resolved when a `responseSchema` is set, with event `metadata` merged onto the message (`ag-ui-messages.reducer.ts:328-361, 1034-1059`).
  - `STATE_SNAPSHOT`/`DELTA`, as the `state` signal, drafted and then committed or rolled back (`packages/core/src/reducers/agent-state.reducer.ts:85-88, 167-202`).
  - `REASONING_*`, as `messages[].reasoning` (`ag-ui-message-history.ts:502-506`).
  - Tool calls the client does not define, as `serverToolCalls` (`packages/core/src/models/internal_helpers.ts:176-216`).
  - The interrupt outcome, as `pendingInterrupts` (`generate-message.effects.ts:228-251`).

**Hashbrown does not conform to 1.0 today.** `validateInterruptOutcome` accepts only an absent outcome, `success` or `interrupt`. It throws a non-retryable `PROTOCOL_ERROR` on any other type, **including AG-UI 1.0's own `cancelled` outcome** (`packages/core/src/transport/interrupt-validation.ts:14-60`). An AG-UI decision endpoint that honours client cancellation could therefore surface as a protocol error inside the chat runtime. A related point needs verification: Hashbrown's request extension is a top-level `hashbrown` key on `RunAgentInput`, a sibling of the declared fields, while `forwardedProps` and `context` are always sent empty (`packages/core/src/transport/hashbrown-run-agent-input.ts:43-53, 72-91`). Given the 1.0 schema's exact-object rule, a strictly validating third-party producer could reject that key ([schema.json](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/spec/1.0/schema.json)). That is an inference from the schema text and has not been tested. It argues for putting any new decision request in `forwardedProps`, which is opaque by specification, rather than adding another sibling key.

Measured against core's code alone, the cheapest carrier is **the assistant `TEXT_MESSAGE` path**. The structured-completion machinery already exists. A Skillet `responseSchema` goes out as `hashbrown.responseSchema` (`generate-message.effects.ts:447-449, 519-528`). The OpenAI adapter maps it to strict `json_schema` (`packages/openai/src/stream/text.fn.ts:113-128`). Assistant content is Skillet-resolved on the client (`packages/core/src/utils/resolve-with-schema.ts:5-16`). `useStructuredCompletion` derives `output` from the first assistant message (`packages/react/src/hooks/use-structured-completion.tsx:201-232`). A `useDecision` built on that path inherits debounce, retries, abort, draft/commit/rollback and threadId handling unchanged (`packages/core/src/effects/logical-run-coordinator.ts:104-178`). Probabilities could ride in the JSON or in `TEXT_MESSAGE_END` metadata, which already reaches `messages[].metadata`.

The other carriers cost more:

- **`RUN_FINISHED.result`** needs the next-smallest change. Copy `terminalEvent.result` into a new slice inside `finishAttempt` (`generate-message.effects.ts:161-226`), roll it back with the attempt, validate it with Skillet and expose a signal.
- **A server tool call named `decision`** displays today as `serverToolCalls`. If the server omits `TOOL_CALL_RESULT` in the same run, core treats the call as a pending client tool, rejects it with "Tool decision not found" and **starts a continuation run** (`generate-message.effects.ts:184-219`; `packages/core/src/effects/tool-turn-coordinator.ts:53-65`). Its args are only `JSON.parse`d, never Skillet-validated.
- **`STATE_SNAPSHOT`** replaces the whole draft state, and `setState` is locked while a generation runs (`packages/core/src/chat-runtime.ts:353-372`). Answers would collide with the decision's own input state.
- **`ACTIVITY_*`** is the largest change: new reducer cases, a new view field and round-trip lowering.

## Ecosystem precedent points to `result`, not to chat or state

No AG-UI integration has standardized typed final results. The clearest precedent for `result` is **the Claude Agent SDK adapter, which emits `RUN_FINISHED` with `result: { isError, durationMs, numTurns, totalCostUsd, usage, structuredOutput }`**. That envelope puts the SDK's `structured_output` in the field the spec calls the return value ([TS adapter](https://github.com/ag-ui-protocol/ag-ui/blob/main/integrations/claude-agent-sdk/typescript/src/adapter.ts); [Python adapter](https://github.com/ag-ui-protocol/ag-ui/blob/main/integrations/claude-agent-sdk/python/ag_ui_claude_sdk/adapter.py)), and an open follow-up treats it as an extensible "run result envelope" ([issue #2631](https://github.com/ag-ui-protocol/ag-ui/issues/2631)). The community has also stated the division of labour plainly. A Mastra proposal puts finish reason in `RUN_FINISHED.metadata` because outcome "names only success, interrupt and cancelled… `result` is the run's return value", while metadata is "extra information" ([issue #2877](https://github.com/ag-ui-protocol/ag-ui/issues/2877)). The reference client agrees: `@ag-ui/client` declares `RunAgentResult { result: any; newMessages: Message[] }` as the return of `runAgent()`, and `onRunFinishedEvent` receives `result`. A Hashbrown decision endpoint built on `result` would therefore work with any AG-UI client and no extra code. Downstream, TanStack AI's `RunFinishedEvent` extends the same type ([TanStack AI](https://tanstack.com/ai/latest/docs/reference/interfaces/RunFinishedEvent.md)).

The other frameworks split across every carrier:

- **Pydantic AI** sends structured `output_type` as an ordinary output-tool call plus `TOOL_CALL_RESULT` and never sets `result` ([Pydantic AI event stream](https://github.com/pydantic/pydantic-ai/blob/main/pydantic_ai_slim/pydantic_ai/ui/ag_ui/_event_stream.py)). Consumers must know the output tool's name.
- **CopilotKit/LangGraph** models structured output as graph output state, read as `agent.state.answer` ([CopilotKit state I/O](https://docs.copilotkit.ai/langgraph/shared-state/state-inputs-outputs)). That channel has a cost: an open issue reports the LangGraph adapter emitting a `STATE_SNAPSHOT` per event ([issue #2600](https://github.com/ag-ui-protocol/ag-ui/issues/2600)).
- **Microsoft Agent Framework** maps tool results to state only when opted in ([MS Learn state management](https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/state-management)).
- **CrewAI** stringifies structured crew output into a tool message ([PR #2271](https://github.com/ag-ui-protocol/ag-ui/pull/2271)).
- **Mastra** uses `result` only for a trace id ([mastra.ts](https://github.com/ag-ui-protocol/ag-ui/blob/main/integrations/mastra/typescript/src/mastra.ts)).

**Google ADK is the closest analogue to a decision model.** A classifier agent with `output_schema` returned `"CHAT"`, which leaked into the transcript as `TEXT_MESSAGE_*`. The fix was to suppress those events entirely, on the grounds that structured output is "intended for inter-agent data transfer, not user-visible chat messages" ([issue #1390](https://github.com/ag-ui-protocol/ag-ui/issues/1390); [ADK changelog](https://github.com/ag-ui-protocol/ag-ui/blob/main/integrations/adk-middleware/python/CHANGELOG.md)). That episode argues directly against the text-message carrier. It also shows the gap: ADK's classifier results now reach the UI through no event at all.

The 1.0 spec closes the `CUSTOM` route on interop grounds. A consumer that does not recognise a name MUST ignore the event, and "A producer MUST NOT rely on a `CUSTOM` event to carry semantics this specification assigns to a standard event" ([passthrough 1.0](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/spec/1.0/events/passthrough.mdx)). CopilotKit's `copilotkit_emit_*` custom events have already broken on a name-prefix mismatch ([issue #1364](https://github.com/ag-ui-protocol/ag-ui/issues/1364)). **Nothing on the roadmap helps.** The open drafts are Generative UI, a tool-call-based `generateUserInterface` with an `output` description ([generative-ui draft](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/drafts/generative-ui.mdx)), and Meta Events for after-the-fact feedback ([meta-events draft](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/drafts/meta-events.mdx)). The nearest typed-payload work is a still-open request for a structured field on `TOOL_CALL_RESULT` ([issue #1593](https://github.com/ag-ui-protocol/ag-ui/issues/1593)). Searches of AG-UI issues and discussions found no mention of decision models, per-option probabilities or confidence. A typed decision envelope would be greenfield. Hashbrown would set the convention, not follow one.

## Every AG-UI carrier costs more than plain JSON for a one-shot answer

The plain-JSON protocol matches a decision call's actual shape. A decision is one POST with `state` and typed questions, and one `application/json` body with answers. Jev's native API and Vercel's `/v1/evaluate` share that shape and do not stream, and that was the basis for the team's choice ([TypeSafe API reference](https://docs.typesafe.ai/api.md); [Vercel Decision docs](https://vercel.com/docs/ai-gateway/modalities/decision)). Every AG-UI carrier adds an SSE envelope around the same answer. The best case is the degenerate but conformant stream `RUN_STARTED, RUN_FINISHED{result, usage}` or `RUN_STARTED, RUN_ERROR`. The table compares each carrier with that baseline.

| Option | Typed answers + probabilities + confidence | Pollutes chat/state? | Core change to consume | Generic AG-UI client can read it | Verdict vs plain JSON |
|---|---|---|---|---|---|
| **Plain JSON (chosen)** | Native body | No | New small client (no SSE) | No | **Default** |
| `RUN_FINISHED.result` | Inside an application envelope | No | Read `result` (small); or a standalone transport reusing the SSE parser and run driver | **Yes, via `runAgent()`** | **Only acceptable AG-UI mirror** |
| `SUBAGENT_FINISHED.result` | Same | No | Subagent handling not traced in core | Yes | Use only when a decision is a step inside an agent run |
| `ACTIVITY_SNAPSHOT` (`hashbrown.decision`) | Native object | Persists as a frontend-only message | Largest (reducers, projection, lowering) | Must tolerate an unknown type | Optional later display mirror, not the result |
| `TEXT_MESSAGE_*` JSON | Inside a string; probabilities need schema room or metadata | **Yes, resent to the model** | None | As text only | Rejected; ADK's lesson |
| `TOOL_CALL_*` | JSON-in-a-string args | Leaves a pending call | None to display; triggers a continuation run if no result | Must know the tool name | Rejected |
| `STATE_*` | Under a `state.decision` convention | **Yes, overwrites state** | None | Yes, as state | Rejected |
| Interrupt `responseSchema` | Wrong direction | Pauses the run | — | — | Impossible |
| `REASONING_*`, `STEP_*`, `RAW`, `MESSAGES_SNAPSHOT` | No | — | — | — | Impossible or wrapper only |
| `metadata` | Auxiliary only | Merged last-write-wins | Already merged on messages | Yes | For latency and model version only |

Three costs separate even the best AG-UI option from plain JSON. **Framing:** a single result needs an event-stream content type, two or more frames and lifecycle validation, and Hashbrown's own HTTP transport cannot read a JSON response (`http-transport.ts:170-175`). **Error semantics:** plain JSON can use HTTP status codes. AG-UI failures arrive as `RUN_ERROR` inside a 200 stream, with no error vocabulary in the protocol ("the protocol defines no vocabulary") ([lifecycle](https://docs.ag-ui.com/spec/1.0/events/lifecycle.md)). **Typing:** AG-UI adds none. The decision schema lives entirely in Hashbrown either way.

AG-UI's gains are real but conditional. A server that already exposes AG-UI agents gets one endpoint, one auth path and one middleware stack. Standard `TokenUsage` reporting, `threadId`/`runId` correlation and cancellation outcomes come for free. Non-Hashbrown AG-UI clients, such as CopilotKit or TanStack AI, could consume decisions through the reference client's `result`. The steelman for the text-message path also deserves a fair hearing. Inside an existing chat runtime it costs zero core change and inherits all of structured completion's machinery. That benefit belongs to a chat feature, though. A decision exposed as an assistant message would be resent to the model on later turns, and ADK users rejected exactly that behaviour.

## Build a thin AG-UI DecisionTransport on `RUN_FINISHED.result`

**Recommendation: keep plain JSON as the default and the first transport to ship.** Define an AG-UI mapping now. Build it as a small opt-in `DecisionTransport` beside plain JSON, not through the chat runtime. It should use exactly one result carrier, `RUN_FINISHED.result`. The AG-UI path then becomes a wrapper, not a second protocol: **its `result` equals the plain-JSON response body**, and the server can produce both from the same function. On the client, the transport should reuse core's SSE parser, `EventSchemas` validation and run-driver lifecycle checks, then read the terminal event. It should not go through the canonical-message and state reducers, because a decision must never enter history or state. Two adjacent fixes belong in core regardless, as separate changes. First, accept `outcome: { type: "cancelled" }` as a cancellation rather than a `PROTOCOL_ERROR` (`interrupt-validation.ts:14-60`). Second, decide whether the chat runtime should surface `RUN_FINISHED.result` generally, since the spec calls it the return value and core discards it.

The request uses the required fields, an empty `messages` array and everything decision-specific in `forwardedProps`. Using `forwardedProps` keeps Jev's input state from being confused with AG-UI shared state and avoids another undeclared top-level key:

```json
{
  "threadId": "t_…",
  "runId": "r_…",
  "messages": [],
  "forwardedProps": {
    "hashbrown": {
      "decision": {
        "version": 1,
        "state": { "query": "arrivals into KBOS below 10k" },
        "questions": { "...": "identical to the plain-JSON request's questions map" }
      }
    }
  }
}
```

The response is a two-event stream. `RUN_FINISHED.result` holds the same `{ value, meta }` shape the decision API returns over plain JSON, wrapped with a discriminator, because `result` is `any`. The Claude Agent SDK envelope shows that consumers tolerate a typed object at that position:

```json
{ "type": "RUN_STARTED", "threadId": "t_…", "runId": "r_…" }
{ "type": "RUN_FINISHED", "threadId": "t_…", "runId": "r_…",
  "result": {
    "kind": "hashbrown.decision",
    "version": 1,
    "value": { "intent": "filter", "airport": "KBOS", "clearsFilter": false },
    "meta": {
      "intent":       { "type": "choice",  "probabilities": { "filter": 0.91, "chat": 0.06, "other": 0.03 }, "confidence": 0.88 },
      "airport":      { "type": "choice",  "probabilities": { "KBOS": 0.97, "none": 0.03 }, "confidence": 0.95 },
      "clearsFilter": { "type": "boolean", "probability": 0.08 }
    }
  },
  "usage": [{ "provider": "typesafe-ai", "model": "jev-1.14.0", "inputTokens": 275 }],
  "metadata": { "hashbrown": { "latencyMs": 112 } }
}
```

Three rules keep this envelope safe. `kind` and `version` make the payload self-describing for clients that call `runAgent()` blind, because AG-UI offers no schema id. Failures use `RUN_ERROR` with a namespaced `code` such as `hashbrown.decision.invalid_questions`, never a `result` with an error flag. A cancelled run omits `result`, as the spec requires. The `meta` entry for a boolean question carries a single probability and no confidence, which matches Jev's `noul`/`boolean` answer shape ([Vercel Decision docs](https://vercel.com/docs/ai-gateway/modalities/decision)). Optional extras must stay separate from the result. A vendor-prefixed `ACTIVITY_SNAPSHOT` with `activityType: "hashbrown.decision"` can mirror the result for a "show the stream" panel or transcript persistence once core stops dropping activity events. `SUBAGENT_FINISHED.result` with the same envelope covers a decision made mid-run by a larger agent. Neither should replace `RUN_FINISHED.result` as the canonical answer.

Some questions remain open. The notes do not show whether core handles `SUBAGENT_*` events. Nobody has tested whether a strict 1.0 validator rejects Hashbrown's top-level `hashbrown` key. And no AG-UI consumer yet reads `result` in a typed way beyond returning it.

## Conclusion

The question changed under inspection. "Which AG-UI event carries a decision?" has a one-word answer, `result`. The more useful finding is that AG-UI 1.0 is a lifecycle protocol with an untyped return slot, not a typing layer. Whatever makes decisions type-safe has to live in Hashbrown's envelope and Skillet schemas regardless of the wire. That makes the plain-JSON protocol and the AG-UI mapping two framings of one contract, not competing designs. The engineering rule that follows is to define the decision body once and let the AG-UI transport only wrap it.

The work also exposed Hashbrown's own conformance gaps. Core discards the spec's return value, rejects the spec's `cancelled` outcome and sends an undeclared top-level request key. All three would affect any third-party AG-UI producer, not just decisions. The ecosystem has no convention for typed results, and ADK's classifier outputs currently vanish. A small, documented `hashbrown.decision` envelope on `RUN_FINISHED.result` is therefore a plausible candidate for an AG-UI draft proposal once Hashbrown has run it in production.
