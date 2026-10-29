# ATC production-readiness implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task by task. Steps use checkbox syntax.

**Goal:** Execute the approved seven recovery/fencing cases and bounded sustained workload on frozen merged main while B4 stays disabled in production.

**Architecture:** Harness code is durable, reviewable test infrastructure in `tools/atc-readiness/`; runtime artifacts are always built from clean `6d414a37d25ab336192e52fd4d00b26321758ee7`, not the harness/design commit. All network experiments use two authenticated READY previews of the dedicated hashbrown-atc project and a manifest checked before database access. Evidence is private first, then sanitized into a separate report PR.

**Tech Stack:** Existing Node 24, Node built-in test runner, installed published B4 0.15.7, existing tsx/Ajv/Vercel, native fetch and Postgres. No dependency or product change.

**Approved spec:** `docs/superpowers/specs/2026-10-28-atc-production-readiness-design.md`, committed b7ef80cf and explicitly approved by the human. Its numeric bounds and pass conditions are authoritative. No new routine approval is needed.

## Task 1: Recover environment and freeze identities

- [x] Restore isolated worktree from b7ef80cf without touching dirty user checkouts. Keep original deleted worktree metadata intact.
- [x] Record actual source/design commit, clean status and lost temporary evidence paths. Recover private old harnesses from local session history if available; otherwise implement the same documented protocols. Never infer new success from old reports.
- [x] Install frozen lockfile via `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org`. Preserve logs; verify no package/lock diff and all four root B4 pins remain exactly0.15.7.
- [x] Save all subsequent progress to private `/private/tmp/atc-production-readiness-0157/` mode0700, files0600. Commit nonsecret harnesses and plan for durability.

## Task 2: Shared guards and deterministic tests

Create `tools/atc-readiness/common.mjs` and `common.test.mjs`. Inputs: explicit runtimeRoot, staging directory, manifest path, expected version/source and artifact path. Module import must not open DB or read credentials.

- [x] First write top-level `node:test` failing tests for exact source/version/artifact/tree/HTTPS identity mismatch rejection; reject same preview twice, redirects, raw production target and unexpected DB hash. Inject fake DB-opening callback and assert it remains uncalled on mismatch.
- [x] Implement minimal pure identity/manifest/hash validation, explicit root dependency resolution, sanitized error reporting, SSE incremental parsing and canonical tuple/thread/write summaries. Functions exposed for reuse have doc blocks. Validate secret-file mode and redact parsed URI credentials as well as whole secret values.
- [x] Add controlled stream tests for split SSE frames, malformed/duplicate terminal event, nonterminal EOF, timeout/cancellation and secret-bearing errors. Run `node --test tools/atc-readiness/common.test.mjs`; prove red then green and record results.

## Task 3: Recover and requalify recovery harnesses

Create `tools/atc-readiness/storage.mjs`, `owner-worker.mjs`, `runtime-owner.mjs`, `runtime-recovery.mjs`, `provider-proxy.mjs` plus focused deterministic tests. Existing old scripts were in now-missing `/private/tmp/atc-owner-failure-validation/`; old exact semantics are recorded in the2026-10-26 owner-failure report. Inspect installed APIs and authored generated runtime ingress before adapting.

- [x] Storage: fresh randomprefix, six-secondlease/one-secondheartbeat except documented lateCOMMIT/explicitfence variants; execute five spec cases sequentially with actual hosted pool, ownedfork/IPC, bounded waits. Observe database clock and real blockers; reject lateCOMMIT and verify effect rollback; staleclose cannot remove successor.
- [x] Runtime: generated actual artifact worker over shared dedicated hostedDB with managedpreview successor. Cookie continuity private only. Killowner withoutfinally; seedcommittedhistory first; require409 Retry-After entirelybeforeexpiry then successor dispatchafter natural DB-clock expiry.
- [x] Runtime suspension: private authenticated loopback proxy must forward real HTTPS provider request/bytes unchanged; verify pinned schema/cap; pause ownedPID only after inputcheckpoint commit/rowunlock, hold actual completedbytes, allow managedsuccessor afterexpiry, deliverbytes thenresume. Require durablewinner unchanged/staleproviderexcluded/admissionabort; do not assert zero oldstreambytes or a specific failedwrite absent an observer.
- [x] Enforce shared recovery requestbudget16, all initialization/IPC/error paths sanitized, commandtimeouts, SIGCONT before ownedworker cleanup, close clients/pools. Do not delete rows/tables or signal any nonownedPID.
- [x] Test fail-fast/cleanup/timebounds and realbyteproxy forwarding locally with controlled fixtures. Run syntaxchecks and source review before hostedexecution. Cases retain all approved spec canonical immediate/75s assertions.

## Task 4: Timed sustained-load harness

Create `tools/atc-readiness/load.mjs`, `load-scheduler.mjs`, `load-scheduler.test.mjs`. Scheduler accepts fake monotonic clock/sleep/run hooks for deterministic unit tests; network execution requires explicit main entry.

