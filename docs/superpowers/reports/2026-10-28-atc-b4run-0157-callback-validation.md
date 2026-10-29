# ATC callback validation with b4.run 0.15.7

The published 0.15.7 callback fix passed the bounded hosted no-op and
partial-callback experiments below. The Hashbrown upgrade uses registry packages
throughout. Direct OpenAI remains the default backend; this change does not
enable B4 in production.

## Release and source

[v0.15.7](https://github.com/cacheplane/b4run/releases/tag/v0.15.7) is public
and immutable. Its exact candidate is
`e67a92e4dc3b0f5ffc884ecee3fa8d87d5d788c4`; annotated tag object
`46c8f5322cc2fdba38d1c40c5c2b1415541e2527` peels to that candidate. Candidate
[CI 40553103982](https://github.com/cacheplane/b4run/actions/runs/40553103982),
ordinary
[release relay 40743222020](https://github.com/cacheplane/b4run/actions/runs/40743222020),
all five real release smoke lanes, and
[independent audit 40747893391](https://github.com/cacheplane/b4run/actions/runs/40747893391)
passed.

Fresh ordinary production verification returned `AUDIT_COMPLETE` / `noop` with
zero diagnostics. It verified the attested manifest and all package subjects,
all 21 public npm package sizes, SHA-256, SHA-512 and SRI values, ordinary
signature/provenance proofs, smoke receipts and correlated audit. The manifest
SHA-256 is `4eb883798a57f993bb4f3883a6ac54f54d2fc7f1ce8f2b4585fd803da53187d4`.
No historical verification record was admitted for this release; the historical
0.15.5 evidence proposal remains unmerged.

Hashbrown deployed source is `bf4e937deb642e25eb16b33d45ab2f0fb87ac196`, based
on `5fcb8b4cf64e023cde7eddea5320dab2265a8695`. Its root CLI/core/Postgres pins
and SDK devDependency are exactly 0.15.7. All 11 installed B4 packages match the
release manifest. The lockfile also contains a bounded npm resolver refresh of
six existing LangChain/OpenAI entries; no new direct dependency or lockfile
package path was added. Lifecycle's private 0.14.0 metadata pins remain
unchanged; its build/check targets deliberately invoke the root CLI.

This report is a subsequent documentation addition. Deployment provenance binds
the exact source commit above.

## Preview artifact

The complete B4 prebuilt output was freshly built from that clean committed
source and copied identically into both staging directories. The parent verified
the complete output and full function trees before two prebuilt uploads, then
independently inspected both deployments as READY previews in the dedicated
`hashbrown-atc` project.

- [Preview A](https://hashbrown-ecny7e4h1-blovedev.vercel.app/angular/):
  `dpl_7b1rBd323SXAwRSt15J2A65ijdow`.
- [Preview B](https://hashbrown-8nk4a5a8n-blovedev.vercel.app/angular/):
  `dpl_6gvmdFnPy1ufosLAnSfNXUsfq4iD`.

Both use the preview-only `ATC_CHAT_BACKEND=b4run` override and the same
dedicated preview Postgres database/cookie secret. The probe connection uses
`sslmode=verify-full`; only its normalized connection hash is retained in the
sanitized evidence.

| Identity                                                    | SHA-256                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `api/run.func/atc.mjs`                                      | `864c94a387056c4c8f940ac14b9a961603d9d340772dfbeb3056f6860adafc14` |
| Full `api/run.func` tree, including file modes/link targets | `beeaad641d2c384d74af0790e6658a3ed10ef7abb0ee64fc7c29eed2b8a92193` |
| Complete prebuilt output tree                               | `090efb384c9014c3c7a2cd6f5ed323ecb191c29c7aa2a5a03784fc710596788f` |
| Root lockfile                                               | `8e371794b4c3679c2dcd39f26ba4810a702cc7a31784d2131399d1436cc09b94` |
| Reviewed deployment preflight manifest                      | `0481b76ab496c59a661d6ef1713db7f62d5dc146191aae58c88e620301dbedcb` |

This is verified prebuilt upload provenance. It is not an independent
attestation of bytes retrieved from the running remote functions. A stale
prepared name check was corrected from `hashbrown` to the existing linked
project's service-confirmed `hashbrown-atc`, with exact project ID, organization
and owner bindings added. That private preflight correction and its resulting
manifest were independently reviewed before either probe ran.

## Hosted callback results

| Experiment                                                                                     | Result     |
| ---------------------------------------------------------------------------------------------- | ---------- |
| Three genuine model-issued discovery → highlight threads                                       | Pass       |
| 18 settled callbacks with identical/different run IDs and conflicting payloads across replicas | Pass       |
| Three synthetic partial fixtures, five phases each, 15 callbacks                               | Pass       |
| First database query immediately after every response EOF: zero admission rows                 | 42/42 pass |
| Canonical checkpoint/records/thread/count invariants and later snapshots                       | Pass       |
| Owned requests settled and database clients/pools closed                                       | Pass       |

The no-op probe ran from 2026-10-28T19:15:08.061Z to 2026-10-28T19:17:25.478Z.
Each thread completed a genuine model-issued discovery call before highlight.
Discovery answers supplied an explicit synthetic aircraft fixture through the
ordinary browser-result protocol; no model output was fabricated. After
accepting the highlight answer, six replay/conflict cases per thread preserved
the complete canonical checkpoint tuple, client-tool records, thread,
checkpoint/write counts, earlier message prefix and committed provider IDs. All
27 requests returned HTTP 200. The 18 replay responses were empty terminal
responses, and every first database query after EOF found no admission lease.
The accepted canonical state remained identical in snapshots taken at least 75
seconds after the last request.

The partial probe ran from 2026-10-28T19:18:06.464Z to 2026-10-28T19:19:45.207Z.
It authored three explicit synthetic three-park fixtures through published
Postgres storage and SDK ownership APIs. For each fixture it answered A,
replayed conflicting A with the same and a distinct run ID, answered B, then
replayed conflicting B across the two replicas. Pending sets were exactly B+C
and then C. The first A/B result and answer timestamps survived every conflict.
C remained unanswered; no new user message or all-answered resume was sent.
Canonical tuple/thread identity and checkpoint/write counts stayed fixed; only
the expected first-answer tool records changed. All 15 HTTP-200 responses had
zero admissions in the first post-EOF query, and final snapshots at least 75
seconds later matched.

The partial fixture is not a runnable LangGraph superstep and does not establish
model-issued parallel tools. Committed provider IDs do not count upstream
requests cancelled before commit. Immediate checks and later snapshots are
observations, not continuous monitoring or server cancellation telemetry. These
limits are retained with the machine-readable receipts.

## Local validation and cleanup

- All 16 affected core/provider/framework/ATC/growth/lifecycle builds and their
  12 prerequisite tasks passed.
- Reported Jest/Vitest totals were 5,205 passed. The default server suite
  skipped its one opt-in Postgres case; the separate real-Postgres lane ran all
  eight ATC tests, including shared-runtime continuation/ownership.
- All seven provider suites, both framework suites, affected lints, lifecycle
  check and ATC e2e typecheck passed. All 86 local browser tests passed across
  Angular/React and the backend fixtures.
- Both complete uncached OpenAI and B4 ATC builds passed. The generated B4
  function passed continuation/ownership/schema/cap/duplicate/bypass checks
  across two isolated module copies sharing owned Postgres.
- All six lifecycle integration tests passed using the actual Neon serverless
  driver over an owned loopback WebSocket-to-Postgres transport. This transport
  was confined to local tests; hosted probes used the dedicated TLS database
  connection.
- Thirteen lint findings in unchanged Angular/React source and existing
  Nx/Vite/Analog advisories remain. No assertions, timeouts or lint rules were
  weakened.
- Owned local container/proxy cleanup and hosted request/pool cleanup passed.
  The temporary preview credential file was removed after the experiments.
  Original user credential files and shared/user state were untouched; synthetic
  probe rows remain for evidence, and no global pruning ran.

## Remaining rollout limits

Hosted owner termination/restart, lease expiry/renewal, stale-owner fencing and
sustained workloads/provider-rate limits remain production rollout gates. This
callback experiment does not requalify the previous report's entire hosted
load/cancellation/live-UI scope on 0.15.7. Review and merge the Hashbrown
upgrade separately before any rollout decision; production backend selection
remains unchanged.

The
[sanitized evidence](./2026-10-28-atc-b4run-0157-callback-validation-evidence.json)
retains public release/package bindings, synthetic fixture identities, state
hashes, timings and exact checks. The
[0.15.5 report](./2026-10-26-atc-b4run-0155-validation.md) and
[HTTP retry follow-up](./2026-10-26-atc-http-conflict-recovery.md) retain their
historical scope.
