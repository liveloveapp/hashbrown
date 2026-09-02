# AG-UI State and Message Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add runtime-owned, transactional AG-UI shared state and canonical message synchronization to core, React, and Angular without changing existing Hashbrown message shapes.

**Architecture:** Add two orthogonal core store slices: one owns committed/draft JSON state and one owns committed/draft canonical AG-UI messages plus the app-owned system overlay. Keep the current Hashbrown messages, tool-call entities, and streaming accumulator as a compatibility projection cache, but build every outbound request from canonical history and committed state. Coordinate attempt begin, commit, rollback, retry, cancellation, retirement, and tool continuation in the generation effect so both synchronization domains cross each boundary together.

**Tech Stack:** TypeScript, `@ag-ui/core` 0.0.59, immutable reducers, RFC 6902 JSON Patch, Hashbrown micro-ngrx signals/effects, Jest, Vitest, React, Angular signals/resources, Nx, API Extractor

---

## Scope and implementation rules

- This plan implements PR 1 only. Interrupt/resume, activity event handling, A2UI, and MCP Apps remain out of scope.
- Use @superpowers:test-driven-development for every behavior change: add one focused failing test, observe the expected failure, add the smallest implementation, and rerun the test.
- Use top-level `test(...)` only. Keep arrange/act/assert sections separated by blank lines.
- Do not add dependencies. Use the existing AG-UI types and platform APIs.
- Do not mutate inputs, reducer state, snapshots, deltas, metadata, tool calls, or patch values.
- Add TSDoc to every new exported or reusable symbol. Internal cross-package exports must use the `ɵ` prefix; this design should not require a new cross-package helper.
- Commit after each task. Do not include unrelated working-tree changes.

## File map

### Core protocol utilities

- Create `packages/core/src/utils/json-value.ts`: validate, clone, and recursively freeze optional JSON-compatible state.
- Create `packages/core/src/utils/json-value.spec.ts`: JSON compatibility, ownership, and immutability tests.
- Create `packages/core/src/utils/json-patch.ts`: immutable, atomic RFC 6902 application with explicit absent-root semantics.
- Create `packages/core/src/utils/json-patch.spec.ts`: operation, pointer, array, root, equality, and security tests.
- Modify `packages/core/src/utils/index.ts`: internal exports used by reducers.

### Core synchronization state

- Create `packages/core/src/reducers/agent-state.reducer.ts`: committed/draft state, write lock, snapshots, deltas, and protocol errors.
- Create `packages/core/src/reducers/agent-state.reducer.spec.ts`: state transaction and lock tests.
- Create `packages/core/src/reducers/ag-ui-message-history.ts`: local lowering, canonical cloning, system overlay, and Hashbrown projection helpers.
- Create `packages/core/src/reducers/ag-ui-message-history.spec.ts`: stable IDs, role preservation, system overlay, reasoning correlation, and projection tests.
- Create `packages/core/src/reducers/ag-ui-messages.reducer.ts`: committed/draft canonical history and lifecycle-event reconciliation.
- Create `packages/core/src/reducers/ag-ui-messages.reducer.spec.ts`: snapshot/event transaction and protocol-error tests.
- Modify `packages/core/src/reducers/messages.reducer.ts`: make the existing Hashbrown projection cache attempt-aware and reconcile assistant messages by canonical ID.
- Modify `packages/core/src/reducers/tool-calls.reducer.ts`: rebuild/replace tool-call projections on canonical snapshots and keep local results compatible.
- Modify `packages/core/src/reducers/streaming-message.reducer.ts`: reset on rollback and expose the canonical streaming message ID for reconciliation.
- Modify `packages/core/src/reducers/index.ts`: register slices and expose committed/draft/effective selectors.
- Modify `packages/core/src/reducers/index.spec.ts`: combined-state, selector, projection, and devtools coverage.
- Modify `packages/core/src/models/internal.models.ts`: attach opaque canonical IDs to internal projected messages.
- Modify `packages/core/src/models/internal_helpers.ts`: lower and project IDs without exposing them publicly.

### Core orchestration and API

- Modify `packages/core/src/actions/dev.actions.ts`: carry initial/manual state and pre-lowered canonical messages.
- Modify `packages/core/src/actions/api.actions.ts`: allow successful runs without an assistant message.
- Modify `packages/core/src/actions/internal.actions.ts`: add attempt begin/rollback and logical-settlement actions.
- Modify `packages/core/src/effects/generate-message.effects.ts`: coordinate locks, checkpoints, protocol errors, retries, no-output success, and canonical requests.
- Modify `packages/core/src/effects/generate-message.effects.spec.ts`: lifecycle, retry, system update, tool continuation, and no-output tests.
- Modify `packages/core/src/effects/tools.effects.ts`: append owned canonical tool-result messages before continuation.
- Modify `packages/core/src/effects/tools.effects.spec.ts`: tool-result history and continuation-state tests.
- Modify `packages/core/src/transport/hashbrown-run-agent-input.ts`: accept canonical messages and optional committed state directly.
- Modify `packages/core/src/transport/hashbrown-run-agent-input.spec.ts`: canonical identity and state serialization tests.
- Modify `packages/core/src/transport/ag-ui-run-driver.spec.ts`: prove reducer callback failures dispose the stream.
- Modify `packages/core/src/transport/http-transport.spec.ts`: prove undefined state is omitted from the real JSON request body.
- Modify `packages/core/src/chat-runtime.ts`: add the `State` generic, state signal, setter, validation, and devtools projection.
- Create `packages/core/src/chat-runtime.spec.ts`: public state API, synchronous failure, and type-inference tests.
- Create `packages/core/e2e/ag-ui-synchronization.e2e.spec.ts`: built-package HTTP/SSE state and message synchronization.
- Modify `packages/core/e2e/package-shape.e2e.spec.ts`: packed-package generic/API compatibility.

### React

- Modify `packages/react/src/hooks/use-chat.tsx` and `packages/react/src/hooks/use-chat.spec.tsx`: initial state, state signal, setter, and generic inference.
- Modify `packages/react/src/hooks/use-structured-chat.tsx` and `packages/react/src/hooks/use-structured-chat.spec.tsx`: structured state propagation.
- Modify `packages/react/src/hooks/use-completion.tsx`: unstructured completion state API.
- Modify `packages/react/src/hooks/use-structured-completion.tsx`: structured completion state API.
- Modify `packages/react/src/hooks/use-ui-chat.tsx` and `packages/react/src/hooks/use-ui-chat.spec.tsx`: UI chat state generics and delegation.
- Modify `packages/react/src/hooks/use-ui-completion.tsx` and `packages/react/src/hooks/use-ui-completion.spec.tsx`: UI completion state generics and delegation.
- Modify `packages/react/e2e/package-shape.e2e.spec.ts`: installed-package inference and public signature coverage.

