---
Created: 2026-09-02
Author: Hashbrown team
Affects: packages/core, packages/react, packages/angular
---

# AG-UI State and Message Synchronization

## Objective

Make Hashbrown an opinionated but broadly compliant AG-UI client for shared
agent state and message checkpoints. The runtime will own generic shared state,
retain canonical AG-UI message history internally, apply snapshots and JSON
Patch deltas transactionally, and expose the synchronized state consistently
through core, React, and Angular APIs.

This is the first change in a three-PR arc:

1. State and message checkpoint synchronization.
2. Interrupt and resume support.
3. Generic activity snapshot and delta support.

A2UI and MCP Apps adapters are explicitly deferred until after this arc.

## Background

Hashbrown already sends `RunAgentInput` and consumes canonical `AGUIEvent`
streams. The current runtime handles run lifecycle, text, reasoning, tool calls,
retry, cancellation, and tool continuation. However, it currently constructs
each request with empty `state`, `context`, and `forwardedProps`, reconstructs
AG-UI messages from Hashbrown messages for every request, and treats
`STATE_SNAPSHOT`, `STATE_DELTA`, and `MESSAGES_SNAPSHOT` as no-ops.

This is sufficient for an opinionated chat client, but it loses protocol state
needed by stateful agents and by future interrupt/resume support. In particular,
AG-UI interrupt boundaries require the client to retain the state and message
snapshots emitted before an interrupted `RUN_FINISHED` event.

Recent extractions of the AG-UI run driver, message accumulator, tool-turn
executor, and retry policy provide suitable seams for adding synchronization
without replacing Hashbrown's runtime with `@ag-ui/client`.

## Goals

- Make shared AG-UI state runtime-owned and reactive.
- Infer a compile-time `State` type from the initial state without adding a
  runtime state schema.
- Send the current committed state with each new AG-UI run.
- Apply `STATE_SNAPSHOT` and the full RFC 6902 `STATE_DELTA` operation set
  without mutating prior state or event inputs.
- Retain complete canonical AG-UI message history, including stable IDs,
  metadata, reasoning, tool results, and roles not projected by Hashbrown.
- Apply `MESSAGES_SNAPSHOT` as an atomic replacement of canonical history.
- Continue exposing Hashbrown's existing opinionated message model as the
  primary public view.
- Publish state and message changes live during a run while committing them
  only at a valid `RUN_FINISHED` boundary.
- Roll back partial synchronization after cancellation, retirement, retry,
  `RUN_ERROR`, transport failure, or protocol failure.
- Expose the same state behavior through all runtime-backed core, React, and
  Angular chat and completion APIs.
- Preserve existing behavior for callers that do not initialize shared state.
- Prepare clean internal seams for interrupt/resume and activities without
  implementing either feature in this PR.

## Non-Goals

- Interrupt outcomes, pending interrupts, or `RunAgentInput.resume`.
- Activity snapshot/delta processing or public activity rendering.
- A2UI or MCP Apps integration.
- Runtime validation of application state against Skillet or Standard JSON
  Schema.
- Application-controlled or externally synchronized state.
- Automatic generation when state changes.
- Implicitly injecting shared state into model prompts.
- Requiring provider adapters to invent state or message snapshots.
- General-purpose APIs for AG-UI `context`, `forwardedProps`, or
  `parentRunId`.
- Publicly exposing canonical AG-UI message history.
- Replacing the current runtime with `@ag-ui/client`.
- Adding a dependency.

## UX / Workflows

### Initialize and update state

Applications may initialize shared state with any runtime-backed API:

```ts
const chat = useChat({
  system: 'Help the user manage the selected account.',
  state: { selectedAccountId: 'account-123' },
});

chat.state;
chat.setState({ selectedAccountId: 'account-456' });
```

`setState()` replaces the complete shared value. It does not start a run.

Application code may not call `setState()` after generation has been scheduled
and before the active transport run reaches a terminal outcome. The method
throws a clear error during that interval because agent deltas are based on the
state captured for the run. The lock ends at the run terminal event. Local tool
execution is outside the lock, allowing application or tool-side state changes
to be included in a continuation run.

