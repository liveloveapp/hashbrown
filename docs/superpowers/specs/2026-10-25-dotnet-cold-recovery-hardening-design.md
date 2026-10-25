# Cold Recovery Diagnostics And .NET Operations

## Authorized Scope

Continue the maintainer's items 1–3: cold structured/UI recovery, production hardening of the .NET recipes, and investigation of the isolated recovery timeout. Fix C# highlighting in those docs. Release safeguards, a NuGet package, and another npm release are excluded.

## Cold Recovery Decision

Canonical native history has lost local cancellation provenance at the model boundary. Exact marker wording, message IDs, authenticated lookup and private message metadata cannot authenticate the original runtime owner. Existing history cannot acquire that evidence retroactively.

Three approaches were reviewed: explicit application-trusted cancellation classification backed by a new durable evidence channel; a prospective durable cancellation journal/receipt; and explicit historical schema diagnostics. Choose **historical diagnostics** for this change. It solves cold continuation without fabricating ownership or requiring a new server authority path. Durable receipts remain a separate future feature if authenticated cancellation provenance is needed.

Add public `ConversationRestoreOptions` with `expectedRevision` and optional `structuredHistory: 'strict' | 'preserve-diagnostics'`. Existing calls retain strict behavior. Unknown policy strings reject atomically. Add a public readonly diagnostic DTO with `kind: 'unstructured-assistant-history'`, thread ID, message ID and exact content. Expose optional readonly `diagnostics` on existing public `ConversationRecoveryState`; omission means no diagnostics, preserving existing state shapes. React/Angular restore signatures use the public options type and forward it through chat, structured chat, completion and UI facades.

Only explicit `preserve-diagnostics` on structured/UI restoration can classify native-validated assistant strings that fail the configured response schema. This includes malformed JSON and JSON that does not match the schema; do not describe historical assistant schema validation as unchanged. Eligible records have no tool calls (including empty arrays), no encrypted payload and no other native activity/tool representation. Valid structured assistant content still renders normally. Ordinary plain chat is unchanged.

Every accepted canonical message remains present for subsequent model requests. Existing private cancellation metadata stripping remains in force. Diagnostics are visible plain text supplied to application-owned UI, never interpreted as components, tools, instructions, cancellation ownership, generation status or resume authority. Escape diagnostic text normally. Strict default remains fail-closed.

Keep diagnostic classification in owned local bindings to exact canonical source objects, separate from runtime cancellation provenance. Do not serialize it into model messages or accept incoming metadata as its authority. Preserve exclusions through append and every later projection/reconciliation path. Exact same-thread unchanged echoes can preserve an existing binding; IDs alone cannot. A changed record, explicit message replacement or new thread clears/reconciles the binding. On configuration changes, revalidate only previously bound unchanged records: newly valid records render normally, still-invalid records retain diagnostics, and unrelated records are never newly classified. Unrelated option changes retain valid bindings. A strict re-restoration rejects previously diagnosed invalid history atomically. Echo preservation compares the complete sanitized native record, including metadata, tools and encryption fields, not ID/content alone. An excluded assistant consumes pending reasoning so reasoning cannot leak to a later valid answer. The public diagnostics are immutable, derived from current retained canonical records, ordered by history and removed when those records disappear.

All other restoration invariants remain strict and atomic: revision, active work, configured-system provenance, native AG-UI shape, tool names/arguments/results, interrupts/expiry and complete validated state. Rejected restoration changes neither canonical history nor diagnostics/revision. Restoration never schedules model, tool or resume work.

Tests cover strict rejection, explicit structured/UI success, identical handling of ordinary text/cancellation wording/forged private metadata, malformed and schema-mismatched JSON, changed IDs/content/roles/tools/encryption, caller mutation, authoritative deletion, thread switching, append/streaming/configuration reprojection and reasoning isolation. Facade tests verify public types and forwarding. Real .NET browser cases cover cold reload after cancellation, pending and completed snapshots, visible escaped diagnostics, exact subsequent native history and zero replay/model/effect work until explicit continuation, across both frameworks/providers.

The .NET reference hosts and recipes explicitly opt in when restoring authenticated canonical history and visibly render diagnostics. The server does not mint or infer provenance. Documentation must identify the new SDK option as unreleased until a later SDK publication; 0.8.1 remains the minimum for the existing strict APIs.