### Angular

- Modify all six files in `packages/angular/src/resources/*-resource.fn.ts`: add a plain initial `state` value, expose a `Signal`, and forward `setState` with public `State` generics.
- Modify all six matching resource specs: runtime initialization, reactivity, setter delegation, and non-reactive option behavior.
- Modify `packages/angular/e2e/package-compatibility.e2e.test.mjs`: installed-package inference and public signature coverage.

### Documentation

- Create `www/analog/src/app/pages/docs/react/concept/shared-agent-state.md`.
- Create `www/analog/src/app/pages/docs/angular/concept/shared-agent-state.md`.
- Modify both framework `concept/message-history.md` pages to link canonical message synchronization and shared state.

## Locked implementation invariants

1. `agentState.committed` and `agUiMessages.committed` are the only sources for the next logical run's state and synchronized history.
2. `draft` is publicly visible only while an attempt is active. One success action commits both slices; rollback actions restore both slices.
3. The existing Hashbrown message/tool reducers are projection caches only. They never build outbound AG-UI history.
4. A logical generation owns one captured request checkpoint across all retries. A retry does not read live state, messages, or a newly updated system prompt.
5. `setState()` is locked synchronously by actions that schedule generation, remains locked through retry/backoff, and unlocks before local tools execute.
6. The system prompt is a stable-ID overlay. Snapshots and `setMessages()` replace synchronized history without deleting that overlay.
7. A protocol reducer error is converted to a non-retryable `TransportError`, disposes the stream, rolls back both drafts, and preserves committed values.
8. A valid `RUN_FINISHED` can succeed with synchronization events only or with no output.
9. Tool execution is attempt-scoped: only pending tool-call IDs absent from the attempt-start checkpoint and still pending at successful finish are eligible.

### Task 1: Add owned JSON values and atomic RFC 6902 patching

**Required skill:** @superpowers:test-driven-development

**Files:**

- Create: `packages/core/src/utils/json-value.ts`
- Create: `packages/core/src/utils/json-value.spec.ts`
- Create: `packages/core/src/utils/json-patch.ts`
- Create: `packages/core/src/utils/json-patch.spec.ts`
- Modify: `packages/core/src/utils/index.ts`

- [ ] **Step 1: Write failing JSON ownership tests**

Cover primitives, nested arrays/plain objects, caller mutation after cloning, recursive freezing, and rejection of nested `undefined`, sparse arrays, cycles, functions, symbols, bigints, non-finite numbers, dates, maps, sets, and class instances. Include `__proto__` as an own data key.

Use this public-internal shape:

```ts
/** Owns an optional JSON-compatible value without mutating the input. @internal */
export function cloneAndFreezeOptionalJsonValue(
  value: unknown,
): JsonValue | undefined;
```

- [ ] **Step 2: Run the ownership test and verify it fails**

Run: `npx nx test core --runTestsByPath packages/core/src/utils/json-value.spec.ts`

Expected: FAIL because `cloneAndFreezeOptionalJsonValue` does not exist.

- [ ] **Step 3: Implement recursive validation, cloning, and freezing**

Use `Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null`, `Object.keys`, `Object.hasOwn`, and a `Set<object>` for cycle detection. Build objects with `Object.create(null)` or `Object.defineProperty` so `__proto__` remains data. Return primitives unchanged; treat root `undefined` as absence; reject nested `undefined` and array holes with path-aware `TypeError` messages.

- [ ] **Step 4: Run the ownership test and verify it passes**

Run: `npx nx test core --runTestsByPath packages/core/src/utils/json-value.spec.ts`

Expected: PASS.

- [ ] **Step 5: Write failing RFC 6902 tests**

Use the AG-UI delta operation type rather than inventing a public patch API:

```ts
type StateDelta = Extract<
  AGUIEvent,
  { type: EventType.STATE_DELTA }
>['delta'];

/** Atomically applies an AG-UI state delta to an owned JSON document. @internal */
export function applyJsonPatch(
  document: JsonValue | undefined,
  patch: StateDelta,
): JsonValue | undefined;
```

Test `add`, `remove`, `replace`, `move`, `copy`, and `test`; empty-root pointers; `~0`/`~1`; object keys; numeric array indexes; `-` append only where legal; missing targets; invalid leading zeros; out-of-range indexes; move-to-descendant rejection; copy deep ownership; deep JSON equality; `__proto__`; inherited-property rejection; and atomic failure after an earlier successful operation.

Explicit absent-root cases:

```ts
expect(applyJsonPatch(undefined, [{ op: 'add', path: '', value: 1 }])).toBe(1);
expect(() => applyJsonPatch(undefined, [{ op: 'replace', path: '', value: 1 }])).toThrow();
expect(applyJsonPatch({ ready: true }, [{ op: 'remove', path: '' }])).toBeUndefined();
```

- [ ] **Step 6: Run the patch test and verify it fails**

Run: `npx nx test core --runTestsByPath packages/core/src/utils/json-patch.spec.ts`

Expected: FAIL because `applyJsonPatch` does not exist.

- [ ] **Step 7: Implement immutable atomic patching**

Parse pointers once per operation. Clone the input to a mutable working document, apply operations sequentially to that clone, and call `cloneAndFreezeOptionalJsonValue` only after the whole patch succeeds. For `move`, remove first and then resolve the destination against the updated document. Never expose or partially commit the working document on failure.

- [ ] **Step 8: Run both focused utility tests**

Run: `npx nx test core --runTestsByPath packages/core/src/utils/json-value.spec.ts packages/core/src/utils/json-patch.spec.ts`

Expected: PASS.

- [ ] **Step 9: Export the internal utilities and commit**

Export from `packages/core/src/utils/index.ts` for core-internal imports only; do not add them to `packages/core/src/public_api.ts`.

```bash
git add packages/core/src/utils
git commit -m "feat(core): add immutable AG-UI state patching"
```

### Task 2: Add the transactional agent-state reducer

**Required skill:** @superpowers:test-driven-development

**Files:**

- Create: `packages/core/src/reducers/agent-state.reducer.ts`
- Create: `packages/core/src/reducers/agent-state.reducer.spec.ts`
- Modify: `packages/core/src/actions/dev.actions.ts`
- Modify: `packages/core/src/actions/internal.actions.ts`
- Modify: `packages/core/src/reducers/index.ts`
- Modify: `packages/core/src/reducers/index.spec.ts`

