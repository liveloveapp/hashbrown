---
Created: 2026-09-08
Updated: 2026-09-14
Author: Hashbrown team
Affects: packages/core, packages/react, packages/angular
Status: Consolidated specification pending independent and final user review
---

# AG-UI Interrupt and Resume

## Objective

Support protocol-standard interrupt outcomes and resume batches across core,
React, and Angular while preserving committed state and canonical message
transactions. Activity Snapshots/Deltas, A2UI, MCP Apps, and legacy CUSTOM
interrupt conventions are outside PR2.

## Background and scope

PR1 established runtime-owned shared state, immutable canonical AG-UI history,
and atomic attempt commit/rollback. PR2 extends those contracts with explicit
interrupt ownership; it does not replace the runtime or its transport. The
wire baseline remains the repository's pinned `@ag-ui/core` 0.0.59.

Core owns protocol validation, transactional state, and execution decisions.
React and Angular adapt that state to their existing hooks and signals. Public
types must preserve protocol fields without exposing internal core types.
All new public or reusable APIs require TSDoc. No new dependency is authorized.

## Architecture

Use a dedicated interrupt state slice, separate from messages and status.
Overloading status with batch payloads would couple execution flags to protocol
ownership; embedding interrupts in messages would confuse checkpoint history
with actionable client state. A dedicated slice keeps those concerns separate
while participating in the same atomic store transactions.

The slice owns the current immutable batch, a synchronous claim identity,
the resumed interaction's generation identity, and the recovery-required guard.
Reuse existing generation/attempt ownership tokens to reject stale transitions.
Derive public projections from this state rather than duplicating independent
flags in each facade. Capture an owned resume request once, after synchronous
validation and before any debounce or asynchronous transport resolution.

Preserve the terminal distinction through the run driver, logical-run
coordinator, and assistant-turn coordinator. Validate interrupt outcomes before
terminal acceptance. The existing atomic finish transaction commits messages,
state, and the batch together; its interrupt branch must not reserve tools.
The ordinary-success branch retains current execution behavior.

Claim consumption must be tied to the driver's identity-validated RUN_STARTED
callback, not HTTP response arrival or request dispatch. Carry an internal
resumed-interaction marker through subsequent tool/continuation phases, but
attach wire resume entries only to the initial resumed model run and its
permitted pre-start retries.

Framework adapters expose common public core types. Completion adapters retain
only the latest deferred input and the bookkeeping required to distinguish it
from the input already submitted on the current thread. They wait for full
interaction settlement rather than treating pending-batch disappearance as
permission to generate.

## Approved decisions

- Support multiple simultaneous interrupts end-to-end. Public APIs expose the
  complete batch.
- Resume requires a complete response batch: exactly one entry for every pending
  interrupt ID, with each entry marked `resolved` or `cancelled`. One unanswered
  interrupt holds up the entire batch.
- A valid interrupt RUN_FINISHED atomically commits streamed state and messages
  as a checkpoint. The resumed run starts a new transaction.
- Resume synchronously claims the pending batch, preventing duplicate calls.
  The batch remains observable while claimed/resuming.
- Consume the claim when the driver accepts a matching RUN_STARTED. Reject
  stale submissions after consumption.
- If the logical run fails before any matching RUN_STARTED, release the claim
  and retain the actionable batch.
- Client-side claim ownership does not guarantee exactly-once server execution:
  the server may accept a request whose RUN_STARTED never reaches the client.
- Resume attempts honor configured automatic retries only before a matching
  RUN_STARTED, reusing the captured checkpoint and resume payload while keeping
  the batch claimed. Exhausting these retries releases the claim.
- After a matching RUN_STARTED, a failed resumed run is not automatically
  replayed. Roll back its draft state/messages, surface the error, and keep the
  previous interrupts consumed. Ordinary runs retain their existing retry policy.
- Allow `setState()` while interrupts are pending and unclaimed. State edits
  alone do not resume execution. Resume synchronously locks state when claiming
  the batch and captures the latest committed state, canonical message history,
  and complete response batch. Retries reuse that captured input.