### Receive synchronized state

As an agent emits state snapshots and deltas, the public state value updates
reactively. These live values are drafts for the current transport attempt. A
successful `RUN_FINISHED` commits them. A failed, cancelled, retired, or retried
attempt restores the state visible at attempt start.

### Receive message checkpoints

`MESSAGES_SNAPSHOT` replaces the draft canonical history immediately. The
normal Hashbrown message view updates from that history while keeping its
existing public shape. System, developer, and activity messages remain in
canonical history but are omitted from the Hashbrown view. Reasoning and tool
messages are projected into the existing assistant/tool-call representation.

## Data Model & API Changes

### Core runtime

Add a defaulted state generic to `ChatRuntime` and `createChatRuntime`:

```ts
interface ChatRuntime<
  Output,
  Tools extends Chat.AnyTool,
  State = unknown,
> {
  readonly state: StateSignal<State | undefined>;
  setState(state: State): void;

  // Existing members remain unchanged.
}
```

Runtime initialization accepts `state?: State`. The overloads should infer
`State` from this value when it is present and preserve source compatibility
through the `unknown` default when it is absent.

State is not part of `updateOptions()`. It is owned mutable data rather than
runtime configuration.

### React

All runtime-backed chat and completion options accept `state?: State`. Their
results expose:

```ts
{
  state: State | undefined;
  setState(state: State): void;
}
```

This applies to plain, structured, and UI chat/completion hooks. Updating state
does not trigger generation.

### Angular

All runtime-backed chat and completion resource options accept an initial
`state?: State`. Their refs expose:

```ts
{
  readonly state: Signal<State | undefined>;
  setState(state: State): void;
}
```

The initial state is a value, not a `ReactiveOption`, so the runtime remains the
only source of truth.

### Internal agent state

Add an orthogonal state slice with committed and draft values:

```ts
interface AgentStateState<State = unknown> {
  readonly committed: State | undefined;
  readonly draft: State | undefined;
  readonly attemptActive: boolean;
  readonly protocolError: Error | undefined;
}
```

The public selector returns `draft` while an attempt is active and `committed`
otherwise.

The runtime takes ownership of state values by cloning and recursively freezing
JSON container values. Callers and custom transport events cannot mutate stored
state by retaining a reference. Tracked changes must go through `setState()` or
AG-UI synchronization events.

### Canonical AG-UI messages

Add a separate message synchronization slice:

```ts
interface AgUiMessagesState {
  readonly committed: readonly Message[];
  readonly draft: readonly Message[];
  readonly attemptActive: boolean;
  readonly protocolError: Error | undefined;
}
```

Hashbrown messages are lowered into canonical AG-UI messages when they enter the
runtime, not reconstructed for each request. Locally created messages receive a
stable opaque ID at insertion time. Canonical message IDs received from an agent
are preserved.

The canonical reducer processes:

- `MESSAGES_SNAPSHOT`
- text message start/content/end/chunk events
- reasoning message start/content/encrypted-value/end events
- tool call start/args/end/chunk events
- tool call result events

Activity messages contained in `MESSAGES_SNAPSHOT` are retained but not
projected publicly. `ACTIVITY_SNAPSHOT` and `ACTIVITY_DELTA` remain no-ops until
the activities PR.

Canonical history is the source for subsequent `RunAgentInput.messages`.
Hashbrown's current streaming accumulator remains responsible for structured
output parsing and typed tool argument resolution. Its results decorate the
Hashbrown projection rather than replacing canonical protocol history.

### Hashbrown message projection

The public projection keeps existing shapes and behavior:

- User messages project to Hashbrown user messages.
- Assistant messages project with correlated reasoning and tool calls.
- Tool messages settle their corresponding projected tool calls.
- System and developer messages remain canonical but are not shown.
- Activity messages remain canonical but are not shown until the activities
  PR.
- Hashbrown error messages remain local view state and are not invented as
  canonical AG-UI messages.

`setMessages()` lowers and atomically replaces canonical history. It does not
modify shared agent state.