- [ ] **Step 1: Add failing reducer tests for initialization and local writes**

Define and test this state:

```ts
export interface AgentStateState {
  readonly committed: JsonValue | undefined;
  readonly draft: JsonValue | undefined;
  readonly attemptActive: boolean;
  readonly stateWriteLocked: boolean;
  readonly protocolError: Error | undefined;
}
```

Add an already-owned `state?: JsonValue` to `devActions.init` and add `devActions.setState({ state: JsonValue | undefined })`. Reducers must never throw for local API validation because the store scheduler surfaces reducer failures asynchronously. Verify initialization and manual writes preserve owned/frozen values and a write action changes only committed state when unlocked. Public synchronous validation and lock enforcement are covered at the runtime boundary in Task 6.

- [ ] **Step 2: Run the reducer test and verify it fails**

Run: `npx nx test core --runTestsByPath packages/core/src/reducers/agent-state.reducer.spec.ts`

Expected: FAIL because the state slice and actions do not exist.

- [ ] **Step 3: Add attempt lifecycle actions and failing transaction tests**

Add these internal actions:

```ts
generationAttemptStarted: emptyProps(),
generationAttemptRolledBack: emptyProps(),
logicalGenerationSettled: emptyProps(),
```

Treat `apiActions.generateMessageSuccess` as the single successful commit action. Test begin-copy, live `STATE_SNAPSHOT`, live `STATE_DELTA`, success commit, rollback, cancellation, silent retirement, terminal generation error, and protocol-error preservation of committed state. Add explicit cases where `sendMessage`, `setMessages`, and `resendMessages` arrive during an active attempt: the same action must discard the draft back to committed state before establishing the new logical-generation lock, without allowing a later rollback from the retired attempt to overwrite the superseding action.

- [ ] **Step 4: Add failing lock-lifecycle tests**

Verify these transitions:

- `init` with a trailing user message, `sendMessage`, `setMessages`, and `resendMessages` lock synchronously.
- `toolTurnSettled({ continuation: 'continue' })` locks synchronously.
- `generationAttemptRolledBack` does not unlock.
- `generateMessageSuccess`, terminal `generateMessageError`, `stopMessageGeneration`, `generationSilentlyRetired`, and `logicalGenerationSettled` unlock.
- `toolTurnSettled({ continuation: 'stop' })` leaves the lock released.
- a local state action is ignored defensively if it somehow reaches the reducer while locked; the public `setState()` method performs the required synchronous throw before dispatch.

- [ ] **Step 5: Implement the pure reducer and selectors**

Handle only state-domain behavior. On an invalid incoming snapshot or delta, keep the previous draft and set `protocolError`; do not throw from the reducer. For superseding message actions, abandon the active draft and clear its protocol error before locking the new logical generation. Export selectors for committed state, visible state (`draft` while active), write lock, and protocol error.

Register the slice as `agentState` in `reducers/index.ts` and include the visible state plus `attemptActive` in the devtools projection tests.

- [ ] **Step 6: Run focused state and combined-reducer tests**

Run: `npx nx test core --runTestsByPath packages/core/src/reducers/agent-state.reducer.spec.ts packages/core/src/reducers/index.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit the state slice**

```bash
git add packages/core/src/actions packages/core/src/reducers/agent-state.reducer.ts packages/core/src/reducers/agent-state.reducer.spec.ts packages/core/src/reducers/index.ts packages/core/src/reducers/index.spec.ts
git commit -m "feat(core): add transactional shared agent state"
```

### Task 3: Add canonical message lowering, ownership, overlay, and projection

**Required skill:** @superpowers:test-driven-development

**Files:**

- Create: `packages/core/src/reducers/ag-ui-message-history.ts`
- Create: `packages/core/src/reducers/ag-ui-message-history.spec.ts`
- Modify: `packages/core/src/models/internal.models.ts`
- Modify: `packages/core/src/models/internal_helpers.ts`

- [ ] **Step 1: Write failing lowering and ownership tests**

Define reusable internal helpers with TSDoc:

```ts
export interface LowerCanonicalMessagesOptions {
  readonly createId: () => string;
}

/** Lowers Hashbrown view messages once at the runtime boundary. @internal */
export function lowerViewMessagesToAgUi(
  messages: readonly Chat.AnyMessage[],
  options: LowerCanonicalMessagesOptions,
): readonly Message[];

/** Clones and freezes untrusted canonical history. @internal */
export function ownAgUiMessages(
  messages: readonly Message[],
): readonly Readonly<Message>[];
```

Test user, assistant, tool call, fulfilled/rejected tool result, display reasoning, detailed reasoning, metadata, encrypted values, structured content serialization, omission of local error messages, input ownership, and stable IDs returned by the supplied ID factory. Verify no request-time ID reconstruction is needed.

- [ ] **Step 2: Run the history test and verify it fails**

Run: `npx nx test core --runTestsByPath packages/core/src/reducers/ag-ui-message-history.spec.ts`

Expected: FAIL because the history helpers do not exist.

- [ ] **Step 3: Implement lowering and canonical ownership**

Preserve all AG-UI message fields by cloning instead of enumerating only known metadata fields. Use one generated ID per locally created message; preserve tool-call IDs independently. Add `readonly id?: string` to `Chat.Internal.UserMessage`, `AssistantMessage`, and `ErrorMessage` only for projection reconciliation; canonical messages themselves always have required stable IDs. Keeping the cache field optional lets locally produced errors and transitional streaming values remain compatible. Keep public view types unchanged.

- [ ] **Step 4: Write failing system-overlay tests**

Add these helpers:

```ts
/** Creates or updates the app-owned system overlay without changing its ID. @internal */
export function createSystemMessage(
  id: string,
  content: string,
): Readonly<SystemMessage>;

/** Applies one system overlay to synchronized history without duplication. @internal */
export function applySystemMessageOverlay(
  messages: readonly Readonly<Message>[],
  systemMessage: Readonly<SystemMessage> | undefined,
): readonly Readonly<Message>[];
```

Test insertion when absent, replacement in place when the same ID is echoed by a snapshot, retention of other system/developer messages, no duplicate insertion, immutable input, and clearing only when the configured system value is empty according to the existing request behavior.

- [ ] **Step 5: Write failing canonical-to-Hashbrown projection tests**

Use a result that keeps protocol messages separate from projection data:

```ts
export interface AgUiMessageProjection {
  readonly messages: readonly Chat.Internal.Message[];
  readonly toolCalls: readonly Chat.Internal.ToolCall[];
}

