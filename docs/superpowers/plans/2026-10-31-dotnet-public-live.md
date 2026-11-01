# Published .NET Live Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Correct .NET documentation and prove public NuGet0.1.0-preview.1 works with published React/Angular clients against real OpenAI/Azure.

**Architecture:** Extend the existing bounded live coordinator with an explicit verified public NuGet selection. Reuse immutable release fixture/probe roles and require actual loaded package identity on every child. Keep package preparation isolated and credential-free, and preserve the existing fixed live matrix.

**Tech Stack:** Nx, TypeScript/Jest/Playwright, .NET10, NuGet SDK signature verification, PostgreSQL, OpenAI/Azure Responses.

---

### Task 1: Public package selection and provenance

Files: `tools/conformance/dotnet/harness/live-runner.ts`, new focused `harness/live-package.ts` if useful, `tests/live-runner.spec.ts`, new `tests/live-package.spec.ts`, and `test-suites.ts` when needed.

- [ ] Add failing top-level tests: list works without package/credentials; execution missing or invalid `--nuget-metadata` fails before credential read; duplicate/relative arguments reject; unpublished or substituted candidate fails; immutable anchored descriptors and released/current runner hashes remain separate.
- [ ] Run focused tests through `npx nx test dotnet-conformance` with existing suite/test filters; observe expected RED, save bounded evidence.
- [ ] Implement closed argument parsing and public descriptor validation using existing NuGet `verifyConsumer`/qualifier and anchored host resolution, without changing archive producer revision checks. Select only package mode. Make selection closure-owned by coordinator, never browser supplied.
- [ ] Revalidate same NuGet/npm provenance in finalization on both success and failure; independently record primary/verification/cleanup status. No automatic replacement/install during execution. Final checks run after drain using a separate bounded non-provider signal; attempt npm/NuGet independently. Require exact reviewed signed archive/DLL SHA256 and real current-wrapper launch of immutable-release roles plus tamper regression.
- [ ] Run focused GREEN tests and existing live runner/budget/redaction tests; commit reviewed unit.

### Task 2: Actual public assembly on every child

Files: `harness/live-fixture.ts`, `harness/live-diagnostics.ts` (or focused reader), `harness/live-runner.ts`, `tests/live-fixture.spec.ts`, `tests/live-diagnostics.spec.ts`, `tests/live-approval-journal.spec.ts` and existing probe launcher as discovered.

- [ ] Add failing tests for actual resolved fixture/probe/cleanup package executable and runtime context, prelaunch mutation, missing/wrong/chunked identity, unauthorized environment injection, secret canary nonpersistence and failure drain. Include genuine package role integration where possible.
- [ ] Implement minimal package-role launcher using `resolveDotnetHost` and `verifyLoadedDotnetHost`; no source fallback or copied DLL overlay. Require bounded own-process identity before readiness. Restrict merged provider settings to approved server-only variables and strip provider secrets from probe/cleanup/browser children.
- [ ] Ensure nested cleanup/probe paths receive the exact same pinned package selection and verify their loaded identity. Record only validated closed safe identity/hash facts.
- [ ] Run RED/GREEN evidence and full deterministic live tests. Preserve all budgets/timeouts/groups and 54 cases unchanged.

### Task 3: Docs correction and actual qualification

Files: both `www/content/docs/{react,angular}/platform/dotnet.md`, `tools/conformance/dotnet/README.md`, a concise evidence summary under `docs` only after actual success.

- [ ] Correct contradictory final baseline wording without claiming cloud managed-identity proof or pending-browser recovery. Explain implemented auth vs separately qualified deployment. Preserve32 compiled C#/XML recipes and public exact NuGet pin.
- [ ] Spec compliance review, then code quality review; fix/review all important findings.
- [ ] Prepare public role consumer from a detached exact-release df1340 temporary Git worktree with original qualified and signed published archives and matching snupkg. No repacking. Prepare/revalidate isolated published npm0.8.3 bundles. Save hashes and source/revision provenance separately from current runner.
- [ ] Run `npx nx build dotnet-conformance`, `npx nx test dotnet-conformance`, `npx nx lint dotnet-conformance`, and `npx nx build/test/lint www` as affected; compile32 recipe programs against selected package. Root owns sequential Nx processes.
- [ ] Start a uniquely named task-owned PostgreSQL temporary container. Use authorized root `.env` by path and existing Azure sign-in; no secret outputs. Run `HASHBROWN_LIVE_OPT_IN=1 npx nx live-provider-e2e dotnet-conformance -- --credentials <authorized path> --consumer-metadata <npm metadata> --nuget-metadata <public pointer>` using exact implemented CLI forwarding. No retries. Require54 actual cases and3preflights,123reserved/128max, bounded output and zero skips.
- [ ] Audit final safe evidence independently against public archive/DLL, npm bundles, actual case identities/wire/effects/usage, before/after descriptors and cleanup. Preserve any failed attempt as failed and require deterministic fix before a separately recorded rerun.
- [ ] Record factual versioned live result in docs/README; rerun affected docs checks after changes. Push PR, attach, merge only on required green checks and approved reviews; keep resyncing with main if necessary, never ask other chats to hold merges.
- [ ] Verify merged-main CI/deployment commit and live docs. Save completion evidence; remove only exact owned temporary database. Continue next pending-browser design milestone; no automatic SDK publication in this milestone.
