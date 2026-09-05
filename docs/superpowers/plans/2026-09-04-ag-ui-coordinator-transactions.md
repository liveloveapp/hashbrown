# AG-UI Coordinator Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate canonical AG-UI state and message transactions in the current logical-run, assistant-turn, and tool-turn coordinators while sending stable canonical request checkpoints and committing local tool results losslessly.

**Architecture:** Keep the three store-independent coordinators introduced on `main`. The generation effect owns store integration: it captures one committed request checkpoint per model round, opens each retry attempt before transport, routes accepted events through the prepared root action, and commits or rolls back all synchronization slices together. The assistant-turn coordinator owns model/tool iteration; the tool-turn coordinator executes only calls introduced by the successful attempt. Canonical history remains the outbound authority, while local projection provenance preserves exact typed values and `Error` identities.

**Tech Stack:** TypeScript, AG-UI events, Nx, Jest, Hashbrown's internal reducer/effect store.

**Supersedes:** Task 5 of `docs/superpowers/plans/2026-09-02-ag-ui-state-message-synchronization.md` only. Tasks 6–10 remain unchanged.

---

### Task 1: Build requests from canonical checkpoints

**Files:**

- Modify: `packages/core/src/transport/hashbrown-run-agent-input.ts`
- Modify: `packages/core/src/transport/hashbrown-run-agent-input.spec.ts`
- Modify: `packages/core/src/transport/http-transport.spec.ts`
- Create: `packages/core/src/transport/normalize-tool-result.ts`
- Create: `packages/core/src/transport/normalize-tool-result.spec.ts`

- [ ] **Step 1: Write failing canonical builder tests**

Add a canonical builder alongside the current legacy builder so this commit does
not switch multi-round production requests before canonical local results exist:

```ts
export interface CreateCanonicalRunAgentInputOptions {
  readonly threadId: string;
  readonly runId: string;
  readonly messages: readonly Readonly<Message>[];
  readonly state: JsonValue | undefined;
  readonly tools: readonly Chat.Api.Tool[];
  readonly responseSchema?: object;
  readonly ui?: boolean;
}
```

Assert exact canonical message IDs, order, roles, metadata, and owned values pass through. Assert the builder does not prepend a system message, reconstruct messages, or synthesize positional IDs. Assert `state` accepts primitives, arrays, and objects; absent state remains `undefined`; and JSON serialization omits the absent property. Preserve `context: []`, `forwardedProps: {}`, tools, response schema, and Hashbrown UI extension behavior.

- [ ] **Step 2: Run the focused builder tests and verify RED**

Run:

```bash
npx nx test core --runTestsByPath packages/core/src/transport/hashbrown-run-agent-input.spec.ts packages/core/src/transport/http-transport.spec.ts --skipNxCache
```

Expected: FAIL because the builder still accepts Hashbrown messages/system and synthesizes IDs/state.

- [ ] **Step 3: Implement the staged canonical pass-through boundary**

Own the message array and state once at the request-checkpoint boundary. The builder may allocate the outer request object, but it must preserve canonical IDs and metadata and must not mutate stored inputs.

- [ ] **Step 4: Extract total local-result normalization**

Move the current private `normalizeValue` / `normalizeRejection` behavior into
`normalize-tool-result.ts`. Cover `undefined`, `null`, `bigint`, cycles,
throwing getters/proxies, `Error`, and ordinary JSON values. This helper will
create outbound-safe canonical tool-result content in Task 6 while the raw
`PromiseSettledResult` remains local.

- [ ] **Step 5: Verify the staged builder without switching the effect**