/** Projects canonical history into Hashbrown's existing message model. @internal */
export function projectAgUiMessages(
  messages: readonly Readonly<Message>[],
  toolsByName: Readonly<Record<string, Chat.Internal.Tool>>,
  responseSchema?: s.HashbrownType,
): AgUiMessageProjection;
```

Test omission of system/developer/activity roles; user/assistant projection; tool call/result stitching; fulfilled versus errored results; structured response parsing; tool argument parsing; metadata/encrypted values; and reasoning correlation. Reasoning tests must prove that only a contiguous reasoning sequence folds into the next assistant, that every non-reasoning/non-assistant role closes the sequence, and that trailing reasoning remains canonical but is absent from the settled view.

- [ ] **Step 6: Implement overlay and projection helpers**

Reuse `Chat.helpers` where it preserves behavior, but keep all AG-UI-specific ordering and ID rules in `ag-ui-message-history.ts`. Do not expose canonical history publicly. Unknown future message fields must survive canonical ownership even when the public projection ignores them.

- [ ] **Step 7: Run focused history and helper tests**

Run: `npx nx test core --runTestsByPath packages/core/src/reducers/ag-ui-message-history.spec.ts packages/core/src/models/internal_helpers.spec.ts`

Expected: PASS.

- [ ] **Step 8: Commit the codec and projection**

```bash
git add packages/core/src/reducers/ag-ui-message-history.ts packages/core/src/reducers/ag-ui-message-history.spec.ts packages/core/src/models/internal.models.ts packages/core/src/models/internal_helpers.ts packages/core/src/models/internal_helpers.spec.ts
git commit -m "feat(core): add canonical AG-UI message history"
```

### Task 4: Add transactional canonical message synchronization

**Required skill:** @superpowers:test-driven-development

**Files:**

- Create: `packages/core/src/reducers/ag-ui-messages.reducer.ts`
- Create: `packages/core/src/reducers/ag-ui-messages.reducer.spec.ts`
- Modify: `packages/core/src/actions/dev.actions.ts`
- Modify: `packages/core/src/actions/internal.actions.ts`
- Modify: `packages/core/src/reducers/index.ts`
- Modify: `packages/core/src/reducers/messages.reducer.ts`
- Modify: `packages/core/src/reducers/tool-calls.reducer.ts`
- Modify: `packages/core/src/reducers/streaming-message.reducer.ts`
- Modify: `packages/core/src/reducers/index.spec.ts`
- Modify: `packages/core/src/chat-runtime.ts`

- [ ] **Step 1: Write failing reducer initialization and overlay tests**

Define this minimum state, with lifecycle indexes such as `attemptStartToolCallIds` kept as additional private readonly fields:

```ts
export interface AgUiMessagesState {
  readonly committed: readonly Readonly<Message>[];
  readonly draft: readonly Readonly<Message>[];
  readonly attemptActive: boolean;
  readonly protocolError: Error | undefined;
  readonly systemMessage: Readonly<SystemMessage> | undefined;
}
```

Extend `devActions.init`, `setMessages`, and `sendMessage` to carry canonical messages pre-lowered by the runtime. Extend `updateOptions` with an internal `systemMessage` payload that is present only when `system` is present. Update `createChatRuntime` now to generate one stable system ID and lower initial/manual messages before dispatch; Task 6 adds the public state generic/API on top of this boundary. Test stable overlay initialization, update-in-place, `setMessages()` retaining the overlay, and completion-style repeated `setMessages()` calls without duplicate system messages.

- [ ] **Step 2: Run the canonical reducer test and verify it fails**

Run: `npx nx test core --runTestsByPath packages/core/src/reducers/ag-ui-messages.reducer.spec.ts`

Expected: FAIL because the reducer does not exist.

- [ ] **Step 3: Add failing transaction and snapshot tests**

Test attempt begin, live selector publication, `MESSAGES_SNAPSHOT` replacement, successful commit through `generateMessageSuccess`, rollback, retry rollback followed by a new begin, cancellation, retirement, and terminal error. Verify snapshots retain every AG-UI role and arbitrary metadata, clone event input, and leave the system overlay outside the synchronized replacement. Test the three superseding local actions atomically against an active draft: `sendMessage` abandons the draft then appends to committed synchronized history, `setMessages` abandons then replaces committed synchronized history while retaining the system overlay, and `resendMessages` abandons without changing committed history. Each action must leave the new logical-generation lock active.

At attempt begin, record every tool-call ID present in committed canonical history. Add tests proving the baseline is immutable for that attempt and resets from committed history for each retry attempt.

- [ ] **Step 4: Add failing lifecycle-event tests**

Cover:

- text start/content/end and chunk events;
- reasoning start/content/encrypted-value/end events;
- tool-call start/args/end and chunk events;
- tool-call result events;
- merge/update by stable message and tool-call IDs;
- incompatible role reuse producing `protocolError` without corrupting the draft;
- activity snapshot/delta events remaining no-ops;
- activity messages inside a messages snapshot remaining canonical;
- event and previous-state immutability.

Use a small pure event applicator inside the reducer module:

```ts
function applyCanonicalMessageEvent(
  messages: readonly Readonly<Message>[],
  event: AGUIEvent,
): readonly Readonly<Message>[];
```

Throw only inside this private pure helper; the reducer catches the error and records it as `protocolError`.

- [ ] **Step 5: Implement the canonical reducer and effective selectors**

Register it as `agUiMessages`. Export selectors for committed history, visible draft-or-committed history, effective visible history with the system overlay, effective committed history for requests, attempt-start tool-call IDs, and protocol error. Keep configured-system updates outside the draft so an in-flight commit or rollback cannot overwrite them.

- [ ] **Step 6: Write failing projection-cache reconciliation tests**

Update the existing Hashbrown `messages`, `toolCalls`, and `streamingMessage` tests to prove:

- an attempt uses a draft projection and rollback restores the prior projection;
- a message snapshot replaces the draft projection immediately;
- subsequent streaming updates reconcile the assistant by canonical message ID instead of appending a duplicate;
- success commits the projected assistant when present;
- success with no assistant is a no-op for message history;
- a snapshot rebuilds tool-call entities and removes entities absent from the replacement;
- an agent-emitted `TOOL_CALL_RESULT` immediately settles the matching draft tool-call projection as fulfilled content or rejected error, and rollback restores its attempt-start status;
- local error messages remain view-only and never enter canonical history.
- `sendMessage`, `setMessages`, and `resendMessages` update projection-cache committed/draft values in the same dispatch as their canonical-history behavior, so a retired attempt cannot leak or restore stale projected output.

- [ ] **Step 7: Implement the projection-cache changes**

Add committed/draft handling to `messages.reducer.ts` if needed for local error ordering and rollback. Make `tool-calls.reducer.ts` explicitly attempt-aware as well: begin from committed entities, replace draft entities from message snapshots, update draft entities from tool lifecycle and `TOOL_CALL_RESULT` events, commit on success, and restore on rollback. Project a canonical tool message with `error` as a rejected `PromiseSettledResult`; otherwise use fulfilled `content`. Treat canonical selectors as authoritative for outbound history. Use the accumulator's `messageId` to replace the matching projected assistant in `selectViewMessages`; append only when no matching ID exists. Preserve actual local `PromiseSettledResult` values when `toolTurnSettled` updates committed entities outside the transport attempt.

- [ ] **Step 8: Run all focused reducer tests**

Run:

```bash
npx nx test core --runTestsByPath packages/core/src/reducers/ag-ui-messages.reducer.spec.ts packages/core/src/reducers/messages.reducer.spec.ts packages/core/src/reducers/tool-calls.reducer.spec.ts packages/core/src/reducers/streaming-message.reducer.spec.ts packages/core/src/reducers/index.spec.ts
```

If `messages.reducer.spec.ts` does not yet exist, create it rather than placing all projection-cache behavior in `index.spec.ts`.

Expected: PASS.

- [ ] **Step 9: Commit message synchronization**

```bash
git add packages/core/src/actions packages/core/src/reducers packages/core/src/models
git commit -m "feat(core): synchronize canonical AG-UI messages"
```

### Task 5: Coordinate generation transactions and canonical requests

**Required skills:** @superpowers:test-driven-development, @superpowers:systematic-debugging if an existing retry or tool-continuation test regresses

**Files:**

- Modify: `packages/core/src/effects/generate-message.effects.ts`
- Modify: `packages/core/src/effects/generate-message.effects.spec.ts`
- Modify: `packages/core/src/effects/tools.effects.ts`
- Modify: `packages/core/src/effects/tools.effects.spec.ts`
- Modify: `packages/core/src/actions/api.actions.ts`
- Modify: `packages/core/src/reducers/index.ts`
- Modify: `packages/core/src/reducers/index.spec.ts`
- Modify: `packages/core/src/transport/hashbrown-run-agent-input.ts`
- Modify: `packages/core/src/transport/hashbrown-run-agent-input.spec.ts`
- Modify: `packages/core/src/transport/ag-ui-run-driver.spec.ts`
- Modify: `packages/core/src/transport/http-transport.spec.ts`

- [ ] **Step 1: Write failing request-builder tests**

Change the builder boundary to canonical inputs:

```ts
export interface CreateHashbrownRunAgentInputOptions {
  readonly threadId: string;
  readonly runId: string;
  readonly messages: readonly Readonly<Message>[];
  readonly state: JsonValue | undefined;
  readonly tools: readonly Chat.Api.Tool[];
  readonly responseSchema?: object;
  readonly ui?: boolean;
}
```

Verify exact message IDs/order/metadata are preserved, no system message is prepended, no messages are reconstructed, state primitives/arrays/objects pass through by owned value, `input.state` is `undefined` when absent, and JSON serialization omits the absent property. Preserve `context: []` and `forwardedProps: {}`.

- [ ] **Step 2: Run the builder test and verify it fails**

Run: `npx nx test core --runTestsByPath packages/core/src/transport/hashbrown-run-agent-input.spec.ts`

Expected: FAIL because the builder still accepts Hashbrown messages and synthesizes IDs/system/state.

- [ ] **Step 3: Implement the minimal canonical request builder**

Clone the message array/state at their ownership boundaries, not again for every request. The builder may create a new outer request object but must preserve canonical IDs and must not mutate stored inputs.

- [ ] **Step 4: Write failing logical-run orchestration tests**

Add tests that prove this exact sequence:

```text
local scheduling action -> state lock
attempt start -> both drafts opened
events -> both drafts updated live
RUN_FINISHED -> one success dispatch commits both domains and unlocks
local tools -> unlocked state may change
continuation scheduling -> lock again
```

Also prove request messages/state are captured once before attempt 1 and reused across retry attempts; a retryable transport failure rolls back both drafts but does not unlock; a terminal failure rolls back and unlocks; cancellation and thread retirement roll back/unlock; and an options-only system update during an active run changes the next logical run but not the current retry checkpoint.

- [ ] **Step 5: Add failing synchronization-protocol-error tests**

After each dispatched event, read both protocol-error selectors. If either is populated, expect the effect to abort consumption, dispose the response, dispatch rollback, emit one non-retryable generation error, skip retries, and preserve committed state/history. Add a run-driver test whose `onEvent` callback throws and assert iterator/response disposal.

- [ ] **Step 6: Add failing no-output-success tests**

Change `generateMessageSuccess` to:

```ts
generateMessageSuccess: props<{
  message?: Chat.Internal.AssistantMessage;
  toolCalls: Chat.Internal.ToolCall[];
}>(),
```

Test a state-only run, a messages-snapshot-only run, and a `RUN_STARTED`/`RUN_FINISHED` run. All must commit, clear generating status, append no assistant/error message, and execute no stale pending tool calls. Add explicit tool identity cases: a pending call already present in the attempt-start checkpoint is not executed; a pending call newly introduced by `MESSAGES_SNAPSHOT` is executed; a newly introduced call followed by a tool-result event is not executed; and a lifecycle-streamed call is executed once. Preserve existing structured-output and tool-call finalization errors.

- [ ] **Step 7: Implement orchestration with explicit attempt boundaries**

Before every `runAgUiAttempt`, dispatch `generationAttemptStarted`. On retryable failure, dispatch `generationAttemptRolledBack` before the next iteration and do not dispatch terminal `generateMessageError`. On successful finish, inspect parser/protocol errors, then read a new `selectNewPendingToolCallsForAttempt` selector that subtracts `attemptStartToolCallIds` from pending calls in the final canonical draft and merges streaming-parser decorations by ID. Pass only that attempt-scoped list to `generateMessageSuccess` and `assistantTurnFinalized`. On cancellation, retirement, server error, non-retryable failure, or exhausted retries, roll back before settling. Dispatch `logicalGenerationSettled` when no generation is needed after a scheduling action.

Capture these once before the retry loop:

```ts
const requestMessages = store.read(selectEffectiveCommittedAgUiMessages);
const requestState = store.read(selectCommittedAgentState);
```

Do not read either again for retries. Continue creating a new `runId`/request ID per attempt.

- [ ] **Step 8: Append canonical local tool results before continuation**

Give each locally produced tool-result message a stable opaque message ID when `toolTurnSettled` is dispatched. Serialize the result using the same normalization rules as existing outbound tool messages, append it to committed canonical history, settle exactly the attempt-scoped calls carried by `assistantTurnFinalized`, then schedule the continuation. Verify state changed by a tool handler is included in the continuation request because the prior logical generation has already unlocked. Never rediscover work from the global pending-tool selector after the success boundary.

- [ ] **Step 9: Prove the real HTTP body omits absent state**

In `http-transport.spec.ts`, capture `RequestInit.body`, parse it, and assert it has no own `state` property when request input state is `undefined`; assert initialized state is present unchanged.

- [ ] **Step 10: Run the focused orchestration and transport tests**

Run:

```bash
npx nx test core --runTestsByPath packages/core/src/effects/generate-message.effects.spec.ts packages/core/src/effects/tools.effects.spec.ts packages/core/src/transport/hashbrown-run-agent-input.spec.ts packages/core/src/transport/ag-ui-run-driver.spec.ts packages/core/src/transport/http-transport.spec.ts
```

Expected: PASS, including all pre-existing retry, cancellation, thread-identity, structured-parser, and multi-round tool tests.

- [ ] **Step 11: Commit orchestration**

```bash
git add packages/core/src/actions packages/core/src/effects packages/core/src/reducers/index.ts packages/core/src/reducers/index.spec.ts packages/core/src/transport
git commit -m "feat(core): transact AG-UI synchronization per attempt"
```

### Task 6: Expose the generic core state API and package contract

**Required skill:** @superpowers:test-driven-development

**Files:**

- Modify: `packages/core/src/chat-runtime.ts`
- Create: `packages/core/src/chat-runtime.spec.ts`
- Create: `packages/core/e2e/ag-ui-synchronization.e2e.spec.ts`
- Modify: `packages/core/e2e/package-shape.e2e.spec.ts`

- [ ] **Step 1: Write failing core runtime API tests**

Use the approved signature:

```ts
export interface ChatRuntime<
  Output,
  Tools extends Chat.AnyTool,
  State = unknown,