- Reject `sendMessage()`, `setMessages()`, and `resendMessages()` synchronously
  while a batch is pending or claimed, without changing the batch, messages,
  state, or active resume. Once the batch is consumed, existing message-action
  behavior applies unless recovery is required. Changing threads retires the old
  batch locally.
- Require an explicit opaque batch ID on resume to reject stale submissions.
- Expose `pendingInterrupts`, `isResuming`, and `resume()` through core and all
  React/Angular chat and completion variants, using Hashbrown-owned public types.
- Stop before RUN_STARTED releases the claim; stop after RUN_STARTED preserves
  consumption. Neither operation submits protocol cancellation responses.
- An interrupt is a hard pause: no local tool execution or automatic continuation
  occurs at that boundary. Preserve old calls for later result correlation.
- Preserve response schemas as immutable data; application code owns schema
  validation. Enforce expiration before claim and every send. An expired batch
  remains visible but requires a new thread to continue.
- A failed resumed run after RUN_STARTED requires a new thread before any further
  requests. Never automatically restore consumed ownership from an error.
- Pending interrupt persistence and reload recovery are outside PR2.
- Completion input changes are deferred during interruption/resume. After
  successful resumed execution, submit only the latest input; wait through a
  further interruption and do not submit on a recovery-required thread.

## Complete-batch resume

Approved on 2026-09-09. PR2 supports one resume submission for the entire pending
batch. Applications may collect answers independently, across separate controls
or screens, but retain those draft answers themselves until every interrupt has
a response. Hashbrown does not accumulate partial answers or start a resumed run
from a subset of the batch.

Before claiming the batch or scheduling a request, validate that the submission
contains exactly one response for each pending interrupt ID. Missing, unknown,
or duplicate IDs cause a synchronous API error and leave the pending batch and
committed checkpoint unchanged. Entry order does not determine completeness;
interrupt IDs identify the responses.

A `cancelled` entry counts as a response for its interrupt and is sent to the
server with the rest of the batch. It does not mean locally stopping the run or
silently discarding that interrupt.

For example, if the server asks for purchase approval and a shipping address,
approving the purchase alone does not resume execution. The application submits
both responses together once an address is selected or that interrupt is
explicitly answered with `cancelled`.

This deliberately favors simple batch ownership over allowing independent
interrupts to resume parts of an agent immediately. Partial submissions and
runtime-owned draft-answer accumulation are outside PR2.

## Shared state while paused

Applications may explicitly replace shared state through the existing
`setState()` API while a batch awaits responses. These edits become committed
local state, so the resumed request may differ from the state originally
committed at the interrupt boundary. Canonical message history is preserved.

The state write lock begins synchronously when resume claims the batch and
remains held throughout the resumed logical run, including pre-RUN_STARTED
retries. Existing terminal settlement releases the lock. If a resumed attempt
fails, rollback restores the state captured for that resumed run, including
application edits made during the pause.

PR2 does not add a state replacement or patch argument to resume. Applications
use `setState()` before submitting the complete response batch.

## Ordinary message actions while paused

Approved on 2026-09-11. Ordinary message actions cannot silently supersede an
unanswered or claimed interrupt batch. Applications must submit the complete
batch, using `cancelled` entries where appropriate, or change threads before
using these actions. This restriction applies equally across core, React, and
Angular facades.

Retiring a batch locally on a thread change does not notify the server that its
interrupts were cancelled. Protocol cancellation is expressed by submitting
`cancelled` resume entries. PR2 does not introduce a separate local abandonment
API.

## Stop semantics

`stop()` cancels active execution; it does not construct or send `cancelled`
resume entries.

- While paused with an unclaimed batch and no active execution, preserve the
  existing nothing-is-running API error and leave the batch unchanged.
- Before a matching RUN_STARTED, stop cancels the resume attempt, prevents
  further retries, releases the claim, and leaves the batch actionable.
- After a matching RUN_STARTED, stop cancels the active run and rolls back its
  current draft state/messages to that run's checkpoint. The old batch remains
  consumed, and further requests require switching to a new thread. Earlier
  successful run checkpoints and local tool effects are not undone.

As with a failed connection, stopping before observing RUN_STARTED does not
prove that the server never accepted the request.

## Batch identity and stale submissions

Each published interrupt batch has a fresh opaque Hashbrown-owned `id`. Resume
requires that identity explicitly alongside the complete response batch:

