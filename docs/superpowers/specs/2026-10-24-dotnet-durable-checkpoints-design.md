# Durable .NET AG-UI confirmation checkpoints

## Goal and authorized scope

Extend the tested .NET source recipe so a pending application confirmation can be resumed after server restart or on another application instance sharing PostgreSQL. Preserve the existing AG-UI wire contract, principal/thread/request binding, complete-batch validation, provider behavior, and conservative effect boundary. The user authorized autonomous design, review, implementation, pull request and merge, including subagents, and explicitly approved adding Npgsql. Pin Npgsql 10.0.3 and update the existing NuGet lockfile deliberately.

The durable implementation is reusable recipe source under `tools/conformance/dotnet/Integration`, not a new published Hashbrown .NET package. PostgreSQL 18 is the executable reference backend. Keep a process-local implementation as an explicit development option with the same operation and claim contracts.

## Existing behavior and problem

`PendingInterruptStore` stores a dictionary of `WorkflowCheckpoint` records containing `Prepare` and `Execute` delegates. A lock serializes claims within one process, and a stored `EffectStarted` flag prevents ordinary replay. The endpoint and workflow identify a claim through the browser's `runId`; restarting the application loses both pending batches and consumed markers. Neither delegates nor request-local closures can reconstruct a pending operation on another instance.

Both framework recipes compile their server snippets from the tested Integration source. Their confirmation example and compatibility statements must change together with that source. Authentication, server tool authorization, and browser ownership remain application responsibilities.

## Alternatives

1. **PostgreSQL state machine and operation registry — recommended.** A real shared database provides transactional claims and crash-persistent dispatch markers across application hosts. The approved Npgsql dependency makes this fully executable in conformance tests. PostgreSQL-specific schema and SQL remain explicit; using ADO.NET interfaces does not make the implementation database-portable.
2. **BCL shared-file snapshots or journal.** Avoids a dependency and can support cooperating processes on an appropriately configured shared filesystem. Filesystem locking, atomic replacement, storage durability and host failover become additional assumptions. This is a narrower reference than production instances sharing PostgreSQL and is not selected.
3. **Provider-neutral storage interface without a concrete durable backend.** Useful as an extension point, but cannot establish transactional SQL behavior, restart correctness or cross-process exclusion. Ship the interface alongside executable PostgreSQL storage rather than describe an untested adapter as durable support.

## Contracts and responsibilities

Separate three concerns:

- A pending-store interface creates or retrieves a batch, validates and claims answers, crosses the dispatch boundary, and conditionally finalizes a claim. All durable operations are asynchronous and cancellable.
- A registry resolves a server-owned operation descriptor to preparation and execution code. Persist an operation name, version and owned immutable JSON parameters; never persist executable delegates or accept a browser-selected registry entry.
- The workflow performs pure preparation, asks the store for dispatch permission, invokes the registered executor, and continues the existing agent pipeline. The endpoint owns request claim cleanup.

An operation descriptor includes a stable name/version and cloned parameters selected before interruption. Registry entries provide a parameter-validation contract plus `Prepare` and `Execute` behavior. Preparation must have no externally visible side effects; only execution is protected by the durable dispatch marker. Execution receives the persisted parameters and stable effect identifier, allowing downstream application idempotency. Registry versions must retain their meaning across deployments. A missing or incompatible operation fails closed before model or effect work; there is no fallback to a new operation selected from the resume request.

A claim is an opaque server-created handle containing batch identity, random claim token and monotonically increasing generation. The endpoint passes this handle to the workflow through request-local context/accessor state. `runId` remains protocol metadata and provides no claim ownership. Two requests using the same run ID must still compete normally.

Public reusable source APIs receive XML documentation. Keep records and inputs immutable; clone JSON/arrays at ownership boundaries. An `IInterruptStore` interface is sufficient to share the memory and PostgreSQL implementations. The PostgreSQL implementation can use concrete `NpgsqlDataSource` and command types directly; do not add a generic ADO.NET abstraction that increases code without providing a tested second database backend. Keep PostgreSQL SQL in that backend.

## Persistent model

Use versioned schema initialization that is idempotent and safe for concurrent application startup. Store:

- Batch ID and stable effect ID; principal/application scope, thread ID and origin run ID.
- Original request fingerprint, complete interrupt IDs, operation name/version and parameters.
- Approval expiration and creation timestamps.
- State, claim token, claim generation and preparation lease deadline.
- Terminal outcome and completion metadata sufficient to distinguish confirmed completion from an ambiguous dispatch.

Normalize interrupt IDs into a child table with a primary key on interrupt ID and a foreign key to the batch. Every interrupt in one confirmation batch resolves to the same row. Add state/check constraints and an index supporting principal/thread live-batch lookup. Enforce one unresolved live batch per principal/thread through a transactional slot or an appropriate partial unique constraint, including a batch whose effect is still executing. Do not silently replace a pending operation with a new request's parameters.