> {
  readonly state: StateSignal<State | undefined>;
  setState(state: State): void;
  // existing members unchanged
}
```

Add `state?: State` to both `createChatRuntime` overloads and their implementation. Preserve existing explicit generic positions by appending `State` after existing generics:

```ts
createChatRuntime<Tools, State = unknown>(...): ChatRuntime<string, Tools, State>;

createChatRuntime<
  Schema extends s.SchemaOutput,
  Tools extends Chat.AnyTool,
  Output extends s.InferSchemaOutput<Schema> = s.InferSchemaOutput<Schema>,
  State = unknown,
>(...): ChatRuntime<Output, Tools, State>;
```

Test initial state, `undefined` without initialization, synchronous `setState`, no generation after `setState`, invalid initial/manual values, write rejection from the scheduling action through logical settlement, live snapshot/delta publication, success commit, and rollback publication.

- [ ] **Step 2: Add compile-time inference assertions**

In the core spec or package-shape consumer, use assignments and `@ts-expect-error` assertions:

```ts
const runtime = createChatRuntime({
  system: 'test',
  state: { accountId: 'account-1' },
});

const state: { accountId: string } | undefined = runtime.state();
runtime.setState({ accountId: 'account-2' });
// @ts-expect-error accountId is required and must be a string.
runtime.setState({ accountId: 2 });
```

Also assert `ChatRuntime<string, Chat.AnyTool>` remains valid and exposes `unknown | undefined` state.

- [ ] **Step 3: Run the core runtime test and verify it fails**

Run: `npx nx test core --runTestsByPath packages/core/src/chat-runtime.spec.ts`

Expected: FAIL because the public state API does not exist.

- [ ] **Step 4: Implement runtime ownership and generic plumbing**

Generate the stable system-message ID once during runtime construction. Lower initial/local messages before dispatch. Validate and own `init.state` with `cloneAndFreezeOptionalJsonValue` before creating/initializing the store so invalid initialization throws without starting effects. In public `setState`, synchronously read `selectStateWriteLocked` and throw a clear API error when locked; otherwise validate/clone/freeze the input before dispatching the already-owned value. Do not rely on reducer exceptions because `TrampolineScheduler` reports them asynchronously. Expose `state.createSignal(selectVisibleAgentState)` with the generic cast only at this public boundary. Add visible state and attempt status—not full canonical history—to the devtools projection.

State must not be accepted by `updateOptions()`.

- [ ] **Step 5: Add packed-package contract assertions**

Update the generated `consumer.ts` in `packages/core/e2e/package-shape.e2e.spec.ts` with the inference example above and:

```ts
// @ts-expect-error State is runtime-owned, not an update option.
runtime.updateOptions({ state: { accountId: 'account-3' } });
```

Keep all existing removed-API assertions.

- [ ] **Step 6: Add a built-package HTTP/SSE synchronization test**

In `ag-ui-synchronization.e2e.spec.ts`, import the built core package, use `createHttpTransport({ fetchImpl })`, and return a real `text/event-stream` `Response` containing `RUN_STARTED`, `STATE_SNAPSHOT`, `STATE_DELTA`, `MESSAGES_SNAPSHOT`, and `RUN_FINISHED`. Assert the request body contains the initial committed state/canonical messages, live signals observe synchronized values, settled state/history remain committed, and the input event objects are not mutated. Add a second failing-stream case that proves rollback through the same parser/transport path.

- [ ] **Step 7: Run core unit, build, e2e, lint, and API report**

Run:

```bash
npx nx test core
npx nx build core
npx nx e2e core
npx nx lint core
npx nx build-api-report core
```

Expected: all pass with no API Extractor warnings about missing TSDoc or forgotten exports.

- [ ] **Step 8: Commit the core public API**

```bash
git add packages/core/src/chat-runtime.ts packages/core/src/chat-runtime.spec.ts packages/core/e2e/ag-ui-synchronization.e2e.spec.ts packages/core/e2e/package-shape.e2e.spec.ts
git commit -m "feat(core): expose shared agent state"
```

### Task 7: Propagate state through every React hook

**Required skill:** @superpowers:test-driven-development

**Files:**

- Modify: `packages/react/src/hooks/use-chat.tsx`
- Modify: `packages/react/src/hooks/use-chat.spec.tsx`
- Modify: `packages/react/src/hooks/use-structured-chat.tsx`
- Modify: `packages/react/src/hooks/use-structured-chat.spec.tsx`
- Modify: `packages/react/src/hooks/use-completion.tsx`
- Create or modify: `packages/react/src/hooks/use-completion.spec.tsx`
- Modify: `packages/react/src/hooks/use-structured-completion.tsx`
- Create or modify: `packages/react/src/hooks/use-structured-completion.spec.tsx`
- Modify: `packages/react/src/hooks/use-ui-chat.tsx`
- Modify: `packages/react/src/hooks/use-ui-chat.spec.tsx`
- Modify: `packages/react/src/hooks/use-ui-completion.tsx`
- Modify: `packages/react/src/hooks/use-ui-completion.spec.tsx`
- Modify: `packages/react/e2e/package-shape.e2e.spec.ts`

- [ ] **Step 1: Write failing plain and structured chat tests**

Append `State = unknown` after each hook's existing generic parameters. Add `state?: State` to options and these result members:

```ts
readonly state: State | undefined;
setState(state: State): void;
```

Test that `state` is passed only during runtime construction, is not sent through `updateOptions`, is subscribed with `useHashbrownSignal`, updates reactively, and delegates `setState`. Update runtime stubs with a state signal and setter.

- [ ] **Step 2: Run the focused chat tests and verify they fail**

Run:

```bash
npx vitest run --config packages/react/vite.config.ts packages/react/src/hooks/use-chat.spec.tsx packages/react/src/hooks/use-structured-chat.spec.tsx
```

Expected: FAIL because the hooks do not expose state.

- [ ] **Step 3: Implement plain and structured chat state**

Use these generic orders to preserve source compatibility:

```ts
UseChatOptions<Tools, State = unknown>
UseChatResult<Tools, State = unknown>
useChat<Tools, State = unknown>(...)