- [x] Write failing tests for three five-minutelevels1/2/4, per-user20s minimum startgap, max120attempts, request55sdeadline, phase20mdeadline, stopfirstfailure and no new scheduling duringdrain. At most level concurrencyactive, newthreads eachrequest. A hardcap hit before schedulecompletion is INCOMPLETE.
- [x] Implement closed-loop per-userworkers with absolute 0/5/10/15-minute boundaries: activate one worker at0, one more at5, two more at10. Carry active requests across increasing-concurrency boundaries; stop all newstarts at15 and only then drain. Retain actual walltime and planned/actual start/end. Test requests crossing both increasing-level boundaries so the scheduled ramp cannot exceed15minutes. Pacing includes processingtime: nextstart=max(laststart+20s, previouscompletion). Runtime traffic only, no mockmodel in hostedmode.
- [x] Perrequest use unique marker/thread/run IDs, alternate two previews with redirect:error; streamreal SSE, require exactly one matching RUN_FINISHED/noRUN_ERROR and valid pinnedstructuredschema. Immediately afterEOF first DBquery checks exactthread zero admissions withoutpolling; then inspect canonicaltuple/thread/checkpointwrites, onehuman/onecanonicalproviderresponse/cap/marker and noforeignmarkers. Store rawtext onlyprivate ifneeded; publicevidence hashes only.
- [x] Record start/firstbyte/firstcontent/EOF monotonic times, status/providerusage ifavailable, completefailure diagnostics sanitized, attempted/finished/failed and achieved rates/concurrency perlevel, latency p50/p95/max and hardbounds. Snapshot all completedthreads immediately and after>=75s; compare fullrecordedcanonical summaries andzero leases.
- [x] Run `node --test tools/atc-readiness/*.test.mjs`, syntaxcheck files, independent source review and relevant lint. Never loosen approved bounds/assertions after failure.

## Task 5: Fresh exact-main artifact and preview preflight

- [x] Use separate clean isolated runtimeworktree at6d414a37; leave harnessbranch durable. Baseline `npx nx run-many -t build,test,lint -p atc-server --parallel=1 --skip-nx-cache --output-style=static`; full `ATC_CHAT_BACKEND=b4run npx nx build atc --skip-nx-cache --output-style=static`. Sanitizedchildenv prevents inheritedgenericDB/env.
- [x] Verify rootlockinstalled SRI against actual immutable signedmanifest/publicreceipt (recover committed publicreport/actualrelease assets asneeded, no new release dispatch). Hash artifact, fullfunctiontree, completeoutputtree and lock. No claiming old temporary evidence still exists.
- [x] Recover dedicatedprojectIDprj_777QtswW89lM4qrgpeR2C7jLPxGq/orgteam_DjeixPtTYBQG210UovUdTJW8/namehashbrown-atc/ownerblovedev through authenticated CLI. Credential-redacting wrapper must resolve installed VercelCLI, read originaluser token privately and only run allowlisted previewcommands; never dump env/token.
- [x] Pull previewcredentials into0600file onlynow. Normalize TLSverify-full DBDSN; bind its SHA, ≥32bytecookie secret; compare dedicated identity to prior publishedsanitizedevidence whereavailable. No global DATABASE_URL in probes.
- [x] Copy completeprebuiltoutput identically into new deploy-a/b staging; deploytwo previewonly B4overrides; save actualrawdeploymentresults, inspectREADY/preview/project/name/owner. Preserve rawtargetnull ifCLIreturnsit; use authenticatedinspecttarget authority. No production configmutation.
- [x] Sealactual source/package/lock/manifest/artifact/fulltree/outputtree/project/IDs/HTTPSorigins/normalizedDSNSHA. Review actualmanifest independently before probes. Reject drift before openingDB.

## Task 6: Execute bounded experiments and inspect evidence

- [x] Run five storage cases then killowner then suspendedowner sequentially; preserve receipts onfailure; enforce16requestrecoverybudget. Wait75s snapshots, verify cleanup before nextphase.
- [x] Run exact approved15minute timedload once, <=120attempts/20minutephase deadline; record nonzero firstEOFlease/error asfailure. No providerbudget override or newuser-suppliedSLO invented.
- [x] Inspect actualevidence and independentreview: everycase assertion, natural DBclock takeover, actual realproviderbytes/abortsource, completecounts, actualscheduler duration/concurrency, stopcriteria, hashes, firstquery/75s invariants and limits. Preserve failed/incompleteattempts; diagnose before any rerun.

## Task 7: Cleanup, report and PR

- [x] Close allownedrequests/pools/proxies; SIGCONT/terminateonlyownedchildren. Verify nocredentialfile afterexactsecretvaluescan of sanitized report/evidence. Preserveauditrows and do notprune/deleteuserstate.
- [x] Commit report/evidence under `docs/superpowers/reports/2026-10-29-atc-b4-production-readiness*`, include exactruntime/artifact/package/deploymentbindings, measured envelope, errors and truthful remainingmanagedhost/failover/productionSLOgates. Design/report/harnesscommits separatefrom6druntimesource.
- [x] Run formatting/whitespace, harnessunit/syntax/lint, actualaffectedpackagechecks ifany productcodechanged (noneplanned), independentclaim/secretreview. Push normally and create/attach reportPR. Do not merge reportPR/#799, modifyB4draft1122, enableproduction orpublishanything.
