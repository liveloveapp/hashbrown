# ATC B4 0.15.7 production-readiness validation

Status: Proposed for human approval. This is a validation design, not production enablement.

## Objective and frozen source

Repeat failure recovery and lease/fencing validation using published B4 0.15.7 and add timed sustained-load validation. Runtime source is merged main `6d414a37d25ab336192e52fd4d00b26321758ee7` (PR #820). Record this exact commit rather than silently following later main. Design/report-only commits are separately identified and never relabeled as deployed runtime source. Keep production backend configuration unchanged.

The previous 0.15.7 callback experiments used source `bf4e937deb642e25eb16b33d45ab2f0fb87ac196`; their evidence remains valid for that source and is preserved. This run creates new evidence, deployments and synthetic threads. Published-release proof is reused from the independently verified immutable release; installed versions and lockfile SRI are checked again on this source.

## Approaches and choice

1. Recommended: requalify existing five storage and two generated-runtime recovery protocols, then extend the old short-wave load probe into a bounded timed ramp. This preserves known semantics and supplies new evidence without changing product behavior.
2. Repeat the old probes unchanged: cheaper, but old 0.15.5/source/deployment bindings are invalid here and short waves are not sustained load.
3. Add managed-host crash or database failover controls: broader coverage, but managed worker termination is not exposed by the existing application and shared-database failover would exceed isolated fault ownership. Defer rather than invent an equivalent result.

No product fault endpoint, dependency, runtime setting, lease duration, workflow, policy or production setting is changed. Harness-only adaptations are independently reviewed before execution.

## Isolation and preflight

Use the new isolated managed worktree; preserve both original dirty repositories and the frozen previous validation worktree. Install only exact registry lockfile packages with scripts disabled. Run existing ATC server build/test/lint baseline and build the complete ATC B4 prebuilt artifact on the clean exact runtime commit. Keep design/report commits on a separate branch and detach at the frozen commit for building and sealing.

Create two fresh READY previews on the existing dedicated hashbrown-atc project, with preview-only B4 backend override, shared dedicated preview Postgres and cookie secret. Authenticate project ID/name/owner, inspect deployment IDs/origins/preview targets, verify complete function-tree and prebuilt-output equality across build and both uploaded copies, and bind source, lockfile, published SRI, artifact hashes and normalized verify-full database connection hash in a reviewed manifest. This is verified upload provenance, not independent remote byte attestation.

Pull preview secrets only when necessary into a private mode-0600 file in a mode-0700 new staging directory. Redact exact secret values and parsed credentials at initialization, worker boundaries and terminal errors. Validate HTTPS identities, reject redirects, and verify manifest bindings before opening database pools. No production database, generic DATABASE_URL, shared cleanup command, old deployment evidence or source overlay may be substituted.

## Failure recovery and fencing

Reuse and harden the existing private owner-failure harnesses, preserving every meaningful assertion and recording new source/version/provenance. All signals target owned local child PIDs only. Storage probes use a fresh random table prefix; runtime probes use fresh owned synthetic threads in the existing ATC tables. Retain audit rows; never prune shared state.

Requalify these five storage cases against hosted preview storage:

- Renewal outlives the original six-second lease; a competitor is denied until release, then acquires and writes.
- SIGKILL without cleanup leaves the lease intact; takeover is denied before database-clock expiry and succeeds after natural expiry.
- SIGSTOP through expiry permits a successor; resumed stale write fails, aborts the old owner and preserves canonical successor state. Old release must not remove the successor lease.
- Deliberately expire only the owned synthetic admission row while the old signal is active; the next stale write must fail through database fencing and stale cleanup must preserve the successor.
- A real fenced transaction holds a row lock through expiry; observe the database blocker, reject late COMMIT, roll back its effects and allow the waiting successor to acquire.

Storage timing is deliberately accelerated and is not a claim about production timing. Generated-runtime probes retain the default 30-second lease:

- Seed committed history, kill an owned generated-runtime process, require managed successor 409/Retry-After wholly before expiry, then successful dispatch after natural database-clock expiry. Preserve committed prefix, accept latest follow-up exactly once, validate schema and 4096-token cap, and verify lease release.
- Suspend a generated-runtime owner after input commit. Hold actual completed authenticated provider bytes in a private loopback proxy, complete a managed successor after natural expiry, deliver bytes and resume the stale owner. Require ownership cancellation/fencing, canonical successor state and exclusion of the stale provider ID. Do not fabricate provider output or require absence of already-streamed bytes.

Compare complete recorded canonical checkpoint/thread/write summaries and lease counts immediately and at least 75 seconds later. Record which stale operation can actually be identified; a generic admission observer does not prove an attempted checkpoint commit. These are owned-process failures over hosted storage with a managed successor, not termination of a managed Vercel worker or real database failover. Those remain explicit open gates.

## Sustained-load contract

Absent a supplied production traffic target, qualify a bounded preview workload rather than claiming production capacity. Use a closed-loop ramp at 1, 2 and 4 concurrent active sessions, each level held for five minutes, with at least 20 seconds between starts per virtual user. Alternate requests across the two previews. Each fresh thread carries a unique correlation marker and a short prose request, using the real model and pinned structured-output schema. Do not mock responses or count synthetic fixture writes as model traffic.

Hard bounds: no more than 120 attempted model requests for the load phase, no more than 16 for recovery, 55-second per-load-request timeout, 15 minutes of scheduled ramp and 20-minute total phase deadline including drain and snapshots. Keep the server's existing 4096-token cap; record actual returned usage where available and identify missing usage rather than inventing an exact spend estimate. A supplied stricter budget overrides these proposed bounds before execution. Reaching a hard bound before completing the schedule yields incomplete evidence, not a pass.

Report per-level attempted/finished/failed requests, achieved start/completion rates, active concurrency, time to first stream byte and first content, completion p50/p95/max, HTTP outcomes, terminal events and provider throttling. All latency clocks start immediately before fetch dispatch: first byte is the first nonempty response-body chunk, first content is the first parsed TEXT_MESSAGE_CONTENT frame, and completion is response EOF after a valid terminal event. Record missing content distinctly rather than substituting first-byte time. Latencies are measured results, not an invented production SLO. Keep cold/warm order visible; do not cherry-pick retries or delete failed runs. The closed-loop pacing and provider cap limit the tested workload; they do not predict maximum throughput.

Pass criteria: every attempted request completes once under the timeout with valid schema, correct correlation marker, unique thread ownership, preserved canonical history and pinned cap; no unexpected HTTP failures, RUN_ERROR or provider throttling; no state crossing threads, duplicate canonical responses, stale overwrite or admission leak. Verify each finished thread's first post-EOF admission read and record any nonzero value as failure; do not poll a nonzero result into success. Save quiescent canonical summaries immediately and after at least 75 seconds for all load threads.

Stop scheduling on the first correctness failure, unexpected HTTP failure, provider throttling, credential/identity failure or deadline. Drain or abort only owned requests; preserve partial evidence and inspect real diagnostics before any rerun. Do not weaken thresholds, assertions or timeouts to get green results.

## Harness verification and execution

Before network experiments, test changed harness primitives with deterministic fixtures: manifest mismatch rejects before DB access; fake clocks exercise level transitions/request cap/deadline; controlled streams exercise terminal parsing, timeout and cancellation; failed assertions stop new scheduling; redaction and cleanup run on initialization and terminal failures. These tests do not count as hosted runtime evidence. Use top-level tests and no added dependencies. Review the harness source and actual deployment manifest independently before executing.

Run recovery cases sequentially, then sustained load; do not overlap probes or leave active owner processes. Record real failures, all attempts and cleanup receipts. Reconcile missing evidence rather than setting success flags speculatively.

## Reporting, cleanup and remaining rollout gates

Write sanitized evidence and a report with exact runtime source, design/report commits, package/lock/tarball provenance, deployment IDs/origins, artifact/function hashes, case assertions, full run counts, measured load envelope and failure/latency outcomes. Scan final artifacts for exact credential values before deleting the temporary credential file. Terminate only owned workers/proxies/requests/pools, verify cleanup, preserve owned synthetic audit rows and evidence. No global pruning or deletion of user files.

Open a report PR without assuming permission to merge it. Keep B4 disabled in production. Even a passing run does not authorize enablement: managed-host worker termination/database failover remain untested; production traffic/SLO/provider-budget targets and production DB/cookie/retention/rollback checks must be satisfied before a separate enablement decision. Do not conflate these bounded experiments with continuous monitoring or complete availability certification.