UseStructuredChatOptions<Schema, Tools, Output = ..., State = unknown>
UseStructuredChatResult<Output, Tools, State = unknown>
useStructuredChat<Schema, Tools, Output = ..., State = unknown>(...)
```

When calling the structured core overload, pass all four type arguments so `State` is not replaced by its default.

- [ ] **Step 4: Write failing completion and UI wrapper tests**

Apply the same additive API to:

- `UseCompletionOptions<Input, State = unknown>` and `UseCompletionResult<State = unknown>`;
- `UseStructuredCompletionOptions<Input, Schema, State = unknown>` and `UseStructuredCompletionResult<Output, State = unknown>`;
- `UiChatOptions<Tools, State = unknown>` and the inferred UI-chat result;
- `UiCompletionOptions<Input, Tools = Chat.AnyTool, State = unknown>` and `UseUiCompletionResult<Tools, State = unknown>`.

Verify completion calls to `setMessages()` retain the configured system message by observing the core runtime request in an integration-style hook test. Verify wrappers forward the initial state exactly once and return the delegated state/setter unchanged.

- [ ] **Step 5: Implement completion and UI propagation**

Completion hooks must include `state` and `setState` in their explicit return objects. UI hooks that spread a lower-level result inherit the runtime values but still need public generic option/result types. Do not mirror `options.state` into React state or an effect; it seeds runtime state only.

- [ ] **Step 6: Add installed-package inference assertions**

Extend the React package-shape consumer with plain, structured, UI, and completion examples. Assert an object initial state infers the setter type and that public signatures contain no `ɵ`-prefixed types.

- [ ] **Step 7: Run React tests, build, e2e, and API report**

React has no Nx `test` or `lint` target. Run its configured Vitest suite directly and report the unavailable Nx targets rather than inventing them:

```bash
npx vitest run --config packages/react/vite.config.ts
npx nx build react
npx nx e2e react
npx nx build-api-report react
```

Expected: all available commands pass.

- [ ] **Step 8: Commit React support**

```bash
git add packages/react
git commit -m "feat(react): expose shared agent state"
```

### Task 8: Propagate state through every Angular resource

**Required skill:** @superpowers:test-driven-development

**Files:**

- Modify: `packages/angular/src/resources/chat-resource.fn.ts`
- Modify: `packages/angular/src/resources/chat-resource.fn.spec.ts`
- Modify: `packages/angular/src/resources/completion-resource.fn.ts`
- Modify: `packages/angular/src/resources/completion-resource.fn.spec.ts`
- Modify: `packages/angular/src/resources/structured-chat-resource.fn.ts`
- Modify: `packages/angular/src/resources/structured-chat-resource.fn.spec.ts`
- Modify: `packages/angular/src/resources/structured-completion-resource.fn.ts`
- Modify: `packages/angular/src/resources/structured-completion-resource.fn.spec.ts`
- Modify: `packages/angular/src/resources/ui-chat-resource.fn.ts`
- Modify: `packages/angular/src/resources/ui-chat-resource.spec.ts`
- Modify: `packages/angular/src/resources/ui-completion-resource.fn.ts`
- Modify: `packages/angular/src/resources/ui-completion-resource.spec.ts`
- Modify: `packages/angular/e2e/package-compatibility.e2e.test.mjs`

- [ ] **Step 1: Write failing plain and structured resource tests**

Append `State = unknown` after existing generic parameters. Add a plain initial `state?: State` option—not `ReactiveOption<State>`—and expose:

```ts
readonly state: Signal<State | undefined>;
setState(state: State): void;
```

Test initial forwarding, `toNgSignal(runtime.state)` reactivity, setter delegation, and that changing other reactive options does not resend or overwrite state. Update every runtime stub with `state` and `setState`.

- [ ] **Step 2: Run the focused resource tests and verify they fail**

Run:

```bash
npx nx test angular -- --run packages/angular/src/resources/chat-resource.fn.spec.ts packages/angular/src/resources/structured-chat-resource.fn.spec.ts
```

Expected: FAIL because resources do not expose state.

- [ ] **Step 3: Implement plain and structured resource state**

Use these generic orders:

```ts
ChatResourceOptions<Tools, State = unknown>
ChatResourceRef<Tools, State = unknown>
chatResource<Tools, State = unknown>(...)