```ts
chat.resume({
  batchId: batch.id,
  entries: [
    { interruptId: 'purchase', status: 'resolved', payload: true },
  ],
});
```

The runtime owns this ID alongside its pending interrupts. It is separate from
shared AG-UI application state and is not serialized into the server request;
only the entries become the protocol `resume` array. Applications retaining
draft answers should associate them with the batch ID originally presented,
rather than substituting the latest ID at submission time.

Resume rejects a batch ID that is no longer current, including after consumption
or thread retirement. A subsequent interrupt outcome receives a new batch ID,
even if the server reuses the same interrupt IDs. Pre-RUN_STARTED retries and
claim release preserve the current batch ID so its existing answers remain
usable. Validation relies on ID equality, not JavaScript object identity.

## Public API and status

Expose `pendingInterrupts`, `isResuming`, and
`resume({ batchId, entries })` consistently across core, React, and Angular.
`pendingInterrupts` is a `PendingInterruptBatch | undefined`; a batch contains
its opaque `id` and the complete readonly `interrupts` array. React exposes
values, core exposes StateSignals, and Angular exposes Signals. Resume follows
the existing synchronous command API: invalid submissions throw immediately;
execution errors are exposed through the runtime's reactive error state.

Define Hashbrown-owned public types named `PendingInterruptBatch`, `Interrupt`,
`ResumeEntry`, and `ResumeOptions`. Preserve protocol interrupt and resume fields
without requiring application imports from AG-UI. Framework signatures reference
these public core types, never internal exports prefixed with `ɵ`.

The public shape is:

```ts
interface Interrupt {
  readonly id: string;
  readonly reason: string;
  readonly message?: string;
  readonly toolCallId?: string;
  readonly responseSchema?: Readonly<Record<string, unknown>>;
  readonly expiresAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly subagentRunId?: string;
}

interface PendingInterruptBatch {
  readonly id: string;
  readonly interrupts: readonly Interrupt[];
}

interface ResumeEntry {
  readonly interruptId: string;
  readonly status: 'resolved' | 'cancelled';
  readonly payload?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface ResumeOptions {
  readonly batchId: string;
  readonly entries: readonly ResumeEntry[];
}

// Shared command signature; properties use each framework's signal/value form.
resume(options: ResumeOptions): void;
```

The schema and metadata records do not promise inferred application payload
types. Runtime ownership still recursively clones/freezes JSON data; TypeScript's
shallow readonly records are not the ownership mechanism. Invalid local data
throws before mutation or scheduling. Error messages must distinguish stale
batch, incomplete/invalid responses, expiry, duplicate claim, and recovery
requiring a new thread. Preserve the underlying execution error for diagnosis.

| Phase | Pending batch | isResuming | isLoading |
| --- | --- | --- | --- |
| Awaiting answers | Visible | false | false |
| Claimed, before RUN_STARTED | Visible | true | true |
| Resumed run executing | Cleared | true | true |
| Resumed execution settles | New batch if interrupted again | false | false |

`isResuming` becomes true synchronously on a valid claim and remains true during
pre-RUN_STARTED retries and the entire resumed interaction, including genuinely
new local tool execution and its follow-up runs. It becomes false when that
interaction completes, interrupts again, is cancelled, fails, or is retired.
Existing aggregate loading semantics continue to cover local tools and
follow-up runs.

Each ordinary successful run in the interaction commits its own checkpoint.
Follow-up runs omit the consumed resume entries and use ordinary run retry
rules. They capture the checkpoint after local tool settlement; they do not
reuse the original resume request. A fresh interrupt ends the interaction and
publishes a newly identified batch without local execution at that boundary.

Deferred completion input is released only after the whole resumed interaction
succeeds, including all tools and follow-up runs. A model run finishing before
its local tools execute is not sufficient. Failed later attempts roll back only
their drafts, not already committed earlier runs or tool effects.

## Validation and response schemas

Hashbrown validates protocol structure, local ownership, and expiration.
Applications own response-schema validation before submission; the server
remains authoritative for accepting answers and enforcing its deadlines.

- Validate incoming interrupt fields and reject duplicate interrupt IDs within
  a batch.