Serialize creation and capacity maintenance through a metadata/slot row lock if retaining the current global capacity of 128; do not implement a racy `COUNT` followed by `INSERT`. Claims and dispatch need only short batch-row transactions. No transaction remains open while preparing, executing an effect, invoking a model, or streaming SSE.

Approval TTL defaults to ten minutes. Lease duration is independently configurable. Terminal retention/cleanup is explicit, preserves live work, and never makes an old interrupt ID executable again: a deleted ID is unknown and returns 410. A stranded `EffectStarted` record is never converted to `Pending` by expiry or cleanup.

## State machine and transactions

States are `Pending`, `Claimed`, `EffectStarted`, and terminal outcomes such as `Completed`, `Declined`, `FailedBeforeEffect` and `FailedAfterEffect`. An `EffectStarted` record without a confirmed final outcome represents an unknown effect outcome and remains ineligible for dispatch.

### Create and claim

Persist the complete batch and operation before emitting interrupts. Concurrent initial requests for the same principal/thread return the one stored pending batch; they cannot overwrite its descriptor or fingerprint. Preserve the existing complete-batch validation: unknown/wrong-scope/wrong-thread/expired IDs return 410, malformed answers or altered request fingerprint return 400, and active or consumed claims return 409. Reordered complete batches remain valid; duplicate IDs, missing entries, additional parameters and invalid statuses remain invalid without consuming the valid batch.

Claim inside a transaction using a locked batch row. Validate every supplied ID belongs to that row, authenticate the scope/thread binding, compare the original request fingerprint, validate all answers, and resolve/validate the stored operation. Then create a fresh token, increment the generation and set the preparation lease. Only `Pending`, or a pre-effect `Claimed` record with an expired lease, can be claimed. Reclaim also requires unexpired approval. Use PostgreSQL server time sampled after acquiring the row lock, rather than an application-host clock or a transaction-start timestamp sampled before waiting.

Any declined or cancelled answer terminalizes the batch durably before producing the existing decline message. A process crash must not allow a later approved answer to replace a committed decline. Invalid answers never terminalize it.

### Preparation and dispatch

Run preparation outside the database transaction. Check cancellation before requesting dispatch. The dispatch transaction conditionally changes `Claimed` to `EffectStarted` only when the batch, token, generation and unexpired preparation lease all match. Commit that marker before invoking execution. If no row matches, the worker is stale and must stop before effect or model work.

If the dispatch transaction or commit acknowledgement fails, do not execute. The database may have committed the marker, so automatic retry of execution is unsafe. A later resume observes the durable state; it cannot infer that failure means the effect never happened.

No lease renewal is required in this scope. Configure a lease long enough for ordinary pure preparation. Preparation that outlives the lease fails the dispatch condition safely and requires a new admitted resume if approval is still valid. The execution itself has no takeover lease: an `EffectStarted` operation never becomes eligible for automatic dispatch again.

### Cancellation, completion and expiry

Before the dispatch marker, observed request cancellation conditionally releases the current claim. Non-cancellation preparation failures conservatively consume it while its preparation lease remains valid. Lease expiry removes the worker's authority to dispatch or finalize, even before another worker takes over: an expired preparation failure leaves the batch reclaimable while approval remains valid. Release and finish always match the claim token/generation, so a stale worker cannot release or complete a successor's claim. Missing, expired, already-finalized or superseded handles produce a safe no-op or explicit stale result rather than an unguarded lookup exception.

After the marker, cancellation, exceptions and process death retain conservative consumption. Record `Completed` only after execution returns successfully; execution exceptions become `FailedAfterEffect`. If finalization cannot reach PostgreSQL, retain the committed `EffectStarted` marker and report failure without rerunning execution. Cleanup uses a bounded server-owned cancellation budget so an already-aborted request token does not prevent necessary claim bookkeeping.

Approval TTL is an admission deadline. A valid active preparation lease may cross approval expiry and finish, preserving the current active-checkpoint behavior. An expired lease cannot dispatch, and reacquisition after approval expiry returns 410. Cleanup cannot remove active work merely because its approval TTL elapsed.

## Guarantee and crash windows

The guarantee is **at most one registered execution dispatch per batch**, provided all instances use the shared authoritative PostgreSQL backend and dispatch gate. It is not exactly-once external effects and does not promise every approved effect happens.

| Failure boundary | Durable state | Recovery |
| --- | --- | --- |
| Before create commit | No committed batch | A later initial request can create a batch. |
| After create, before interrupts arrive | Pending batch | A repeated initial request returns its stored batch. |
| During pure preparation | Claimed, no marker | Reclaim after lease expiry while approval remains valid. |
| Old preparation completes after takeover | Successor token/generation | Old dispatch and finish are rejected. |
| Dispatch commit result is ambiguous | Possibly EffectStarted | Do not invoke execution on the failing request. |
| Marker committed, before invocation | EffectStarted | Outcome unknown; never auto-dispatch. Zero effects are possible. |
| Effect succeeds, before completion commit | EffectStarted | Outcome unknown; never auto-dispatch. |
| After completion commit | Completed | Replays are rejected. |

