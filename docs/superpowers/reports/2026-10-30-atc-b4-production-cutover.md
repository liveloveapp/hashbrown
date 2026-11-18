# ATC B4 production cutover

B4 was manually enabled on 2026-10-30 at 01:03 UTC following the explicit operator instruction: “Let’s skip hardening for now. Put in prod.” This superseded the earlier disabled-production restriction. It did not turn inconclusive or unexecuted readiness checks into passes, authorize further paid readiness calls, or repair the preserved accounting receipt.

## Active deployment and checks

- Production: https://atc.hashbrown.dev and https://hashbrown-atc.vercel.app.
- Deployment: `dpl_24FAPka8oYJZA2gNbzgXFT25dA6o`, READY, production target; both aliases were independently re-read from the authenticated API.
- Runtime source: `a2f92a4f02ab1dfc38051a44e509afb439634793`, published B4 0.15.7. The prior production source `c8e8ed5c93fd15738f924ed0d9a4faa5faee8b8b` was compared before cutover: intervening changes did not alter the ATC runtime or its dependency lock. These results are not relabeled as a build of that newer source.
- Complete uploaded output SHA256: `f5bd505b504331ce911ada28d7aca549194e3aa004a4cbb040406aadcb3f0555`.
- Normal B4 function configuration: 60-second maximum duration, streaming and cancellation enabled. No shortened-duration fault artifact was promoted.
- Both domains returned static Angular hosting HTTP200, GET `/api/run` HTTP405 with `Use POST`, and malformed POST `/api/run` HTTP400 with `Invalid run input`.
- No model-capable request or paid chat smoke was run. These checks establish routing, hosting and configuration-accepting ingress, not end-to-end chat completion or failure recovery.

## Production storage and credentials

A separate Neon resource `atc-production-01` (`store_mEdmsIszU3RNwhhY`) was provisioned on the `free_v3` plan and connected only to production. Its connection hostname differed from the shared preview resource. The database was empty at preflight; a real SQL connection verified client-side encryption, certificate authorization and `rejectUnauthorized=true`. Neon's internal `pg_stat_ssl` reported false behind its proxy; that field was not represented as client TLS evidence.

A new random 48-byte production-only visitor-signing key was stored encrypted in Vercel. Database and signing-key values were not logged or written to local files. The original root `.env` was not modified. Production project configuration was verified in memory; Vercel rejects environment decryption from a READY deployment, so no independent deployed-secret/remote-byte attestation is claimed.

## Rollback and future deployments

The prior OpenAI production deployment remains READY and was not deleted: `dpl_AcdbW5cJEYQaLsksYMnCZSu5EipA`, https://hashbrown-hlqoafnhi-blovedev.vercel.app. A supported rollback promotes that retained deployment. Existing B4 conversations do not automatically migrate into direct OpenAI conversations.

The active B4 deployment captured `ATC_CHAT_BACKEND=b4run` at creation. After promotion, only the newly created project-wide selector was removed, and the active production ingress was checked again. Vercel environment changes apply to new deployments and do not alter the existing deployment's environment. Production storage and signing-key variables remain configured.

**CI packaging follow-up:** the repository's normal ATC CI build currently defaults to OpenAI. A later automated ATC production deployment therefore reverts to OpenAI unless its build explicitly selects B4. Removing the project-wide selector prevents that default artifact from receiving an incompatible B4 runtime setting and failing startup. Align production build selection before relying on automatic deployments to retain B4. No workflow, branch protection, test, or policy was changed during this manual cutover.

## Deferred readiness and operating work

The [managed-readiness report](2026-10-29-atc-b4-managed-readiness-followups.md) remains authoritative for its original results: two inconclusive managed-timeout attempts, unexecuted disposable-compute restart, rollback live assertions with a corrupted serialized audit receipt, and a correctly fail-closed spending observer. No fault limit, reservation, receipt or accounting guard was reset or bypassed.

Production incident ownership, traffic/latency/error objectives, provider operating-spend ceiling, monitoring/escalation and retention scheduling remain unresolved. The prior bounded load observations are not a production capacity guarantee. These are deferred limits, not completed hardening.

The initial automatic approval review used the former disabled-production restriction and rejected the environment-change request before execution. Re-review explicitly cited the newer human production instruction and allowed the operation. All production changes described above were then executed through normal supported Vercel interfaces.

## Evidence

Private cutover receipts preserve authenticated deployment/domain identities, request IDs, project configuration checks, the separate database fingerprint, the retained rollback deployment, and the final selector scope. No secrets, database URLs or model text are included in this report. Upload hashes bind the locally verified artifact; they are not independent remote byte attestation.