## Core Logic / Algorithms

### Attempt transaction lifecycle

State and message synchronization are transactional per transport attempt.

1. Before sending an attempt, dispatch a begin-attempt action in both slices.
2. Copy the committed state and messages into their draft fields.
3. Expose draft values through the existing signal/store mechanism.
4. Apply incoming synchronization and message lifecycle events to the drafts.
5. On `RUN_FINISHED`, commit both drafts atomically from the orchestration
   layer.
6. On `RUN_ERROR`, cancellation, retirement, transport failure, or protocol
   failure, roll both drafts back to their attempt-start committed values.
7. A retry begins from the same committed checkpoint, preventing partial output
   from the failed attempt from contaminating its request.

PR 2 will treat an interrupt outcome on `RUN_FINISHED` as a valid commit
boundary.

### Request construction

Each new logical run snapshots current canonical history and committed state for
its request. Retries reuse the attempt-start checkpoint rather than rebuilding
input from live partial state.

When the runtime has no initialized state, the in-memory request field is
`undefined` and the HTTP JSON body omits it rather than inventing `{}`. Custom
agents must emit a state snapshot before sending a delta that requires an
existing document.

### State snapshots

`STATE_SNAPSHOT` replaces the complete draft state with an owned immutable
clone. Multiple snapshots in one attempt are valid; the latest valid snapshot
becomes the new draft baseline.

### State deltas

Implement all RFC 6902 operations:

- `add`
- `remove`
- `replace`
- `move`
- `copy`
- `test`

The internal patch function accepts the current draft and an ordered patch,
clones the document, applies every operation to the working clone, and returns a
new immutable result. If any operation fails, the function discards the working
clone and returns an error without modifying the prior draft.

JSON Pointer handling includes:

- Empty-string root pointers.
- `~0` and `~1` decoding.
- Array indexes and the `-` append token where RFC 6902 permits it.
- Own-property traversal only.
- Existence checks for remove, replace, move, and test targets.
- Prevention of moves into a descendant of the moved value.
- Deep cloning for copy operations.
- Deep JSON equality for test operations.

Object writes use own-property-safe operations so a `__proto__` key is data and
cannot mutate an object's prototype. Traversal never follows inherited
properties.

### Message snapshots and streaming events

`MESSAGES_SNAPSHOT` clones and replaces the complete draft message list.
Subsequent lifecycle events update compatible messages by stable ID or create a
new message when the event permits it. An event that targets an existing message
with an incompatible role produces a protocol error instead of corrupting the
message.

The projection must reconcile snapshot content and subsequent streaming events
by ID rather than blindly appending another assistant message at run completion.

## Error Handling

State patch or canonical message application can produce a synchronization
protocol error. Examples include:

- Invalid JSON Pointer syntax.
- Missing required patch targets.
- Illegal array indexes.
- A failed `test` operation.
- An invalid `move` relationship.
- An event targeting an incompatible canonical message role.
- A non-cloneable value supplied by a custom in-process transport.

When event application reports a protocol error, orchestration must:

1. Stop consuming and dispose the active event stream.
2. Roll state and messages back to the attempt checkpoint.
3. Surface a non-retryable protocol error through the existing generation error
   API.
4. Preserve the last committed state and history for application recovery.

HTTP event schema failures already occur at the transport boundary and follow
the same rollback behavior. Provider `RUN_ERROR`, user cancellation, thread
retirement, and retryable transport failures also roll back, but retain their
existing error/status semantics.

## Telemetry / Observability

No new external telemetry is required.

The internal store/devtools projection should include synchronized state and
enough attempt status to diagnose whether the displayed value is committed or
draft. It should not duplicate entire canonical message history if that would
make devtools payloads impractical; the public Hashbrown message projection
remains the default diagnostic view.

## Backward Compatibility

- Existing callers remain source-compatible because `State` defaults to
  `unknown` and all new options are optional.
- Existing Hashbrown message types and hook/resource result behavior remain
  unchanged apart from the additive state members.