Stronger guarantees require application-specific downstream idempotency or including the business effect and checkpoint transition in the same database transaction. Passing a stable effect ID supports that integration but does not itself establish exactly-once behavior. Do not add an automatic retry queue or operator reconciliation API in this change.

The guarantee depends on PostgreSQL retaining acknowledged committed state. Database rollback to an older backup, unsafe asynchronous failover, or administrative edits can invalidate it. Document the authoritative-database assumption alongside the effect guarantee rather than imply the application can protect against lost database history.

## Endpoint, recipes and browser behavior

Keep pre-stream request validation and the upstream AG-UI hosting/serializer composition. Claim before starting the upstream response, supply its handle to the workflow, and finish through both exception and streamed-result paths. Scope is authenticated application identity; fixture headers remain test-only. Database or registry failures stop before new model/tool work.

Update both React and Angular server recipes with the same tested Npgsql reference, data-source lifetime, schema initialization and registry registration. Use persisted server-selected airport parameters to demonstrate restart recovery; do not suggest exposing privileged checkpoint actions as unrestricted model tools. Document preparation lease configuration, deployment registry version compatibility and conservative unknown outcomes.

Browser pending-batch ownership does not change. A live browser can answer its pending batch after the server restarts or routes the resume to another instance. A browser reload still loses Hashbrown's local pending-batch ownership; a saved local `batchId` cannot restore it. Hashbrown also consumes local pending ownership when a resume is acknowledged by `RUN_STARTED`; a later failed or cancelled acknowledged stream requires the existing conversation recovery/new-thread flow. Server-side preparation-lease recovery remains available at the protocol level but does not rehydrate that browser ownership or authorize automatic client replay. This work does not introduce browser persistence, transcript/session storage, automatic MAF approval tools or a new wire protocol.

## Verification and acceptance

Use real PostgreSQL 18 with the pinned provider. A local harness owns one disposable Docker container, uses a dynamic host port, waits for readiness, and removes only its own resources on success or failure. Allow an explicit test connection string for CI, where a PostgreSQL 18 service supplies the database. Isolate tests with distinct schemas or databases; never reset an arbitrary shared database. No real model credentials are needed.

Keep the existing 100 browser cases and provider/native contract checks passing. Add durable restart and competing-instance browser scenarios across all four React/Angular and OpenAI/Azure combinations. Expand the HTTP fixture to start, stop, restart and concurrently run independent .NET processes against the same test database. Persist effect evidence in the database or another shared durable test sink: per-process counters cannot prove no duplicate across restarts.

Write failing tests before implementation, following repository top-level `test(...)` and arrange/act/assert conventions. Required coverage:

1. Persist on instance A, terminate A, resume on B; use original stored parameters and rebuilt registry.
2. Concurrent create on two processes yields one batch; concurrent claim yields one winner, including identical browser run IDs.
3. Crash/cancellation during preparation; expired lease can be reclaimed only before approval expiry.
4. Let the old worker continue after takeover; it cannot dispatch, release or finish the successor's claim.
5. Persist dispatch marker and kill before invocation; replay stays rejected and effect count is zero.
6. Execute, then kill before finalization; replay stays rejected and durable effect count is one.
7. Cancellation before marker permits retry; cancellation after marker cannot redispatch.
8. A valid active lease crosses approval TTL and finishes; an expired lease cannot cross the dispatch boundary.
9. Unknown operation/version, invalid persisted parameters, database outage and dispatch persistence failure invoke neither effect nor model.
10. Decline/cancel remains terminal after restart; malformed input leaves the valid batch usable.
11. Preserve principal/thread/fingerprint checks, complete/reordered-batch semantics, consumed replay, retained markers and bounded capacity cleanup.
12. Compile both exact framework recipe snippets; verify initialization and locking against PostgreSQL rather than relying on fake connection tests.

Use deterministic fixture barriers at the preparation, committed-marker, and effect-completed boundaries for process-kill tests. Never depend on a short sleep to infer that an effect has begun. Execute the affected Nx build, test and lint targets, browser/provider suites and recipe compilation; report failures/warnings and distinguish infrastructure blocks from tested guarantees.

## Primary references

- [PostgreSQL 18 explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html): basis for short transactions and row-lock serialization.
- [PostgreSQL 18 date/time functions](https://www.postgresql.org/docs/18/functions-datetime.html): distinguish current database wall time from transaction-start timestamps for lease checks.
- [Npgsql basic usage](https://www.npgsql.org/doc/basic-usage.html): pooled data-source composition and transaction-bound connections.
- [Npgsql 10.0.3 release](https://github.com/npgsql/npgsql/releases/tag/v10.0.3): pinned approved provider baseline; the root session verified the release through the official release API.