StructuredChatResourceOptions<Schema, Tools, Output = ..., State = unknown>
StructuredChatResourceRef<Output, Tools, State = unknown>
```

Pass `options.state` only to `createChatRuntime`. Do not read it inside Angular's `effect()` and do not add it to `runtime.updateOptions()`.

- [ ] **Step 4: Write failing completion and UI resource tests**

Add `State` generics and the same state members to completion, structured completion, UI chat, and UI completion. Verify wrapper resources preserve and delegate the exact lower-level `Signal` and setter while continuing to decorate only the message/output value.

- [ ] **Step 5: Implement completion and UI resource propagation**

Return `state` and `setState` explicitly from completion resources. UI resource spreads/delegation must retain them. Do not expose a core internal type in any Angular public signature.

- [ ] **Step 6: Add installed-package compatibility assertions**

Extend `package-compatibility.e2e.test.mjs`'s generated consumer with state inference for all six resource families, including a negative setter assertion and a check that `state` is not accepted as a signal/reactive option.

- [ ] **Step 7: Run Angular test, build, e2e, lint, and API report**

Run:

```bash
npx nx test angular
npx nx build angular
npx nx e2e angular
npx nx lint angular
npx nx build-api-report angular
```

Expected: all pass.

- [ ] **Step 8: Commit Angular support**

```bash
git add packages/angular
git commit -m "feat(angular): expose shared agent state"
```

### Task 9: Document shared state and message checkpoint semantics

**Files:**

- Create: `www/analog/src/app/pages/docs/react/concept/shared-agent-state.md`
- Create: `www/analog/src/app/pages/docs/angular/concept/shared-agent-state.md`
- Modify: `www/analog/src/app/pages/docs/react/concept/message-history.md`
- Modify: `www/analog/src/app/pages/docs/angular/concept/message-history.md`

- [ ] **Step 1: Write the React shared-state guide**

Document initialization, inferred `State`, reactive reads, `setState`, no automatic generation, JSON-compatible values, synchronous write rejection during a logical generation, live draft updates, rollback, and the fact that direct provider adapters do not inject state into prompts.

Use an example that sends an explicit user message after a local state change:

```tsx
const chat = useChat({
  system: 'Help manage the selected account.',
  state: { selectedAccountId: 'account-123' },
});