## Independent PostgreSQL Maintenance

Current cleanup runs inside checkpoint admission. Idle applications retain expired physical data, and failed capacity admission rolls the cleanup transaction back. Add a bounded independently committed concrete `PostgresInterruptStore.CleanupAsync` with readonly separate metadata/transcript/audit counts, each category capped by the configured CleanupBatchSize, no new dependencies and a short cancellable transaction. Propagate cancellation through connection acquisition, transactions, lock waits, every command and commit; a cancelled pass rolls back and a later pass can succeed. Memory parity purges if either OriginalRequest or TerminalSnapshot remains. Keep opportunistic admission cleanup aligned with it.

Use row-locked bounded candidate queries (`FOR UPDATE SKIP LOCKED`) and rechecked predicates for metadata removal, transcript nulling and audit removal. Concurrent claims/captures must not be deleted from a stale candidate selection. Preserve valid claims whose approval expires while their admitted lease is still valid. Creation-based snapshot deadlines still fence late capture writes.

Known completed, declined, failed-before-effect and reconciled records can expire by terminal retention. Preserve **both EffectStarted and FailedAfterEffect** until explicit operator reconciliation, in PostgreSQL cleanup and memory-store parity. This deliberately strengthens the earlier FailedAfterEffect retention policy; document its capacity cost. Purge expired transcript bytes independently even when the ambiguous marker remains. Preserve current workflow-admission uniqueness and never treat cleanup/reconciliation as retry permission.

Test idle and full-capacity cleanup, each independent deadline and batch limit, repeated passes, row-lock skipping, active lease/claim races, late snapshot writes, retained ambiguous effects, explicit reconciliation then retention, and replay rejection after deletion. Use actual PostgreSQL 18 and deterministic clocks/barriers where supported.

Provide a tested application-owned cleanup scheduler/example with bounded cancellation and failure logging. Explain cleanup cadence/backlog, separate liveness/readiness, measured preparation lease sizing without nonexistent renewal, capacity and ambiguous-effect monitoring, privacy-safe bounded-cardinality logs/metrics, operator quiescence/evidence/CAS/409 refresh, shared database/registry/auth configuration, Data Protection across replicas, startup permissions, streaming proxy buffering/timeouts, draining and acknowledged durability. Keep both frameworks' exact C# blocks synchronized and compilable.

## Timeout Investigation

The historical five-second recovery assertion failure did not reproduce in five targeted repeats or complete packed/registry reruns. There is no established root cause. Health-only readiness does not measure first-use provider paths; proxy writeHead without explicit flushing means observed browser headers do not identify the upstream phase.

Add bounded monotonic correlated diagnostic timelines at routed request/upstream headers/first byte/end/error/cancellation and model-proxy boundaries, with fixture/browser events where meaningful. Default caps are 256 retained events and 32 traced requests per case, with explicit overflow counters and bounded storage. Compared timestamps are observed in one Node-worker monotonic clock domain; do not compare browser/C# absolute clocks directly. Use fixture-owned opaque correlation IDs and allowlisted component/phase/status fields, never URLs, exception strings or canonical thread IDs. Attach diagnostic evidence on failure and allow deliberate repeat runs to retain timelines. Avoid additional private histories, keys, tokens, parameters or unbounded metric labels. Test bounds and cancellation/backpressure behavior.

Keep original five-second assistant assertions, model/effect counts and retries=0. Do not add synthetic model/effect warm-up. Change runtime timing behavior only if new evidence demonstrates a concrete defect; otherwise report improved observability and repeat results honestly.

## C# Highlighting

Load bundled C# and XML grammars in the existing Shiki highlighter, canonicalize cs/c# to csharp, and preserve unknown-language fallback. Tests must verify multiple actual syntax colors and language metadata, including direct helper aliases and XML text escaping. Verify rendered React/Angular .NET routes after build/deployment.

## Completion Gates

Independent spec and quality reviews, build/test/lint for affected core/React/Angular/conformance/www projects, generated public API validation where applicable, exact recipe compilation, full .NET browser matrix with aimock/PostgreSQL, repeated original cold-worker case, protected PR integration, and main/production/live verification. Retain warnings/diagnostics and clean up only owned test services.