Move obsolete system-prepending, reconstruction, and positional-ID expectations
to the lowering/ownership tests that own those behaviors. Keep the current
production builder call intact until Task 6 can switch requests and append local
canonical results atomically. Keep tools/schema/extension tests at the builder
boundary.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/transport
git commit -m "feat(core): build requests from canonical checkpoints"
```

### Task 2: Expose attempt lifecycle boundaries from the logical-run coordinator

**Files:**

- Modify: `packages/core/src/effects/logical-run-coordinator.ts`
- Modify: `packages/core/src/effects/logical-run-coordinator.spec.ts`
- Modify: `packages/core/src/transport/ag-ui-run-driver.spec.ts`

- [ ] **Step 1: Write failing callback-order tests**

Add coordinator tests proving `onAttemptStarted` runs before `transport.send`; every retry starts a new attempt; retryable failures call `onAttemptRolledBack` only after response/iterator cleanup and before the next attempt; and cancellation, retirement, server error, and terminal failure identify the active attempt outcome exactly once.

Introduce optional lifecycle callbacks that receive one attempt context/token,
leaving the current caller behavior compatible in this commit. Do not remove
`onAttemptError` until Task 3 updates the production effect:

```ts
readonly onAttemptStarted?: (context: LogicalRunAttemptContext) => void;
readonly onAttemptRolledBack?: (
  context: LogicalRunAttemptContext,
  error: Error | undefined,
) => void;
```

Pass the same context to `onStarted` and `onEvent`, allowing the effect to
reject callbacks from a retired/superseded attempt. Keep `onAttemptError`
temporarily so this staged commit remains compatible with the production
effect; Task 3 removes it when the effect adopts the new lifecycle atomically.

- [ ] **Step 2: Verify RED**

```bash
npx nx test core --runTestsByPath packages/core/src/effects/logical-run-coordinator.spec.ts packages/core/src/transport/ag-ui-run-driver.spec.ts --skipNxCache
```

- [ ] **Step 3: Implement the minimal coordinator callbacks**

Call optional `onAttemptStarted` immediately before `runAgUiAttempt`. Call the
optional rollback callback once
for attempts that do not finish successfully, after cleanup is complete and
before a retry begins. Preserve the legacy `onAttemptError` callback for its
existing caller until Task 3 removes it atomically. Do not publish public errors
or dispatch store actions from the coordinator itself.

- [ ] **Step 4: Verify GREEN and commit**

```bash
git add packages/core/src/effects/logical-run-coordinator.ts packages/core/src/effects/logical-run-coordinator.spec.ts packages/core/src/transport/ag-ui-run-driver.spec.ts
git commit -m "refactor(core): expose logical run attempt boundaries"
```

### Task 3: Activate synchronization transactions atomically

**Files:**

- Modify: `packages/core/src/chat-runtime.ts`
- Modify: `packages/core/src/effects/generate-message.effects.ts`
- Modify: `packages/core/src/effects/generate-message.effects.spec.ts`
- Modify: `packages/core/src/effects/logical-run-coordinator.ts`
- Modify: `packages/core/src/effects/logical-run-coordinator.spec.ts`
- Modify: `packages/core/src/reducers/status.reducer.ts`
- Modify: `packages/core/src/reducers/status.reducer.spec.ts`
- Modify: `packages/core/src/reducers/index.spec.ts`
- Create: `packages/core/src/reducers/generation-ownership.reducer.ts`
- Create: `packages/core/src/reducers/generation-ownership.reducer.spec.ts`
- Modify: `packages/core/src/actions/internal.actions.ts`

- [ ] **Step 1: Write failing real-store transaction tests**

Cover this exact ordering:

```text
scheduling action -> logical lock
onAttemptStarted -> state/message/projection drafts open
RUN_STARTED -> streaming parser starts
prepared events -> every draft updates live
RUN_FINISHED -> one success commits all domains
logical completion -> lock released
```

Also cover debounce, transport initialization failure, retry rollback without
unlock or local error publication, one terminal error after retry exhaustion,
cancellation, thread retirement, an options-only system update during an
attempt, a scheduling action with no eligible work, and reentrant
stop/superseding input at terminal dispatch. Suspend old iterator cleanup while
starting a replacement generation, then prove delayed rollback/event/success/
error/settlement callbacks cannot touch the replacement. Assert actual
committed values and ownership, not only action counts.

Update the logical-run coordinator contract and tests in this same task to
remove the temporary `onAttemptError` callback. Its returned terminal outcome
is the only source of public terminal-error publication.

- [ ] **Step 2: Verify RED**

```bash
npx nx test core --runTestsByPath packages/core/src/effects/generate-message.effects.spec.ts packages/core/src/effects/logical-run-coordinator.spec.ts packages/core/src/reducers/index.spec.ts packages/core/src/reducers/status.reducer.spec.ts --skipNxCache
```

- [ ] **Step 3: Wire begin, rollback, and settlement atomically**

Give every `ActiveGeneration` a stable identity and every model attempt an
attempt token. Add a private `generationOwnership` reducer registered in the
root store, established by `logicalGenerationStarted({ generationId })` and
tracking the active generation/attempt IDs. Guard begin, event, rollback,
success, terminal error, and logical settlement with both the effect-local and
store-owned identities. Only an owned callback may dispatch:

```ts
onAttemptStarted: () => store.dispatch(internalActions.generationAttemptStarted()),
onAttemptRolledBack: () => store.dispatch(internalActions.generationAttemptRolledBack()),
```

Keep `generateMessageStart({ responseSchema, toolsByName })` in the accepted
`RUN_STARTED` callback so parser configuration is initialized before that event
is forwarded. Open/rollback canonical transactions here, but keep
`prepareAction` uninstalled until Task 5 commits exact decorated tool identities
in prepared mode. Dispatch `logicalGenerationSettled({ generationId })` exactly once for
terminal completion/no-work, with ownership checks preventing an old retired
generation from settling or rolling back its replacement. Make status clear on
matching logical settlement. Remove the legacy `onAttemptError` publication;
do not dispatch `generateMessageError` for retryable
attempts; rollback keeps the logical lock and error history unchanged.

- [ ] **Step 4: Verify GREEN and commit**

```bash
git add packages/core/src/actions/internal.actions.ts packages/core/src/chat-runtime.ts packages/core/src/effects/generate-message.effects.ts packages/core/src/effects/generate-message.effects.spec.ts packages/core/src/effects/logical-run-coordinator.ts packages/core/src/effects/logical-run-coordinator.spec.ts packages/core/src/reducers
git commit -m "feat(core): transact generation synchronization"
```

### Task 4: Terminate synchronization protocol failures

**Files:**

- Modify: `packages/core/src/effects/generate-message.effects.ts`
- Modify: `packages/core/src/effects/generate-message.effects.spec.ts`
- Modify: `packages/core/src/effects/logical-run-coordinator.ts`
- Modify: `packages/core/src/effects/logical-run-coordinator.spec.ts`
- Modify: `packages/core/src/transport/ag-ui-run-driver.spec.ts`

- [ ] **Step 1: Write failing protocol-failure integration tests**

After dispatching each transport event, read both synchronization protocol-error
selectors. Test invalid state patches, invalid snapshots, incompatible message
events, event preparation/dispatch exceptions, and a generic callback exception
with retries enabled. Assert consumption stops immediately, iterator/response
cleanup completes, one non-retryable protocol error is published, no retry
occurs, later events cannot mutate state, and all drafts roll back.

- [ ] **Step 2: Verify RED**

```bash
npx nx test core --runTestsByPath packages/core/src/effects/generate-message.effects.spec.ts packages/core/src/effects/logical-run-coordinator.spec.ts packages/core/src/transport/ag-ui-run-driver.spec.ts --skipNxCache
```

- [ ] **Step 3: Implement selector checks and non-retryable failure**

Wrap event preparation, dispatch, and selector reads. After each dispatch, throw
a non-retryable `TransportError` when either protocol selector is populated;
convert callback exceptions to the same non-retryable protocol classification.
Do not abort the user-cancel signal, because that would misclassify the failure
as cancellation. Let the run driver's `finally` dispose the response/iterator
before rollback and terminal publication.

- [ ] **Step 4: Verify GREEN and commit**

```bash
git add packages/core/src/effects packages/core/src/transport/ag-ui-run-driver.spec.ts
git commit -m "fix(core): terminate invalid synchronization attempts"
```

### Task 5: Finalize no-output runs and attempt-owned tool calls

**Files:**

- Modify: `packages/core/src/actions/api.actions.ts`
- Modify: `packages/core/src/reducers/messages.reducer.ts`
- Modify: `packages/core/src/reducers/messages.reducer.spec.ts`
- Modify: `packages/core/src/reducers/index.ts`
- Modify: `packages/core/src/reducers/index.spec.ts`
- Modify: `packages/core/src/reducers/tool-calls.reducer.ts`
- Modify: `packages/core/src/reducers/tool-calls.reducer.spec.ts`
- Modify: `packages/core/src/reducers/status.reducer.ts`
- Modify: `packages/core/src/reducers/status.reducer.spec.ts`
- Modify: `packages/core/src/actions/internal.actions.ts`
- Modify: `packages/core/src/effects/generate-message.effects.ts`
- Modify: `packages/core/src/effects/generate-message.effects.spec.ts`
- Modify: `packages/core/src/effects/assistant-turn-coordinator.ts`
- Modify: `packages/core/src/effects/assistant-turn-coordinator.spec.ts`

- [ ] **Step 1: Write failing no-output and tool-ownership tests**

Make success accept no assistant:

```ts
generateMessageSuccess: props<{
  message?: Chat.Internal.AssistantMessage;
  toolCalls: Chat.Internal.ToolCall[];
}>(),
```

Test state-only, messages-snapshot-only, and empty `RUN_STARTED`/`RUN_FINISHED` runs. They commit and become idle without appending assistant/error messages. Add explicit attempt ownership cases:

- pending calls in the attempt-start checkpoint are not executed;
- pending calls newly introduced by a snapshot are executed once;
- a new call settled by an agent `TOOL_CALL_RESULT` is not executed;
- lifecycle-streamed fresh calls execute once;
- compatible replay of a checkpoint ID does not re-execute;
- stale calls do not keep `isLoading` true.

Extend `generationOwnership` with a reserved tool turn (generation ID,
tool-turn ID, and exact tool objects) plus `runningToolCallIds`. Reserve the
tool turn before success dispatch, while the immutable snapshot is still owned
but unclaimed. Add an explicit tool-execution lifecycle
`toolTurnStarted({ generationId, toolTurnId })` through a new assistant-turn
callback when `readToolSnapshot()` claims that reservation.
`selectIsRunningToolCalls` must reflect only claimed calls actually handed to
the tool coordinator, not every globally pending or merely reserved call. It
stays true during real local execution and clears on settlement, stop,
retirement, skipped/no-output completion, and supersession.

Add real-store tests that stop reentrantly during success dispatch, before
`readToolSnapshot()`: the reserved snapshot settles cancellation exactly once.
Add the corresponding supersession test: a replacement generation invalidates
the old reservation, so its delayed settlement is an exact no-op.

- [ ] **Step 2: Verify RED**

```bash
npx nx test core --runTestsByPath packages/core/src/effects/generate-message.effects.spec.ts packages/core/src/effects/assistant-turn-coordinator.spec.ts packages/core/src/reducers/index.spec.ts packages/core/src/reducers/messages.reducer.spec.ts --skipNxCache
```

- [ ] **Step 3: Add an attempt-owned pending-call selector**

Select final canonical/projected pending calls minus
`ɵselectAttemptStartToolCallIds`. Decorate only compatible stable IDs with
parser-resolved arguments. Compute the immutable execution snapshot before
success clears the baseline/streaming state. Update the prepared success path
in `tool-calls.reducer.ts` to commit these exact compatible decorated objects
and provenance. Hand those same object identities to the assistant-turn
coordinator so legitimate settlement passes identity checks and stale same-ID
replacement remains rejected.

- [ ] **Step 4: Commit optional success and immutable handoff**

Populate `ActiveGeneration.unclaimedToolSnapshot` from the attempt-owned
selector and assign it an opaque tool-turn token. Dispatch a reservation action
before success so the store can validate cancellation even if success dispatch
reentrantly stops the generation. Dispatch one success even without a message,
and let the existing `readToolSnapshot()` handoff drive the assistant-turn
coordinator. Dispatch the explicit tool-execution start with the owning
generation/tool-turn IDs only when that snapshot is claimed. Reservation does
not set running status. Update the prepared success branch to commit the exact
execution objects, then install `prepareAction: ɵprepareRootAction` in
`chat-runtime.ts` in this same green commit. Do not
restore `tools.effects` or `assistantTurnFinalized`.

- [ ] **Step 5: Verify GREEN and commit**

```bash
git add packages/core/src/actions/api.actions.ts packages/core/src/actions/internal.actions.ts packages/core/src/reducers packages/core/src/effects packages/core/src/chat-runtime.ts
git commit -m "feat(core): finalize synchronization without assistant output"
```

### Task 6: Commit canonical local tool results before continuation

**Files:**

- Modify: `packages/core/src/actions/internal.actions.ts`
- Modify: `packages/core/src/actions/internal.actions.spec.ts` if present
- Modify: `packages/core/src/reducers/ag-ui-messages.reducer.ts`
- Modify: `packages/core/src/reducers/ag-ui-messages.reducer.spec.ts`
- Modify: `packages/core/src/reducers/tool-calls.reducer.ts`
- Modify: `packages/core/src/reducers/messages.reducer.ts`
- Modify: `packages/core/src/reducers/index.ts`
- Modify: `packages/core/src/reducers/index.spec.ts`
- Modify: `packages/core/src/effects/generate-message.effects.ts`
- Modify: `packages/core/src/effects/generate-message.effects.spec.ts`
- Modify: `packages/core/src/reducers/generation-ownership.reducer.ts`
- Modify: `packages/core/src/reducers/generation-ownership.reducer.spec.ts`
- Modify: `packages/core/src/transport/hashbrown-run-agent-input.ts`
- Modify: `packages/core/src/transport/hashbrown-run-agent-input.spec.ts`
- Modify: `packages/core/src/transport/http-transport.spec.ts`
- Modify: `packages/core/src/transport/ag-ui-run-driver.spec.ts`
- Modify: `packages/core/src/effects/logical-run-coordinator.spec.ts`

- [ ] **Step 1: Write failing settlement tests**

Cover fulfilled, rejected, cancelled, `undefined`, `bigint`, cyclic, and hostile
result values. Raw `PromiseSettledResult`/`Error` objects remain exact in the
local projection; canonical tool messages use the Task 1 total normalizer and
stable opaque message IDs. Test same-ID replacement from `setMessages`, an
empty accepted subset, reentrant stop/supersession, retry, and shared-state
changes during a tool handler before continuation.

- [ ] **Step 2: Verify RED**

```bash
npx nx test core --runTestsByPath packages/core/src/effects/generate-message.effects.spec.ts packages/core/src/reducers/ag-ui-messages.reducer.spec.ts packages/core/src/reducers/tool-calls.reducer.spec.ts packages/core/src/reducers/index.spec.ts --skipNxCache
```

- [ ] **Step 3: Add atomic stale-settlement preflight**

Extend `toolTurnSettled` with owned canonical result messages, the captured tool
objects, and the owning generation/tool-turn tokens. The
`generationOwnership` slice is the root source of truth: start replaces its
generation ID; reserving a tool snapshot establishes its tool-turn ID and exact
objects before success dispatch; claiming the reservation changes only its
running status; matching settlement clears the reservation/tool turn; matching
logical settlement clears the generation. At `ɵprepareRootAction`, validate
both stored tokens and exact captured tool identity once, attach the accepted subset,
and apply that same subset to canonical append, message/tool projection caches,
canonical ID indexes, local provenance, status, and continuation. Never append
an orphan canonical result solely because the tool-call ID matches. If the
accepted subset is empty/stale, the action is an exact no-op and cannot relock
or alter a replacement generation. An unclaimed but still-owned reservation may
settle cancellation exactly once; replacement invalidates the reservation so a
delayed old settlement is rejected.

- [ ] **Step 4: Reuse total outbound result normalization**

Reuse `normalize-tool-result.ts` rather than `serializeResult` when creating
canonical tool messages. It must not throw for `undefined`, `bigint`, cycles,
or hostile objects. Preserve raw local values separately.

- [ ] **Step 5: Settle, relock, and continue**

In `settleToolTurn`, generate stable result message IDs, dispatch one atomic
settlement, allow local tool state changes to remain committed, and relock only
when an owned, nonempty accepted subset requests `continuation: 'continue'`.
After local result append is implemented, switch the production effect from the
legacy request builder to the staged canonical builder. At the start of each
model round, after the eligibility microtask, capture exactly once:

```ts
const messages = store.read(ɵselectEffectiveCommittedAgUiMessages);
const state = store.read(ɵselectCommittedAgentState);
```

Reuse that checkpoint for retries; a continuation captures the newly committed
canonical state/history. Migrate request fixtures in
`logical-run-coordinator.spec.ts`, `ag-ui-run-driver.spec.ts`, and HTTP tests to
the required `state` field. Remove the legacy builder only after all
multi-round tests pass.

- [ ] **Step 6: Verify GREEN and commit**

```bash
git add packages/core/src/actions packages/core/src/reducers packages/core/src/effects packages/core/src/transport
git commit -m "feat(core): commit canonical local tool results"
```

### Task 7: Verify the coordinator transaction series

**Files:**

- Verify only unless fixes are required.

- [ ] **Step 1: Run the focused core matrix**

```bash
npx nx test core --runTestsByPath packages/core/src/effects/generate-message.effects.spec.ts packages/core/src/effects/logical-run-coordinator.spec.ts packages/core/src/effects/assistant-turn-coordinator.spec.ts packages/core/src/effects/tool-turn-coordinator.spec.ts packages/core/src/reducers/index.spec.ts packages/core/src/reducers/agent-state.reducer.spec.ts packages/core/src/reducers/ag-ui-messages.reducer.spec.ts packages/core/src/reducers/messages.reducer.spec.ts packages/core/src/reducers/tool-calls.reducer.spec.ts packages/core/src/reducers/streaming-message.reducer.spec.ts packages/core/src/transport/hashbrown-run-agent-input.spec.ts packages/core/src/transport/ag-ui-run-driver.spec.ts packages/core/src/transport/http-transport.spec.ts --skipNxCache
```

- [ ] **Step 2: Run all affected core targets**

```bash
npx nx build core --skipNxCache
npx nx test core --skipNxCache
npx nx e2e core --skipNxCache
npx nx lint core --skipNxCache
npx nx build-api-report core --skipNxCache
```

- [ ] **Step 3: Run the merged representative runtime acceptance path**

```bash
npx nx test runtime-smoke --skipNxCache
npx nx example-e2e runtime-smoke --skipNxCache
```

Verify canonical transcript IDs/order, result normalization, continuation, cancellation, and idle behavior. Do not change provider prompt/state semantics in this task.

- [ ] **Step 4: Request spec and quality review**

Review the six commits as one Task 5 series against the approved synchronization design and this coordinator-specific plan. Fix findings through TDD and rerun the affected/full gates before proceeding to Task 6 of the original plan.