- Validate outgoing batch identity, complete membership, entry statuses, and
  JSON-compatible payloads/metadata before claiming or scheduling execution.
- Preserve optional `responseSchema` as an owned immutable JSON object exactly
  as supplied, without conversion to Skillet or compilation into a validator.
  Applications can use it to render forms or validate draft answers. Omitted
  schemas remain absent.
- Preserve `expiresAt` for display and enforce expiry locally according to the
  approved expiration policy below. This supersedes the original server-only
  enforcement decision.

For example, an interrupt may carry:

```json
{
  "id": "shipping-address",
  "reason": "input_required",
  "responseSchema": {
    "type": "object",
    "properties": {
      "addressId": { "type": "string" },
      "delivery": { "type": "string", "enum": ["standard", "express"] }
    },
    "required": ["addressId", "delivery"],
    "additionalProperties": false
  }
}
```

Its resolved resume entry can contain a payload such as
`{ addressId: 'address-123', delivery: 'express' }`. Hashbrown checks JSON
compatibility, not conformance to the supplied response schema. PR2 adds no
JSON Schema validation dependency.

## Persistence and reload recovery

PR2 retains pending interrupts and batch ownership only within the live runtime.
It adds no checkpoint export/import API or server-driven reload recovery flow.
Recreating the runtime, including after a page reload, does not restore a pending
batch. Application-held draft answers alone are not sufficient to resume it.

A future persistence design must restore a coherent checkpoint containing the
thread identity, complete canonical message history, committed shared state,
and interrupt ownership. Restoring only public messages, interrupts, or a batch
ID would not preserve that contract. The PR2 documentation must explicitly state
this limitation and must not imply that initializing the same thread ID restores
pending interrupts or makes saved batch IDs valid in a new runtime.

## Research: interrupt boundaries and tool execution

Investigated on 2026-09-12. Source observations provide evidence; the subsequent
approved behavior sections record decisions made after reviewing that evidence.

### Protocol and reference evidence

