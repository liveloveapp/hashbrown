# Native AG-UI subagent support

## Scope

Continue the approved tool-step contract's slice 6 after the pure UX helpers
in Hashbrown #805. Consume the existing AG-UI 1.0.3 lifecycle and attribution
fields. Do not invent a B4 subagent protocol, orchestrate agents, add dependencies,
change tool-step merge rules, implement file search, or write release notes.

The user authorized implementation and merging #805 when green. The new work
starts from #805's updated head ed0f431e while its CI runs, then moves onto
up-to-date main after that squash merge. No merge authorization is inferred for
the new subagent PR.

## Protocol and public state

Add a neutral public `SubagentRun` type and `subagents` reactive array to the
core chat runtime and React/Angular chat facades (including structured/UI chat
facades derived from them). Records are keyed by opaque `subagentRunId`, in
first-observation order. Fields: subagentRunId, optional name/description,
parentSubagentRunId/parentToolCallId/parentMessageId, runId, result, error
{message, code?}, timing {startedAt?, settledAt?}, interruptIds, and status
`unknown | running | awaiting | complete | failed | cancelled`.

Attribution-only IDs are valid and yield unknown records without invented
names/times/outcomes. STARTED announces running and its declared links/name;
FINISHED with absent/success outcome completes; suspended means awaiting;
ERROR means failed, without failing the enclosing run. Use only supplied finite
timestamps, never read a clock for display timing. Start and settlement timing
are independently optional; a known terminal time never invents a start time. Own/freeze JSON result and
metadata-derived values. Do not flatten provider answer attribution into this
provenance model.

Enforce lifecycle-required field types even for in-process producers. Opaque
string IDs, including empty strings and prototype-like strings, are distinct
from the parent's absent owner. Reject duplicate starts within a run, finish or
error without a current start, invalid typed outcomes/interrupt IDs and a parent
not started in the current run. A parent may already have finished. RUN_FINISHED
requires announced invocations to have closed; RUN_ERROR does not. A later run
may restart a suspended ID as one continued row. Same-run reuse after finish
remains invalid. Attribution does not require a started or still-active ID.

Use separate identity buckets for text/messages, reasoning, tool calls and
activities. Known-ID continuation without a tag preserves its established owner;
an explicit conflicting tag is rejected. New untagged entities belong to the
parent. Tool-call start inherits its assistant parent's owner when untagged;
explicit disagreement with that parent is rejected. Results are independently
attributed and never inherit the calling tool's owner. Replacing activity
snapshots may change ownership; replace:false and deltas may not. Authoritative
message snapshots replace ownership for restated messages and calls, consistent
with native replacement semantics; initial/restored history seeds ownership.
A live snapshot retains the current run's announced/active/closed subagent sets
and observed lifecycle records; a later terminal for a previously started child
is still valid. Only explicit history/thread replacement resets that lifecycle.
Attributable state updates still update the single run-scoped shared state.
Steps with the same name are independent per owner, including parent vs empty
subagent ID; a different owner cannot close another owner's step.

## Concurrent streams

Move correlation/ownership into a small pure protocol module, separate from the
large canonical message reducer. Correlate text/tool/reasoning chunks within
owner lanes, not from the latest run-global pointer. Known explicit IDs route by
entity owner; no-ID chunks use an explicit owner, else the parent's compatible
stream, else the sole compatible stream. Ambiguous chunks fail atomically.
Before selecting a lane for a first untagged tool chunk, resolve its explicit
parentMessageId owner; the synthesized call must enter that owner's lane and
must not close the parent agent's unrelated pending chunk.
Check repeated role/name/parent identity fields rather than silently dropping a
conflict. A new chunk entity/kind closes only the previous pending chunk stream
in that lane. A subagent terminal closes only that owner's pending chunk lane;
run terminals/snapshots close all pending chunk lanes. Explicit streams retain
their ordinary explicit end semantics. No sibling/parent output is closed or
reattributed by a child terminal.

The protocol fold returns normalized event(s) including implicit chunk ends.
Root preparation accepts/rejects the entire event transaction before message,
state, status and subagent projections change. Preserve the existing canonical
acceptance/error pathway and root store tests. Tool-step success/failure is
still determined by the binding tool-step Rules and results, not inferred from
a subagent lifecycle event.

