# ATC B4 managed-readiness follow-ups

B4 remains disabled in production. Readiness is incomplete: both managed-timeout attempts were inconclusive, the disposable-compute restart was not executed, and the spending observer now correctly rejects a malformed rollback receipt. No further paid checks were run after that rejection.

This report supplements the [merged-source requalification](./2026-10-29-atc-b4-merged-source-requalification.md) and [earlier recovery/load report](./2026-10-29-atc-b4-production-readiness.md). It preserves their original source attribution. Machine-readable facts are in the [follow-up evidence](./2026-10-29-atc-b4-managed-readiness-followups-evidence.json).

## Actual results

| Check | Result | Meaning |
| --- | --- | --- |
| Exact merged runtime | Requalified at `a2f92a4f02ab1dfc38051a44e509afb439634793` | Published B4 0.15.7; earlier fresh build/test/lint and 86 browser fixtures remain separately attributed. |
| Managed timeout | Two inconclusive attempts; limit exhausted | Both normal seeds completed with zero first post-EOF admissions. The fault streams ended without the required combined active-owner/durable-input observation. Later authenticated logs show the exact one-second runtime timeout; this does not establish recovery. |
| Disposable compute restart | Not executed | No Neon management key or verified disposable endpoint. The existing shared preview compute was not restarted. No storage-HA claim. |
| Preview rollback | Execution checks qualified; receipt audit impaired | Fresh B4 and direct-OpenAI requests reached their intended immutable deployments. Live canonical/state-isolation assertions and both at least 75-second comparisons passed. The alias was restored to B4, removed, and independently re-read as absent. |
| Spending observer | Fail closed | The completed rollback receipt's overredacted identifiers no longer bind to the ledger. The original remains byte-for-byte retained; no parser, approval binding or reservation was relaxed. |

The fault artifact differed from normal output only in `api/run.func/.vc-config.json`, with `maxDuration` changed from 60 to 1. Its exact bytes were independently compared before upload. HTTP 200 after streaming headers commit was distinguished from an intact completion. Regional response-header IDs were correlated to the authenticated native log ID and its embedded timestamp. Normalized timeout classification explicitly preserves the absence of a raw error code; it does not manufacture `FUNCTION_INVOCATION_TIMEOUT`.

## Rollback evidence and its limitation

The hosted rollback used harness `144ccd8f6529addbeea41bd8e74f388b54a492fd` against the frozen runtime above. Both complete artifacts first passed the existing isolated executable verifiers. The B4 candidate rejects private runtime routes and backend mismatch; the OpenAI candidate runs without agent settings. A backend environment switch alone was not accepted as rollback.

The initial post-create identity check stopped because the alias API omits direct team fields. Creation was not retried. Read-only inspection matched the original alias UID and joined its exact project ID to authenticated project account ownership; these guards were fixed and re-reviewed before any model request. Later rehearsal assignment/restoration POSTs were separately journaled.

The owned alias routed B4 → direct OpenAI → B4, then was deleted. Each request used a fresh visitor/thread. The direct-OpenAI request was surrounded by whole-B4-state comparisons, and both backends had at least 75 seconds of settled observation. This establishes the live protocol's assertions, not transparent migration of existing B4 conversations.

After completion, receipt sanitization was found to treat tiny model-output deltas as secrets globally. That obscured UUIDs, hashes and provider metadata in the serialized receipt. Runtime assertions had compared the original values before sanitization; independent HTTP-route and alias journals retain their correlations. Nevertheless, the serialized hashes cannot be treated as an intact audit record. Original receipt SHA256: `7ae0943bf092844d7c9b8e6bbd21767a006dc00a8d335984a750930176b54231`.

The sanitizer correction preserves credential/cookie redaction globally, confines model text to diagnostic sanitization, and suppresses raw bodies. A further review caught truncated JSON-parser excerpts; fixed parsing/comparison diagnostics now omit raw model excerpts and causes. The final correction is `b9a2667e7a89e7f2c0b0e9e62152e84ec1578390`, independently spec/quality approved, with 236 offline tests and lint passing. Portable temporary fixtures were then verified at `2cfd1f249203b0a3c9c16c9967d41d39649708c6` with the same 236-test suite and lint. There was no hosted replay to make the historical receipt look successful.