- Existing callers that do not initialize state do not gain a synthetic
  application state value.
- Stable canonical IDs replace per-request ID reconstruction, but message IDs
  remain opaque to existing public APIs.
- `STATE_SNAPSHOT`, `STATE_DELTA`, and `MESSAGES_SNAPSHOT` change from ignored
  events to meaningful protocol events.
- Direct provider adapters continue to derive model requests from supported
  message and tool content. They do not implicitly serialize shared state into
  prompts.
- No migration or feature flag is required.

## Permissions / Security

- State and messages remain data; this design introduces no code execution.
- Event values are cloned before ownership transfer.
- JSON Patch traversal uses own properties only and does not permit prototype
  chain traversal or mutation.
- Patch application is atomic, preventing partially applied untrusted deltas.
- The state lock prevents local writes from racing agent-authored deltas.
- Custom transports are treated as untrusted protocol producers and receive the
  same validation and rollback behavior as HTTP streams.

## Rollout / Migration

This design is delivered as the first PR in the long-arc sequence.

1. Add failing tests for JSON Patch and transaction behavior.
2. Add the pure JSON Patch utility.
3. Add transactional agent-state and canonical-message reducers.
4. Lower initial/local Hashbrown messages once and preserve canonical IDs.
5. Route AG-UI events through synchronization reducers and coordinate
   commit/rollback in generation orchestration.
6. Build `RunAgentInput` from canonical messages and committed state.
7. Add core public state APIs.
8. Propagate state generics and APIs through React and Angular chat/completion
   surfaces.
9. Update API reports and user documentation.
10. Run full affected-package verification before merge.

The interrupt PR begins only after this PR is merged or its contract is stable.
The activity PR follows interrupt support. Discoveries may refine later specs,
but must not weaken this PR's committed checkpoint semantics.

## Testing

Tests use top-level `test(...)` with arrange/act/assert sections separated by
blank lines.

### Core unit tests

- Every RFC 6902 operation.
- JSON Pointer root, escaping, array, and append behavior.
- Own-property and prototype-pollution cases.
- Atomic rollback when any patch operation fails.
- Snapshot replacement and defensive ownership.
- Generic state initialization and manual replacement.
- Rejection of `setState()` while generation is scheduled or active.
- State updates allowed during local tool execution.
- Canonical lowering with stable IDs.
- Message snapshot preservation for every AG-UI role and metadata field.
- Projection of assistant, reasoning, tool calls, and tool results.
- Retention without public projection of activity messages.
- Compatible lifecycle updates by stable message ID.
- Protocol failure for incompatible role/ID updates.
- Live draft publication and successful commit.
- Rollback after cancellation, retirement, `RUN_ERROR`, protocol failure, and
  retryable transport failure.
- Retry input uses the committed checkpoint rather than failed draft state.
- Outbound requests contain canonical messages and current committed state.
- Inputs, events, prior reducer state, and patch values are not mutated.

### Framework tests

React and Angular tests cover:

- State generic inference from initialization.
- Initial state exposure.
- Reactive snapshot and delta updates.
- Manual `setState()`.
- No automatic generation after state changes.
- Rejected state writes during generation.
- Consistency across plain, structured, and UI chat/completion APIs.

### Integration and compatibility tests

- Core HTTP e2e streams state snapshots, deltas, and message snapshots through
  the real SSE parser and transport.
- Multi-attempt tests prove draft rollback before retry.
- Tool continuation tests prove state changed during local tool execution is
  included in the continuation request.
- Package-shape and API-report tests catch export and generic regressions.
- Existing provider integration tests remain green.

### Required verification

- `npx nx build core`
- `npx nx test core`
- `npx nx e2e core`
- `npx nx lint core`
- `npx nx build-api-report core`
- Applicable build, test, lint, e2e, and API-report targets for `react` and
  `angular`, reporting unavailable targets rather than silently skipping them.
- Documentation tests/build when public guides change.
- Formatting and diff-integrity checks.

## Open Questions

None for PR 1. Interrupt-specific resume validation and activity identity rules
belong to their respective follow-up designs.