Streaming parsers must retain one accumulator per assistant message so
interleaving partial structured text/tool JSON never loses another assistant's
parsed state. Keep the legacy foreground selectors for internal compatibility,
but derive visible messages/tools from all active accumulators. Snapshot
replacement and attempt rollback clear/reseed them consistently. Keep the
canonical history authoritative and preserve local tool-handler references.

## Provenance and restore

Add optional subagentRunId to public/internal assistant and user messages and
client/server calls, plus resultSubagentRunId for independently owned results.
Activities retain their existing links.subagentRunId; reasoning records already
carry native attribution. Calls inherit their assistant's provenance in native
snapshots; results keep their own. Round-trip these fields through view lowering,
canonical projection, local tool settlement and facade UI types. A client-executed
result is parent-owned unless the producer explicitly attributes that result;
do not copy the caller's owner onto it. Existing call grouping treats different
caller or result subagent identities as barriers, preserving provenance when
applications group a combined call list.

Reasoning attaches to the next appropriate assistant in its own owner lane,
across interleaved siblings; never to an unrelated parent's next answer. Apply
this consistently to source indexes, full projection, reconciliation and live
hydration. Link activities using the latest assistant/tool in the same owner
lane, including snapshot/recovery recomputation. Keep all original IDs and
provider continuation data intact.

Lifecycle state is transactional display state in this runtime, not an added
wire/storage field. It is retained for committed work in the current thread,
rolled back with rejected/retried/cancelled attempts and cleared/reseeded when
history/thread is explicitly replaced (not on a live MESSAGES_SNAPSHOT). Native snapshots preserve message provenance but
cannot reconstruct lifecycle names/outcomes/times: restored owners are unknown,
or awaiting when a retained interrupt explicitly identifies them. Do not add
private lifecycle metadata to canonical messages or change ConversationSnapshot.

At the matching resumeAcknowledged action (RUN_STARTED is accepted, before
continuation settlement), resolve waiting rows by the answered interrupt IDs,
including ancestors suspended because a descendant interrupted. Keep waiting
through failed/pre-ack sends. If the producer reuses the ID, STARTED continues
that row; if it uses a new ID, the old waiting row must stop waiting after the
acknowledgement without claiming it ran/completed. This answered-wait
transition is committed immediately and survives a later failed/cancelled
continuation or attempt rollback, because the pending interrupt batch has
already been cleared. Use
unknown for an answered old row unless a new explicit lifecycle event states its
outcome. Cancellation entries may produce cancelled display state, without
inventing tool outcomes. Clear wait associations only for the matched owned
claim, not stale resume actions.

## Public integration and documentation

Expose the same immutable SubagentRun type from core and both frameworks.
React exposes a readonly array; Angular exposes a Signal of that array, following
existing state/interrupt adapters. Public signatures must not expose private
ɵ types. Forward the property through UI/structured chat and stable decision
runtime wrappers where they already forward chat state. Do not create renderers,
new message roles, UI timers, per-subagent state stores or automatic tool dispatch.

Update both activities/tools guides with parent vs child provenance, lifecycle
and unknown restore state, nesting links, suspension/resume and separate tool
result ownership. Show plain derived data without effects or HTML changes.
Record the official protocol reference, https://docs.ag-ui.com/concepts/subagents,
and the installed SDK verifier/chunk-transform semantics. No upstream posting.

## Verification

Use top-level test(...) with arrange/act/assert. Fail before implementation.
Cover lifecycle validation and nested/sibling timelines; opaque IDs; standalone
and late attribution; absent-tag inheritance/explicit conflicts; snapshot owner
replacement; tool result independence; parent/sole/ambiguous chunks; repeated
chunk fields; owner-specific steps; chunk closure isolation; global state update;
root atomic rejection; partial structured text and tool JSON across siblings;
reasoning/activity lane association; local tool settlement; round-trip restore;
resume with reused/new IDs, ancestors and pre-ack failure; rollback/thread reset;
real framework UI message types and packaged consumers.

Run core/React/Angular build, test and lint, core/framework distribution e2e,
API reports and relevant docs test/lint/build. Existing warnings are reported.
Use serial implementation tasks and independent spec then quality reviews.
Open and attach a new PR; leave it unmerged pending authorization.
