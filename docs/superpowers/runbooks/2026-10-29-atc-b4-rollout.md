# ATC B4 rollout preparation and operating contract

Status: Preparation only. B4 remains disabled in production. No production database, secret, domain or deployment selection has been changed by this work. This runbook is not an enablement approval.

## Qualified source and artifacts

Freeze runtime source `a2f92a4f02ab1dfc38051a44e509afb439634793` (merged #828). Harness/report commits are separate. The [merged-source assessment](../reports/2026-10-29-atc-b4-merged-source-requalification.md) records fresh build/test/lint, 86 browser fixture cases and the distinction between executable equivalence and unequal raw function hashes. Older hosted results retain their original source and deployment bindings.

Before any new preview execution, independently bind the clean source, published B4 0.15.7 pins/lock SRI, complete raw output/function hashes and actual authenticated READY preview IDs, project/team and database fingerprint. Preserve the normal B4 and direct OpenAI outputs separately. A fault artifact must change only the recorded preview duration field and must never be promoted to production.

## Current qualification status

The [managed-readiness follow-up report](../reports/2026-10-29-atc-b4-managed-readiness-followups.md) records the actual outcomes and evidence limits. Both allowed timeout faults were inconclusive; neither observed the required active owner plus durable input, and the fault limit is exhausted. The disposable-compute restart remains unexecuted without Neon management access and independently verified disposable ownership.

The preview rollback's live assertions qualified and its alias was restored and removed. A sanitizer defect then obscured serialized authority metadata; the original receipt is preserved, the forward fix is independently reviewed, and later read-only checkpoint inspection is supplemental only. The current pinned spending observer correctly rejects that original receipt. **Do not resume paid checks by moving/replacing it, resetting any ledger or reinterpreting unknown usage as zero.** A reviewed and explicitly authorized evidence-admission continuation is required first; all six reservations remain retained under the $10 ceiling.

B4 remains disabled in production. These outcomes do not complete the operating contract or authorize cutover.

## Required operating decisions

These fields are intentionally unresolved; measurements do not approve targets.

| Decision                              | Required evidence / current status                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production service and incident owner | Human assignment pending.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Initial allowed traffic               | Peak concurrent chats and starts/minute pending; preview evidence is a bounded 1/2/4-user closed-loop workload, not a capacity ceiling.                                                                                                                                                                                                                                                                                                      |
| Availability and latency objectives   | Error-rate threshold, first-content and completion latency targets and evaluation window pending. Do not derive an SLO from one preview sample.                                                                                                                                                                                                                                                                                              |
| Provider-spend ceiling                | Production operating spend ceiling is pending. The human approved a $10 maximum for remaining readiness checks. Their durable16-request aggregate ceiling has6/6/4 phase allocations, but the reviewed full-context reserve permits at most10 paid dispatches and fewer when confirmed usage is added. Request count is not exact upstream cost.                                                                                             |
| Cost observation and reserve method   | The independently reviewed scoped observer counts confirmed provider-token usage and preserves every unknown liability. Each tool-free model-turn reservation retains $0.973728 for up to9 upstream attempts at the4096-token output cap; confirmed usage plus all retained reserves must fit the ceiling before dispatch. Unknown usage is not zero spend. An organization-wide billing credential is not required for this bounded method. |
| Production storage                    | Dedicated production database/role/compute, authenticated identity/isolation, verified TLS, capacity and backup/recovery decision pending. Preview connection strings are not production configuration.                                                                                                                                                                                                                                      |
| Visitor signing key                   | Stable, strong production-only secret, shared consistently across B4 replicas; owner/rotation/recovery policy pending. Never print or commit it.                                                                                                                                                                                                                                                                                             |
| Monitoring and escalation             | Owner must validate HTTP5xx/429/timeouts, request duration, storage/connection health, ownership/canonical-state failures and available provider usage. Current one-shot harness assertions are not continuous production alerts.                                                                                                                                                                                                            |
| Retention maintenance                 | Owner and offline maintenance schedule pending; no online distributed-prune lock or automatic scheduler exists.                                                                                                                                                                                                                                                                                                                              |
| Enablement / rollback decision        | Separate explicit authorization required after reviewing actual evidence, residual risks and the chosen initial operating envelope.                                                                                                                                                                                                                                                                                                          |

## Remaining preview qualification

Follow the [reviewed follow-up design](../specs/2026-10-29-atc-b4-rollout-followups-design.md). Do not substitute a client timeout for platform termination, a compute restart for storage-replica failover, or silence from a dead owner for observed stale-write fencing.

1. Verify the normal and shortened-duration fault preview manifests and the aggregate spend/request gate. Limit fault dispatches to two, including inconclusive attempts. Require actual platform timeout evidence correlated to the owned deployment/request ID; classify a naturally fast completion as inconclusive and immediate lease release as graceful cleanup.
2. A compute restart requires verified disposable project/branch/endpoint ownership and management access. Never restart the existing shared preview compute. Establish a committed synthetic prefix and active owner before the single provider operation; record provider operation IDs, observed disconnect/reconnect and actual admission state. Missing observations remain untested.
3. Rehearse rollback using a newly owned non-production alias and actual separately built OpenAI/B4 artifacts. Preserve initial alias mapping, verify fresh synthetic visitors and state isolation, then restore and remove only the test alias. Never point a production domain at a test artifact.

Every attempt is reserved durably before dispatch; failed/inconclusive attempts count. Existing 99/120 load and10/16 recovery ledgers are retained unchanged. The new phase is at most16 additional reservations, not a reset. No further sustained-load ramp is implicit.

## Production preflight, without changing production

An authorized operator must verify exact production storage identity and isolation, stable cookie configuration, TLS, required provider settings and a normal60-second artifact/runtime configuration. Current read-only metadata showed only preview B4 database/cookie keys and no production ATC_CHAT_BACKEND key. Environment-key presence alone does not verify credential values or service isolation.

Retain a verified working direct OpenAI deployment and its immutable source/artifact/config identity before a future cutover. Backend selection is packaged: changing only ATC_CHAT_BACKEND on a B4 artifact is not a valid rollback and is rejected by the adapter. Do not enable B4 until the owner accepts the measured envelope and unresolved platform-failure limits.

## Rollback procedure to rehearse in preview

Record the exact prior alias mapping and both artifact identities. Switch only the owned test alias to the verified OpenAI deployment, verify actual routing and a fresh visitor response, and prove that this direct request created no B4 state writes. Existing B4 conversations do not automatically migrate to durable OpenAI threads; record the user-visible restart/new-chat behavior rather than promise transparent continuation.

Restore and verify the original mapping in cleanup, remove the alias if it was created solely for the rehearsal, and retain the database and audit evidence. Production rollback would be a separately authorized promotion of the verified retained OpenAI deployment. An unexpected result stops further scheduling and preserves evidence.

## Offline retention maintenance

Browser calls expire after10 minutes. Settled/expired call records have24-hour retention and opportunistic pruning; anonymous conversations stop admission after24 hours. Physical thread/checkpoint deletion requires operator maintenance.

The existing command `npx nx prune-agent-state atc-server --offline` is permitted only after admission is disabled, **every** B4 instance using that database is stopped, and active runs have settled. The flag is an operator assertion, not a distributed lock. Delete checkpoints before thread rows; a failed deletion must leave the thread discoverable for retry. Rerun while still offline and verify success before reopening admission. Never run this command as an online experiment or against user state during readiness testing.

## Evidence and cleanup acceptance

Record actual source/versions/raw hashes/IDs, request and provider operations, failed and inconclusive attempts, classification limits and terminal cleanup. Scan reports against actual secret values before removing temporary mode0600 credentials. Verify requests/pools/workers closed, aliases restored, the owned fault preview retired, and any explicitly created disposable compute suspended/removed. Retained normal previews and synthetic audit rows must be listed deliberately. No shared-state prune or deletion of original user files is part of cleanup.
