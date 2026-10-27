# Native .NET mixed tools and durable session ownership

## Goal and delivery order

Support a single model response containing browser tools and registered server functions through the pinned Microsoft Agent Framework (MAF) pipeline. Preserve authenticated isolation, current-call ownership, at-most-one registered backend dispatch, native history ordering, and fail-closed recovery across replicas and worker death.

This is the first of the two priorities approved by the user. Deliver and merge this milestone on green, then add native MAF approvals in a second reviewed specification/PR using the same ownership infrastructure. Reasoning items, provider-hosted tools, general chat-product/archive APIs, NuGet product packaging, new dependencies, release safeguards and actual cloud managed identity qualification are outside these milestones. Existing application-workflow confirmations remain supported.

## Verified pinned behavior

Baseline: .NET SDK 10.0.402; MAF 1.26.0; hosting/AGUI hosting 1.26.0-preview.261023.1; AGUI 1.0.1; OpenAI 2.14.0; Azure.AI.OpenAI 2.1.0; Azure.Core 1.63.0; Npgsql 10.0.3. No dependency additions or updates are needed.

Executable reflection, serialization and actual `MapAGUIServer` loopback probes against these exact installed packages established:

1. `EnableInvocableFunctionBypassing` retains backend calls in the native session when a model response also requests a browser declaration. The next request can restore that session, accept the browser result and execute the stored backend call.
2. `AgentSessionStore` has no ownership/revision/CAS contract. Restoring an older serialized approval session can execute the operation again.
3. The function-invocation `AIAgent.AsBuilder().Use` hook receives the genuine call ID, arguments and native session immediately before backend invocation. Native bypass state is already removed at this point, so it cannot serve as the effect ledger.
4. Default MAF history storage duplicates Hashbrown's complete browser history. Public `InMemoryChatHistoryProvider` filters returning empty collections for stored requests, stored responses and provided history keep native pending state while avoiding a second transcript accumulator.
5. The pinned AGUI host writes genuine `RUN_FINISHED` **before** awaiting `SaveSessionAsync`. A native terminal event alone is not a durability acknowledgement.
6. Stores are resolved by stable agent name. `AgentIsolationKeyProvider` supplies a caller partition, independently of authentication. Every store-key partition is significant.

The session/bypass surface is experimental and raises `MAAI001`; use a narrow per-file pragma with the pinned compatibility reason, not a global suppression.

