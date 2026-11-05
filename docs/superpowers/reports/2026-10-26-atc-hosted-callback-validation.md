# Hosted browser-tool callback cancellation and conflicting answers

Date: 2026-10-26. Published B4 packages: 0.15.5.

[Sanitized evidence](./2026-10-26-atc-hosted-callback-validation-evidence.json).

## Result

Five of six managed protocol cases passed. The sixth preserved the first answer and canonical conversation but failed admission cleanup after a terminal no-op callback. A real Angular browser also recovered after an accepted highlight callback connection was interrupted, retained its single highlight, and completed a new user turn. This is not an all-green rollout result.

The hosted cleanup observation led to a focused B4 regression and [candidate fix, PR #1116](https://github.com/cacheplane/b4run/pull/1116). Published-package hosted validation still needs to be repeated after that fix is released and deployed. Production backend selection and package publication were unchanged.

## Topology and assertions

The managed probes used two independent existing Vercel previews over the dedicated ATC preview Postgres database. Both previews were previously verified with published B4 0.15.5; their callback server implementation is unchanged by the later opt-in browser HTTP retry feature. Each case used a new synthetic conversation and an anonymous signed visitor. Only synthetic state was read or written; no pruning or forced lease deletion ran.

Protocol probes used Node fetch to deliver browser-tool envelopes. The discovery setup returned an explicit aircraft fixture through the normal tool-result protocol; model tool-call IDs, arguments, output, and continuations were genuine. Setup responses that declined to issue a tool and replayed settled discovery events were recorded and investigated separately. These setup corrections are not callback failures.

The tested rule is first stored answer wins, keyed by thread and tool-call ID. It does not reject every differing payload with a payload-conflict error. Admission prevents overlapping callback execution; later differing results cannot replace an accepted answer.

| Case | Observed result |
| --- | --- |
| Conflicting callbacks with distinct run IDs | Pass: active contender got 409 / Retry-After 1; stored A and one canonical continuation; delayed retries were terminal no-ops. |
| Conflicting callbacks with identical run IDs | Pass with the same first-answer and canonical-state assertions. |
| Two differing tool results in one request envelope | Pass: first result A persisted; result B did not enter canonical state. |
| Conflicting result after A completed | Answer and canonical-state checks passed; admission cleanup failed after a terminal no-op. |
| Disconnect after an accepted callback, distinct retry run ID | Pass: answer A was durable before disconnect; conflicting callback got admission 409; recovery retained A and a new user turn completed. |
| Disconnect after an accepted callback, identical retry run ID | Pass with the same accepted-answer and recovery assertions. |

Each passing managed case retained the same checkpoint summary, answer timestamp/hash, and zero admission rows at its later snapshot, taken at least 75 seconds after the final case completed. These are snapshots, not continuous monitoring. Provider response IDs and metadata caps were checked; this does not count every upstream request that might have been cancelled before committing.

## Accepted-callback disconnect

Before aborting the client connection, the probe observed a persisted answer A, an active lease, provider progress, and no new canonical provider response. It exercised a conflicting callback while the lease was still active, before aborting, rather than requiring a post-abort 409 that fast cancellation could legitimately avoid.

Both variants then encountered 22 admission conflicts before a successful callback retry. The retries produced no model output and did not add a canonical response. The consumed client park made these callbacks terminal no-ops; they did not automatically restart the interrupted model continuation. A subsequent new user message produced one new canonical response and left A unchanged. No conflicting B payload appeared in the canonical tool result or conversation.

Client AbortError proves the client disconnected, not the exact moment a managed worker observed cancellation. The evidence therefore separates local disconnect from the subsequent durable-state assertions and does not claim server-side abort telemetry.

## Angular browser

A real Angular page used fixture aircraft/chart data and its actual discovery and highlight handlers. It highlighted AAL2711 (`a1c005`). Instrumentation interrupted only the HTTP response to the highlight-result callback after its real HTTP 200 and RUN_STARTED; no model output was fabricated.

The page showed its existing Retry UI. A real Retry click recovered, cleared the alert, and rendered the answer while retaining exactly one highlight chip and the same highlighted aircraft. This was a delayed manual retry; its four initial physical requests were HTTP 200 and it did not establish an immediate browser 409 recovery window for this case.

A new user turn then completed. Across five HTTP-200 browser requests, all schemas were recognized pinned schemas. Hosted state contained exactly one canonical highlight ToolMessage and one stored highlight answer, with unchanged result hash and answer timestamp. Both browser tool records were answered and not voided. The new user turn added one provider response (three to four), with the 4096-token cap in persisted provider metadata. Complete recorded checkpoint summaries and zero leases matched again 101.467 seconds later. No page errors or remaining alerts were recorded. The owned browser session was closed.

ATC has no chat Stop button. This case tests an accepted callback connection interruption and manual Retry, not a Stop-button flow, browser reload, or an exactly-once external side effect guarantee.

## Delayed admission cleanup

The sequential-conflict case returned successful terminal no-op events without further tool/model work and with canonical state unchanged. Its immediate zero-admission-row assertion failed. A read-only follow-up observed the same synthetic thread still had an admission row whose expiry was `2026-10-27T04:29:02.308Z` at database time `2026-10-27T04:29:27.817Z`, over 25 seconds after expiry. A later forensic read found the row absent. The first answer and single canonical tool result remained consistent, with no conflicting marker.

The failure is cleanup delayed beyond lease expiry. It does not establish permanent orphaning, a still-live lease after expiry, or callback value corruption. Managed-host suspension after response completion and a delayed or failed database delete are not distinguished by the hosted observations.

Published B4's early no-op/partial-answer path returns a buffered successful terminal response before awaiting shared admission release. EOF starts detached disposal. Deterministic local regressions hold the release operation to show that success/EOF can precede cleanup, and reject release to show the old path can still return success. The candidate fix awaits release before exposing these successful early responses and surfaces a release failure instead of returning a false terminal success. This local control-flow proof does not by itself prove the precise managed-host cause.

## Follow-ups

- Merge, release, and deploy the B4 cleanup fix separately; rerun the no-op and partial-answer cases over hosted Postgres with the new published version.
- Repeat accepted-callback cancellation at additional park-consumption boundaries with explicit server cancellation telemetry if precise abort attribution is needed.
- Count actual provider requests separately before claiming exactly-once model execution; this report verifies canonical committed responses.
- Complete sustained-load validation before enabling B4 in production. Managed-worker termination and database failover remain separate gates from the prior owner-failure report.

Temporary preview credentials were removed after validation and their absence verified. All client requests settled locally; the owned browser was closed. Synthetic audit rows were retained.