- The [interrupt contract](https://docs.ag-ui.com/concepts/interrupts) describes
  a two-run tool lifecycle: proposal, resume decision, then result correlated
  with the original tool-call ID. It requires nonempty interrupt batches and
  replay-safe identical decisions. It recommends client payload validation and
  requires client expiry enforcement.
- The [reference client lifecycle tests](https://github.com/ag-ui-protocol/ag-ui/blob/main/sdks/typescript/packages/client/src/agent/__tests__/interrupts-lifecycle.test.ts)
  verify full-batch coverage, rejection of ordinary input while interrupted,
  and rejection of expired resumes.
- The [reference resume helper](https://github.com/ag-ui-protocol/ag-ui/blob/main/sdks/typescript/packages/client/src/interrupts/index.ts)
  rejects missing/unknown response IDs and constructs cancelled entries without
  payloads.
- [LangGraph issue #2014](https://github.com/ag-ui-protocol/ag-ui/issues/2014)
  reports resumed tool calls being re-announced, causing transcript and loading
  regressions. This is implementation evidence for a regression test, not an
  alternative protocol contract. Do not infer deployed fix availability from
  the existence of a related PR.

### Current code observations

Hashbrown's `finishAttempt` reserves attempt-owned pending tools and publishes
the snapshot for execution. The assistant-turn coordinator then executes tools
after every outcome currently represented as `finished`. Merely publishing a
pending interrupt without changing these paths would leave automatic execution
enabled.

The canonical message reducer already correlates TOOL_CALL_RESULT with calls
present in retained history. PR2 should test this across the interrupt boundary,
including a result-only resumed run, rather than requiring another tool start.

The current local Threadplane adapter distinguishes paused terminal delivery
from success. Its client-tool `resolve` gateway checks for an interrupt before
settling and continuing, but its lower-level `settle` method lacks that guard.
Its InterruptSession also now models uncertain/recovery-required delivery and
checks expiry. These observations supersede the older handoff's description of
that adapter; they are not a reason to expand PR2 to its persistence or legacy
transport features. No reference test suite was executed during this research.

### Approved hard-pause behavior

Approved after review of the research on 2026-09-12.

At a valid interrupt boundary, commit the checkpoint and publish the batch
without reserving or running local tools or automatically continuing. Preserve
historical calls for result correlation. Resume transmits the decision to the
server and must not drain saved calls through local handlers. A later ordinary
successful run may execute genuinely new, eligible local calls under existing
ownership rules. This whole-run pause is a Hashbrown orchestration policy
derived from the contract, not a claim that AG-UI standardizes our local executor.

Add tests for zero local executions at interruption, no execution merely from
resume submission, result correlation using original IDs, no historical-call
execution after resume success, mixed old/new calls, and checkpoint rollback.

### Approved expiration policy

Approved on 2026-09-13. Check expiration before claiming the batch and immediately
before every transport send, including retries. If any interrupt has expired,
reject the complete submission without sending it. Never silently drop expired
entries or invent `cancelled` answers. Keep the batch visible for diagnosis.

If expiry occurs after claiming but before a send or retry, stop execution,
prevent further retries, release the claim, unlock state on settlement, and
surface an error. The retained expired batch cannot be resumed. Expiration does
not retroactively cancel a request already sent before the deadline.

Malformed `expiresAt` timestamps are incoming protocol errors. With checkpoint
recovery deferred, PR2 requires the application to start a new thread to continue
after batch expiration; it does not resume the expired server workflow.

### Approved recovery boundary after resumed-run failure

If a resumed run fails after a matching RUN_STARTED, retain consumed ownership
of the old batch, roll back draft state/messages to the resumed run's checkpoint,
and surface the error. Block further requests on that thread until the
application switches to a new thread. This recovery-required guard takes
precedence over ordinary message-action eligibility after batch consumption.
It must cover message sends, replacement-triggered requests, resends/reloads,
resume calls, and automatic generation paths across all facades.

RUN_STARTED confirms execution began, not that the answer passed server
validation. Do not infer recoverability from free-form error messages or
automatically restore the consumed batch. Richer reconciliation is outside PR2.
Changing threads abandons the old workflow locally; it does not repair or cancel
server-side work. Schema validation may remain application-owned, but
documentation must explicitly assign that responsibility.

## Completion API parity

Text, structured, and UI completion hooks/resources expose `pendingInterrupts`,
`isResuming`, and `resume()` with the same types and semantics as chat APIs.
A valid interrupt commits available output through the existing projection and
pauses without becoming an error solely because it interrupted. Applications
can collect responses and resume that completion using its current batch ID.

Input-driven generation must respect pending/claimed batches and the
recovery-required guard. Framework effects must not bypass these guards or let
a synchronous command rejection escape as an unhandled framework effect error.

### Deferred completion input

When completion input changes while interrupted or resuming, defer generation
and keep only the latest input. Do not replace the current checkpoint, change
the resume payload, or initiate a new run merely because input changed.

For example, input A interrupts; input changes to B and then C. Resume still
answers A using its checkpoint. After resumed execution succeeds, begin a new
completion for C, never B. If resumed execution interrupts again, continue
deferring. If it fails and requires recovery, do not submit the deferred input
on that thread. A batch consumed at RUN_STARTED alone does not release the
deferred input; the resumed execution must first finish successfully.

This is latest-value deferral, not a queue of every input change. If no input
change needs processing, successful resume must not regenerate the original
input. Existing input eligibility rules remain applicable. Thread-switching
rules below govern handoff of the latest input.

### Cancellation and deferred input

Stop never initiates deferred completion input. Before a matching RUN_STARTED,
retain the pending batch and latest deferred input, release the claim, and allow
a later successful resume to release that input. After RUN_STARTED, cancellation
requires a new thread before further requests, just like resumed-run failure.
Do not submit deferred input on the cancelled thread. This rule also applies
while stopping local tools or follow-up runs in the resumed interaction.

## Verification requirements

The implementation plan must cover approved behavior through failing tests
before production changes. Required scenarios include:

- Atomic state/message/interrupt publication and rollback of failed attempts.
- Batch membership, stale IDs, duplicate claims, repeated server interrupt IDs,
  and ownership release before RUN_STARTED versus consumption afterward.
- Exact resume wire input, retry checkpoint reuse, no retry after RUN_STARTED,
  stop behavior, and recovery-required request rejection.
- State writes during a pause and synchronous locking on resume claim.
- Expiry before claim, between claim and send, and during retries, with no send
  after expiry and no automatic cancellation answers.
- Historical tool results, no tool execution at interrupt boundaries, and
  genuinely new local tool calls after ordinary success.
- Text, structured, and UI chat/completion parity in React and Angular;
  deferred latest input, repeated interruption, and failure without deferred send.
- No-interrupt backward compatibility, immutable input ownership, public type
  inference, API reports, and realistic HTTP/SSE transcripts in both frameworks.

Run build, test, lint, and API reports for each affected package, plus applicable
e2e/runtime-smoke checks. Do not add dependencies without approval. The design
still requires section approval, independent spec review, final user review,
and an implementation plan before production work starts.

## Malformed interrupt outcomes

Reject malformed interrupt outcomes atomically. Empty batches, duplicate IDs,
missing required fields, and invalid expiration timestamps cause a non-retryable
protocol error. Roll back the attempt's draft state/messages and publish no
partial interrupt batch. If this happens after RUN_STARTED in a resumed run,
the approved recovery-required guard also applies.

Unknown `reason` strings remain valid extension values. An omitted outcome
retains ordinary completion behavior. Validation must finish before accepting
the interrupt terminal event as a committed checkpoint.

## Thread switching and stale callbacks

A different effective thread ID synchronously retires the old batch and
interaction, invalidates its claims, and clears local recovery status. Setting
the same ID does not reset anything or bypass a pause/recovery guard. An explicit
clear to `undefined` follows the existing behavior of generating a fresh opaque
ID for the next request; omitting the option does not change the identity.

Retirement rolls back only the active draft. Preserve committed messages and
state, including existing canonical IDs and configured-system overlay, matching
the runtime's current behavior. Applications can explicitly replace them after
switching. This is a new workflow with retained context, not restoration of the
old server workflow.

Late events, errors, claim releases, tool settlements, and terminal callbacks
from retired generations must be no-ops against the replacement thread. Validate
local ownership as well as wire run/thread identity. New batches receive fresh
IDs; never accept a saved old batch ID merely because interrupt IDs match.

Completion APIs may apply the latest eligible input on the new thread once,
even when its value did not change. Clear old deferral/attempt ownership when
handing it off and never carry old resume entries to the new thread. Chat
thread changes alone retain their existing scheduling behavior.

Switching back to a previous thread ID does not restore a batch or repair the
server workflow. Recovery requires a genuinely new thread identity; callers
must not use alternating old IDs or runtime recreation as a recovery mechanism.
PR2 does not retain a per-thread cache or implement server cancellation.

## Compatibility and observability

Callers that never receive interrupts retain existing behavior, including
canonical IDs, omission of absent state, ordinary retry policy, state locks
around model requests, and local tool state writes. Explicit success and absent
outcomes both use the ordinary completion path.

Interrupted runs may have no assistant output or only partial structured output.
Do not manufacture a completion value solely to expose the interrupt. Preserve
existing projection/schema behavior while retaining the protocol checkpoint;
the final review must verify structured-output finalization does not mistakenly
turn a valid pause into a schema-completion failure.

Devtools may expose batch ownership and execution phase through the existing
store projection. No external telemetry is added. Do not include payloads or
metadata in routine error messages. Applications render arbitrary reason and
message values as data and choose their own response-schema validation library.

## Delivery and review

The approved decisions above form the behavioral basis for a single focused
PR2. The concrete architecture and public type declarations in this consolidated
specification are subject to independent review and final user approval. Review
findings that change an approved behavior must be surfaced rather than silently
replacing it. No production code has been changed.

After spec approval, write a TDD implementation plan with explicit core,
framework, documentation, API report, and conformance coverage. Review the
implementation independently, run affected verification, open a focused PR,
and merge only when required checks are green. Preserve unrelated user changes.

## Implementation context

The branch starts from origin/main at cd58105, including PRs #537–#539.
The existing logical-run retry policy does not distinguish failures before
and after RUN_STARTED. The driver validates run/thread identity before invoking
onStarted. Interrupt outcomes must survive the driver and coordinator rather
than being collapsed into ordinary completion.

This specification is pending independent review and final user approval before
implementation planning.