A later, single `READ ONLY` transaction inspected only the two owned ledger threads through published Postgres storage with migrations bypassed. It found one committed B4 response and no OpenAI checkpoint, with zero later admissions for both. It recovered B4 usage of 1433 input and 224 output tokens (modeled standard-price contribution $0.00080625). This is supplemental reporting evidence, not the original immediate-EOF/75-second snapshot and not authority to resume spending. Its transaction/client/pool cleanup passed.

## Request and spend limits

The human's $10 ceiling remains in force. There were six model-capable HTTP reservations: four in timeout (two seeds and two faults), zero in restart, and two in rollback. Actual upstream request count and total bill remain unknown. The old 99/120 load and 10/16 recovery ledgers were not changed.

Each new reservation permanently retains $0.973728 for a full-context, 4096-output-token, up-to-nine-attempt bound. All six remain retained: $5.842368. The last successful predispatch observer subtotal was $0.0013995, modeled from confirmed usage. The later recovered B4 contribution is separate. These are conservative accounting quantities, not a fresh accepted spending observation or available headroom. Direct OpenAI usage, failed-call usage and unseen retries remain unknown. The current pinned observer still rejects the malformed original; no quarantine, replacement, ledger reset or further paid request was used to bypass that failure.

## Frozen artifacts and service inventory

| Artifact | B4 | Direct OpenAI |
| --- | --- | --- |
| Complete output SHA256 | `f5bd505b504331ce911ada28d7aca549194e3aa004a4cbb040406aadcb3f0555` | `10bba1637ed73ca693fcdf474c5dd658b9e5a37fdea576280824579fe01e6f39` |
| Complete `api/run.func` SHA256 | `e548d9853c38d2b166be93e66c827827d13ae5933159033d274bdf32e25bb801` | `68023779b9c00f7f71eabf117f7c41c6106b8153dc64a3918085cfeb85b82dee` |
| Handler SHA256 | `864c94a387056c4c8f940ac14b9a961603d9d340772dfbeb3056f6860adafc14` | `574c7cb15069ec46428fd3a2a8b39961dc862541e23a73f6bc6151728bc4b76a` |

Lock SHA256: `8e371794b4c3679c2dcd39f26ba4810a702cc7a31784d2131399d1436cc09b94`. The four installed B4 versions/integrities match the sealed registry manifest; full values are in the evidence. These are verified prebuilt-upload bindings, not independent remote byte attestation.

Retained READY previews, independently inspected again after the experiments:

- B4 A: `dpl_AGGjf6pWPP15UK3yxF62TCFCN7hB` — https://hashbrown-evmnzyybv-blovedev.vercel.app
- B4 B: `dpl_AebqdykGNg2FfdQLKMFpgT66BJbn` — https://hashbrown-mi32qow2r-blovedev.vercel.app
- OpenAI: `dpl_2kP8FKWhmcwU52kCd9aEVph2Njto` — https://hashbrown-7sfp4156e-blovedev.vercel.app

The one-second fault preview `dpl_EwREse9dJe6gwV3tkFqweA1TnEtx` was retired and authenticated absence verified. The temporary readiness alias is absent. No production environment, domain or backend was changed by this work. Production deployment activity continued independently; read-only metadata showed no production `ATC_CHAT_BACKEND` key. Production secret values were not read. Synthetic rows and prior evidence were retained; no shared-state pruning occurred.

The exact final report/evidence and changed files passed credential-value scans. Both owned temporary credential copies were removed and their absence verified. The original root `.env` was not modified by this work.

## Before production

1. Design/review a new bounded timeout experiment; neither original attempt qualifies recovery and neither may be silently reset.
2. Create a project-scoped Neon API key in the authenticated Neon console and bind an independently verified disposable compute. Vercel's existing token does not retrieve the first Neon management key. Do not restart the shared preview compute. See [Neon API keys](https://neon.com/docs/manage/api-keys) and the [Vercel-managed integration](https://neon.com/docs/guides/vercel-managed-integration).
3. Obtain explicit review/authorization for an accounting-evidence continuation before paid checks resume. Preserve the malformed receipt and every reservation; the forward sanitizer fix is not historical evidence repair.
4. Resolve the operating owner, traffic/SLO/spend envelope, production-only database and cookie-key isolation, monitoring and offline retention decisions in the [rollout runbook](../runbooks/2026-10-29-atc-b4-rollout.md).
5. Review actual remaining validation and make a separate enablement decision. This report does not authorize B4 production selection.