chat.setState({ selectedAccountId: 'account-456' });
chat.sendMessage({ role: 'user', content: 'Show the new account.' });
```

- [ ] **Step 2: Write the Angular shared-state guide**

Mirror the same contract with `chat.state()` and emphasize that the initial option is a plain value because the resource owns subsequent state.

- [ ] **Step 3: Update message-history cross-links**

Explain that Hashbrown's public messages remain the opinionated view while complete canonical AG-UI checkpoints are retained internally for subsequent requests. Link to shared state from both Next Steps sections. Do not claim that canonical history is publicly exposed.

- [ ] **Step 4: Run documentation formatting and collection checks**

Run:

```bash
npx prettier --check www/analog/src/app/pages/docs/react/concept/shared-agent-state.md www/analog/src/app/pages/docs/angular/concept/shared-agent-state.md www/analog/src/app/pages/docs/react/concept/message-history.md www/analog/src/app/pages/docs/angular/concept/message-history.md
npx nx collect-docs www
npx nx test www
npx nx build www
```

Expected: all pass. Review generated navigation/collection changes and commit them only if the target intentionally tracks them.

- [ ] **Step 5: Commit documentation**

```bash
git add www/analog/src/app/pages/docs/react/concept www/analog/src/app/pages/docs/angular/concept
git commit -m "docs: explain shared AG-UI state"
```

### Task 10: Run final affected-package verification

**Required skills:** @superpowers:verification-before-completion, @superpowers:requesting-code-review

**Files:**

- Modify only files required to fix failures caused by this feature.

- [ ] **Step 1: Check diff integrity and scope**

Run:

```bash
git status --short
git diff --check
git diff --stat main...HEAD
```

Expected: no whitespace errors and no changes outside core, React, Angular, docs, design, and this plan.

- [ ] **Step 2: Run the complete core matrix**

Run:

```bash
npx nx build core
npx nx test core
npx nx e2e core
npx nx lint core
npx nx build-api-report core
```

Expected: all pass.

- [ ] **Step 3: Run the complete React matrix**

Run:

```bash
npx vitest run --config packages/react/vite.config.ts
npx nx build react
npx nx e2e react
npx nx build-api-report react
```

Expected: all available commands pass. Record that the project defines no Nx `test` or `lint` target.

- [ ] **Step 4: Run the complete Angular matrix**

Run:

```bash
npx nx build angular
npx nx test angular
npx nx e2e angular
npx nx lint angular
npx nx build-api-report angular
```

Expected: all pass.

- [ ] **Step 5: Run documentation verification**

Run:

```bash
npx nx collect-docs www
npx nx test www
npx nx build www
```

Expected: all pass.

- [ ] **Step 6: Run provider-adapter compatibility verification**

The adapters should not serialize shared state into prompts, but their existing AG-UI message/tool behavior must remain green:

```bash
npx nx run-many -t build,test,e2e,lint --projects=openai,anthropic,azure,bedrock,google,ollama
```

Expected: all configured provider targets pass without provider-specific state injection changes.

- [ ] **Step 7: Request code review and fix only verified issues**

Ask the reviewer to compare the implementation against `design/core/ag-ui-state-and-message-synchronization.md`, with special attention to transactional rollback, retry locking, stable canonical IDs, system overlay ownership, public generic inference, and no-output success. Apply feedback with @superpowers:receiving-code-review and rerun the affected focused/full commands.

- [ ] **Step 8: Commit final verification fixes, if any**

```bash
git add packages/core packages/react packages/angular www/analog/src/app/pages/docs
git commit -m "fix: complete AG-UI synchronization verification"
```

Skip this commit when verification requires no changes.

## Completion criteria

- Core sends complete canonical AG-UI history and committed state on every logical run.
- State snapshots/deltas and message snapshots publish live drafts, commit together on success, and roll back together on every non-success boundary.
- Full RFC 6902 behavior is immutable, atomic, and prototype-safe.
- `setState()` is generic, reactive, non-generating, and correctly locked across retries.
- Configured system messages survive snapshots and completion-driven history replacement without duplication.
- No-output successful runs settle without inventing assistant/error messages or executing stale tools.
- React and Angular expose the same state contract across all plain, structured, UI, chat, and completion APIs.
- A2UI, MCP Apps, interrupts, and activity event APIs remain unimplemented.
- All affected build, test, e2e, lint, API-report, and documentation commands pass or unavailable targets are explicitly reported.
