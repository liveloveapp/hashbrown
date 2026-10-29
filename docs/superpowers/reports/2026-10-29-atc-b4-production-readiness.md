# ATC B4 0.15.7 production-readiness validation

Date: 2026-10-29. Result: **PASSED** for the bounded preview workload and owned-process recovery cases. Production backend settings were not changed.

Sanitized results: [evidence](./2026-10-29-atc-b4-production-readiness-evidence.json).

## Exact source and deployment provenance

Runtime source: `6d414a37d25ab336192e52fd4d00b26321758ee7` (merged PR #820). Harness execution source: `b85d8b3ae5ab6ff420166fe7c15c55f243560af4`; subsequent report/document commits are distinct. Published B4 packages remain exactly 0.15.7. Root pins and lockfile integrity values match the previously independently verified immutable [B4 release](https://github.com/cacheplane/b4run/releases/tag/v0.15.7), sealed registry manifest `4eb883798a57f993bb4f3883a6ac54f54d2fc7f1ce8f2b4585fd803da53187d4`. No new release, package publication, dependency change or source overlay was used.

Two fresh READY previews on the dedicated hashbrown-atc project share the dedicated preview database and cookie secret:

- dpl_Ei9MzPX8zMowrZiRyNob8LRUW4At: [preview](https://hashbrown-becuokooa-blovedev.vercel.app)
- dpl_SiQsXawNy9xfduJU3HGktT2udeFP: [preview](https://hashbrown-5qahwymvj-blovedev.vercel.app)

Artifact SHA256: `864c94a387056c4c8f940ac14b9a961603d9d340772dfbeb3056f6860adafc14`. Full function-tree SHA256: `7e7584369e3f7d06c452ae639cc7e87ea39d2936b1695281de795848b8f43802`. Full output-tree SHA256: `707995a20ddc7e16019b7cff8a5971132451dd6b73e9cc9d7cc9da8afde2c376`. Complete build/upload-copy equality and authenticated project/deployment identity were checked before database access. This is verified prebuilt upload provenance, not independent remote byte attestation.

## Recovery and fencing

Five hosted-storage cases passed: heartbeat renewal beyond original expiry; SIGKILL with natural-expiry takeover; SIGSTOP/resume with stale-write rejection; explicit expiry of only an owned synthetic admission row while the old signal remained active; and late-COMMIT rollback with an observed real lock blocker. Accelerated storage timings do not establish production lease timing.

Both generated-runtime cases used default 30-second leases, owned local workers and a managed preview successor. Before database-clock expiry the managed successor received 409 with Retry-After; after natural expiry it completed. Committed message/checkpoint/keyed-write prefixes were preserved, the latest successor input appeared once, schema and 4096-token cap checks passed, first post-EOF admission reads were zero without polling, and full canonical snapshots remained unchanged after at least 75 seconds. Owned workers and proxy were verified closed.

For suspension, input commit and admission unlock were observed before takeover. Actual completed authenticated provider bytes were held before successor dispatch, then delivered after the successor settled. The resumed old owner consumed those bytes and reported ownership cancellation/fencing. Its provider ID was excluded from canonical state. Generic admission observation does not identify the exact rejected write; old streams can emit bytes before their terminal outcome. No managed Vercel worker was killed and no database failover occurred.

An initial kill attempt stopped before planned fault injection because the harness incorrectly equated provider capture with asynchronous input-checkpoint commit. Its receipt and cleanup remain preserved. The correction changes only observation timing and recognizes that uncommitted input can be lost; it does not change runtime durability or lease policy.

## Sustained load

The complete replacement run held 1, 2 and 4 virtual users for five minutes each on absolute stage boundaries, using real model responses and fresh synthetic threads across both previews. The authored model profile is OpenAI gpt-5-mini with low reasoning effort and no preview model/reasoning override. Per-user HTTP starts were paced at 30 seconds, within the approved minimum 20-second gap; the measured minimum was 30.033714 seconds. The 55-second request bound, 20-minute total phase bound and all correctness assertions were retained.

Completed 70/70 requests; 0 failed-request receipts. Per-level dispatch-cohort results:

| Virtual users | Completed / attempted | Completion p50 | p95      | Maximum  |
| ------------- | --------------------- | -------------- | -------- | -------- |
| 1             | 10 / 10               | 5788 ms        | 10678 ms | 10678 ms |
| 2             | 20 / 20               | 4967 ms        | 6651 ms  | 8182 ms  |
| 4             | 40 / 40               | 5320 ms        | 7347 ms  | 8457 ms  |

Completion-rate buckets use response EOF, separately from subsequent database verification. The evidence retains first-byte/content/completion timing, achieved rates/concurrency, provider response IDs and available token usage. Previews were already warm from recovery; no cold-start or maximum-capacity claim is made.

Every successful request matched the pinned schema, exact persisted/streamed response, synthetic marker isolation, unique canonical provider response and output cap. Native reasoning blocks remain in complete canonical hashes while rendered text is compared to the stream. All 70 first post-EOF admission queries were zero without polling; every completed thread matched its full canonical snapshot again after at least 75 seconds.

The first load attempt was interrupted between requests after 29 successful responses when measurements exposed a harness pacing defect: timer wakeups and pre-fetch setup could make actual starts slightly shorter than 20 seconds. It is not counted as the complete sustained qualification. Its unchanged receipt, explicit idle termination, and later unchanged/zero-admission checks for all 29 threads are retained; its process exited without a pool-end callback receipt. The corrected dispatcher waits until the actual deadline and anchors pacing to actual dispatch. A durable ledger includes both runs: 99/120 load reservations. Recovery used 10/16 reservations, including conflicts and the first failed harness attempt.

## Verification and cleanup

Fresh exact-main checks passed: ATC server build/lint, 163 tests (one opt-in database test skipped), and the complete B4 artifact build with eight prerequisite tasks. All 76 harness tests and focused lint passed. Existing tooling advisories were retained; runtime policy, lease settings and request deadlines were unchanged; the documented harness corrections preserved the approved validation contract.

The temporary preview environment and derived credential JSON were deleted after exact credential-value scans of this report and evidence; their absence was checked. Owned request/pool/worker/proxy cleanup succeeded. The interrupted idle load process was separately verified exited, with its unchanged zero-admission state checked afterward; it has no pool-end callback receipt. Original user credential files and dirty workspaces were untouched. Synthetic audit rows were retained and no operator global-prune command ran. Normal runtime retention behavior was unchanged.

## Remaining production decision

This qualifies the measured preview envelope, not production demand. Managed-host termination/database failover, agreed production traffic/SLO/provider-budget targets, and production configuration/retention/rollback checks remain separate rollout gates. Main was later observed at `973639e81602f5b720bb14b5bb49f8c076a46add` (3 commits ahead), including core/OpenAI changes; assess and requalify relevant differences before production enablement. Browser-tool/UI traffic under sustained load and complete upstream retry/rate-limit telemetry were not measured. B4 was not enabled in production by this work.