Upstream references are [the mixed-tool sample](https://github.com/microsoft/agent-framework/blob/main/dotnet/samples/05-end-to-end/AGUIClientServer/README.md#mixed-client-and-server-tools) and [native approvals](https://learn.microsoft.com/en-us/agent-framework/integrations/by-component/ui/ag-ui/human-in-the-loop). Installed-package executable probes, rather than current upstream-main documentation, establish the behavior above.

## Approach

Use native MAF sessions and function middleware with a PostgreSQL ownership journal. This preserves Microsoft's invocation, argument binding, deferral, serialization and AGUI transport behavior. A separate Hashbrown tool orchestrator would duplicate those semantics; a native in-memory session store would not satisfy replica/restart requirements.

The existing stateless recipe stays available, including its same-turn mixed-tool rejection. A new explicit native-session composition helper couples all required pieces: native bypass, public no-history filters, authenticated isolation, the durable store, invocation middleware and terminal publication barrier. The mixed-tool guard is relaxed only inside a currently admitted native-session request. Merely attaching an arbitrary session store must not enable it.

## Trust boundary and admission

- Native mode requires an explicit authorization policy, an authenticated caller and a nonempty server-owned scope resolver. No anonymous or `local-fixture` fallback applies to native routes. Fixture credentials remain test infrastructure.
- `threadId` is a selector, never authority. Stable agent name, trusted scope and the complete native store-key partition set identify the row. Preserve ordinal partition names/values and reject inconsistent keys; never discard unknown partitions or accept browser-selected partitions.
- Persist trusted server compatibility separately from the selector key so changing provider/API/endpoint/model, native format or registered tool/catalog version produces a conflict, not a fresh executable session. Reuse `ServerConfigurationIdentity` for the model binding.
- Tools form an immutable server catalog with explicit operation versions. Browser declarations cannot reuse server names. A registry/version/schema mismatch fails before model or function work.
- An existing native session is restored only through MAF's public serialization APIs into an independently deserialized instance. Keep its JSON private. Missing, expired, deleted or incompatible state must not silently become a fresh continuation.
- Initial-session admission cannot import pending tool calls/results or approvals from browser history. Continuations validate the owned public-history prefix, current browser configuration and the exact expected browser call/result IDs. New or changed server calls, changed original arguments, duplicate IDs and unmatched results fail before execution. Browser tool result values remain caller data, not server dispatch authority.
- Request run IDs convey no ownership. Each admitted request obtains a random server token, generation, revision and database-clock lease before upstream work. Conflicting requests receive a bounded pre-work conflict response. All reads/saves/dispatches validate the same owned key and session instance.

### One bounded public-history projection

Persist one bounded **current canonical public transcript** beside the opaque native session. This is the admitted input transcript advanced by the genuine AGUI events emitted during that request, not a second MAF chat-history provider or an append-only event log. Reuse/extract the existing canonical SSE-fold rules, and match the supported SDK’s canonical message identities (including its deterministic `assistant-{callId}` fallback when the native event omits a parent). Preserve native supplied identities; raw diagnostic extras cannot create history or authority.

The same owner/revision CAS atomically saves the native blob, projected transcript, native pending-call descriptors and expected visible browser-call IDs. This stored projection becomes the next owned prefix. Only two normal deltas are admitted: (a) the exact outstanding browser result IDs, once each, after their recorded calls; or (b) a new user turn after the previous native turn completed. Match call names/arguments against their owned descriptors, compare JSON arguments canonically, reject prefix edits/new server calls/duplicate IDs, and keep the complete configuration fixed while work is pending. Normal client configuration changes may be admitted only after all pending work is settled.

If native output cannot be represented canonically, is incomplete or exceeds a limit, do not reconstruct authority from a browser transcript. Retain safe effect state, mark continuation/history unavailable and require a new thread or authorized terminal retirement. The first milestone therefore does not silently accept arbitrary historical edits, unsupported reasoning/raw output or imported tool history.

## Persistence and state transitions

Add separately versioned native-session, invocation and audit tables under the application's validated schema. Keep existing schema-3 checkpoint rows, fingerprints, operation versions and reconciliation semantics unchanged. Initialization is idempotent under a short advisory transaction lock and rejects unknown native schema versions. Never convert existing workflow checkpoints into native sessions or approvals.

The native-session row owns the opaque native JSON, bounded current public request/configuration, compatibility identity, revision, active token/generation/lease and terminal/blocked disposition. The invocation journal owns each actual model-emitted server call ID, registered name/version and cloned canonical arguments. Capture those descriptors below native bypass before yielding the corresponding model calls; a browser-replayed function call cannot create a journal entry.

1. Acquire one current request owner using a short locked transaction and database time sampled after locking.
2. Restore the owned native blob and run MAF with the complete validated browser history and the public no-history filters.
3. Before every actual function invocation, the public function middleware verifies the native session, registered function, stored descriptor and unexpired owner. Commit the irreversible `Started` marker before calling the native continuation delegate.
4. Record completion under the same token/generation after the delegate returns. A repeated/changed call ID cannot dispatch again. No cached-result retry queue or custom function loop is introduced.
5. Commit the native session and pending/public state using revision/owner CAS into a saved-but-unpublished state. Keep request ownership through the publication protocol below; a successful save alone does not release the request lease.

Lease renewal is owned by the request, bounded and cancellable. No database transaction spans model calls, function execution, streaming or a wait gate. Loss of renewal/ownership cancels cooperative work; every subsequent dispatch still checks storage. Cleanup uses its own short cancellation budget and cannot mask the primary failure.

A known pre-dispatch failure can release ownership and permit a fresh admitted attempt. Once a registered dispatch started, an abandoned request, callback failure, unknown completion or failed session save leaves a retained unknown/ambiguous fence. Do not replay the native blob or redispatch automatically. A late worker cannot dispatch, save, publish a durable terminal or overwrite a reconciled observation after losing authority.

The guarantee is at most one registered executor dispatch per owned native call. It does not establish exactly-once external effects or provider compute/billing cancellation. Applications still own tool permissions, downstream idempotency and evidence of external effects.

## Native terminal publication barrier

Wrap the actual upstream result and observe its bounded UTF-8 SSE framing. Preserve ordinary native event order and bytes; do not synthesize `RUN_STARTED`, a successful terminal, model results or tool results. Hold the genuine terminal frame while allowing preceding streaming events to flow. Return from the intercepted write so the upstream host can reach its save; awaiting save inside that write would deadlock the pinned ordering.

After upstream execution finishes, release the genuine terminal only when the matching durable save/failure bookkeeping has succeeded. The save returns a private receipt bound to selector, owner token/generation and saved revision. Immediately before publication, acquire a separate CAS publication reservation for that receipt under the current unexpired owner. If an expired pre-publication owner was replaced, or retirement/reconciliation changed authority, this authorization fails and its terminal is withheld.

An authorized publication keeps the selector in `Publishing` until the bounded write finishes and finalization releases ownership. A continuation arriving in the normal write/finalize race waits on that stored state for a short bounded admission interval, then either acquires ownership or receives a conflict; it never starts model/function work concurrently. Expired `Publishing` is a retained publication-unknown fence, not an automatic takeover path. Retiring that state requires operator-established publisher quiescence. As with an already-issued external-effect permission, CAS cannot retract network bytes already authorized/in flight; this limitation must be explicit. No newer owner is admitted during that reservation without quiescence. Finalization/cleanup from an older generation cannot change a newer row.

Persistence failure, stale ownership, invalid framing or size limits must not expose a success/interrupt acknowledgement. An incomplete stream is preferable to a false durable completion. Error/cancellation paths retain dispatch fences and bound all buffers. Tests must prove that SDK browser tools do not run while the terminal/save gate is held; also pause after save but before publication authorization, replace/retire the owner, and verify that the older terminal never becomes visible. Pause after publication authorization to prove that competing ownership remains blocked until finalization or verified quiescence.

## Recovery, reconciliation and retention

- This milestone persists native pending execution state and one bounded current canonical prefix for admission/recovery. It does not add general chat archive/list/search APIs or a second MAF history accumulator. The browser still supplies the complete canonical transcript, which is checked against the stored prefix. Keep private opaque state separate from public recovery snapshots.
- A browser callback can continue on another instance after the first worker dies **after** durable pending-state publication. The backend call must come from the restored native session, not from client history.
- Reload must never automatically repeat browser tools or approvals. Missing client results cannot be invented. Expose a read-only bounded native-session disposition; pending client-result work remains blocked until a valid result arrives or the session is explicitly retired. A new thread remains available.
- Native invocation inspection/reconciliation requires a separate operator policy and server-owned permitted scopes/actor. CAS state/generation/revision, bounded external evidence and owner-quiescence acknowledgement; terminal reconciliation invalidates continuation/save authority and never executes or reopens work. Retain an immutable audit. Existing application-checkpoint operations remain separate.
- Expiry or explicit delete atomically retires the selector and purges private bytes while retaining a minimal keyed tombstone. Keep its generation/revision and irreversible retired/blocked disposition; it contains no transcript or native arguments. **Normal maintenance never deletes a selector tombstone or reopens that selector**, including sessions that never dispatched a backend call. A later ordinary request, browser callback or approval resume for it fails closed. A new conversation uses a new selector. Concurrent first creation of the same key is serialized by unique-key/CAS admission so exactly one owner is established.
- Bound session JSON, request/history, call count/arguments, retained records, query sizes and buffers. Active/unknown payload capacity and retained-selector metadata capacity are separate configurable limits (proposed defaults: 128 payload sessions and 4,096 selector records per agent/scope). Tombstones count toward the latter; reaching it rejects new allocation before model work. This bounded reference does not claim unbounded chat-session creation. Operators provision capacity deliberately; destructive deletion/DB rollback of safety metadata invalidates the guarantee. Unresolved dispatch/publication fences are never silently evicted. Maintenance and retention are explicit application-owned lifecycle operations.
- Support bounded public snapshots only where native events establish canonical history; otherwise expose unavailable status without inventing an answer. Full general AGUI replay, reasoning/raw extras and mixed-version rolling operation remain outside the guarantee. Continue to drain older workers when changing the native format/compatible catalog.

## Integration boundaries

New source belongs in `tools/conformance/dotnet/Integration/`, separated into contracts/options/key derivation, PostgreSQL session/journal persistence, request ownership/lease lifecycle, native agent composition/invocation middleware, endpoint admission/operations and terminal publication. Avoid adding a large second responsibility to existing checkpoint classes.

`Program.cs` and `Testing/` opt into native mode for dedicated scenarios with real fixture authentication, PostgreSQL, durable effect observations and deterministic gates. Preserve the existing stateless/application-confirmation fixtures and their current tests. Production docs must not copy fixture identities or controls.

Document the new opt-in recipe for both frameworks with identical compiled C# examples. Keep the existing four examples and 16 compilation combinations. Add checked native-recipe compilation for both providers/APIs and explicit auth/isolation/store lifecycle. Update the main guide's blanket limitation to distinguish stateless and native-session modes; preserve the SDK 0.8.2 diagnostic minimum.

## Acceptance

1. Pinned real native clients and strict aimock, both providers/APIs: browser-first and server-first sibling order in a single response; multiple browser and server siblings; no backend dispatch before browser results; one real backend result and exact call/result history in the next model request; subsequent turns do not replay.
2. Authentication/isolation: missing auth/scope, same thread across principals/agents/partitions, mismatched server/tool configuration, forged history/arguments/results and arbitrary run IDs. No unauthorized model/effect work or private state disclosure.
3. Real PostgreSQL, separate processes/instances: saved pending state survives worker death; competing continuations, stale owners/saves, pre-dispatch lease takeover and current-owner renewal.
4. Deterministic crash/outage gates: before/after pending save, withheld terminal, save-completed/before-publication authorization with a replaced/retired owner, publication-reserved/new-owner competition, before dispatch, committed marker before invocation, after effect before completion/save, result/session persistence failure and operator reconciliation with a late worker. No guessed sleep establishes ownership or quiescence.
5. Cleanup/migration: initialization beside real schema-3 rows, unknown native versions, corrupt/oversized/incompatible blobs, expiry/delete/capacity, private-byte purge retaining unknown fences and reconciliation audit. Test retired-selector rejection after repeated cleanup even when it had no invocation fence, and atomic competing first creates. Test the exact canonical input/event/output prefix across successive mixed and ordinary turns; unknown/unrepresentable native output cannot be replaced with browser history.
6. React and Angular browser cases for all OpenAI/Azure × Chat Completions/Responses projects, including actual reload/worker restart, cancellation, meaningful status and native exact histories. Retain all existing coverage. Test published SDK 0.8.3 consumers as well as source builds.
7. Add one bounded `mixed-native-tools` live group per existing six projects. Existing seven groups and their evidence remain. Reserve two calls for the new group: total reservation becomes 99, case count 48; keep maximum 128 calls/run, four/group, 384 requested output tokens, 60-second scenario and 15-minute run deadline, zero retries and mandatory native evidence. A live model must genuinely co-emit both calls; do not synthesize a mixed response. Failures remain evidence rather than triggering automatic retry-until-pass.
8. Build/test/lint all affected projects, compile every documented recipe, verify docs routes/highlighting, independent spec/quality/final review, PR required CI, merge on green and verify the merged tree/main deployment. No SDK release is included.

## Native approval follow-up (second milestone)

The subsequent specification will persist original public `ToolApprovalRequestContent` descriptors alongside the native session. An outer native-agent adapter replaces the matching browser pending call at its history position with that owned request, maps approved/declined generic resume content to `original.CreateResponse(...)`, and retains native MAF binding/invocation as the authority. It will suppress only the exact redundant, already-announced server call in the outer public update projection, preserving the genuine result and inner native model history. Published React/Angular 0.8.3 probes proved this shape; unadapted MAF changes the parent ID and correctly trips the SDK guard.

Native approval recovery, multiple decisions, decline/cancel, expiry, two-worker competition and crash/reconciliation tests will be designed against the completed first-milestone contracts. The existing application-workflow confirmation flow remains distinct. Extend bounded live coverage with a four-call native-approval group (total reservation 123, 54 cases), retaining the same 128-call maximum. No core replay guard relaxation or new SDK release is planned.
