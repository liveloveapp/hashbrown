# Surface server-executed tool calls on assistant messages

## Problem and scope

A Hashbrown assistant message lists only the tool calls whose name matches a
tool the client registered. Calls the agent server executes itself (B4 tools,
provider-hosted tools) are tracked internally but dropped by the view
projection, and their arguments are never parsed because the accumulator
resolves arguments only against a registered tool's schema. A client that
wants to paint from a server call's streamed arguments, as the invoicing
example now does, must register a throwing fake tool and strip it from the
wire. Expose those calls, with progressively resolved arguments, as an
additive field. Execution is unchanged: the client never runs them.

## Design

**Public shape.** `AssistantMessage` gains an optional readonly
`serverToolCalls: readonly ServerToolCall[]`. A `ServerToolCall` is a plain
JSON-typed record, independent of the chat's `Tools` generic:
`toolCallId`, `name`, `status`, `args` (the resolved JSON value so far, or
`null` before anything parses), `result` (a `PromiseSettledResult` once
complete), and `progress`, `encryptedValue` and `metadata` when present.
`status` follows the three states the ecosystem converged on: `inProgress`
while argument deltas arrive, `executing` once the arguments are complete and
no result has arrived, `complete` after the result. The name follows the
docs' existing contrast between client-side and server-side tool calling.

**Accumulator.** Argument deltas for a call with no registered tool now feed
a schemaless streaming parse, so `argumentsResolved` grows as JSON completes,
exactly as the schema path does for registered tools. `TOOL_CALL_END`
finalizes that parse and records `argumentsComplete: true` on the internal
tool call; `TOOL_CALL_RESULT` marks it done as today. Registered tools are
untouched.

**View projection.** `toViewMessagesFromInternal` routes each internal tool
call whose name is not a registered tool to `serverToolCalls` instead of
dropping it; `toolCalls` keeps exactly its current contents and typing, so
consumers that narrow on tool names, and `useCompletion`'s "no tool calls
means final answer" rule, are unaffected. Thread hydration already retains
unknown calls internally, so they surface there too. React and Angular
inherit the field through the shared types; the UI chat message types extend
`AssistantMessage`, so no per-framework change is needed.

## Alternatives

- Widen `toolCalls` with a `name: string` member: breaks every consumer that
  narrows on tool names and the completion hook's rule. Rejected.
- Leave it to applications, as the invoicing example does: a fake tool with a
  throwing handler and a transport that hides it from the server. Works, but
  every consumer would repeat it. Rejected.

## Verification

Accumulator: an unregistered call's arguments resolve progressively across
chunk boundaries; `TOOL_CALL_END` finalizes and sets `argumentsComplete`;
malformed JSON leaves `args` undefined without raising a stream error;
registered tools behave exactly as before. Projection: an unregistered
pending call becomes an `inProgress` entry with partial args, `executing`
after completion, `complete` with its result; registered calls stay in
`toolCalls` only; a message with no server calls omits the field. Then the
invoicing example drops its fake tool in a follow-up. Build, test, lint and
the API report for core; build for react and angular.
