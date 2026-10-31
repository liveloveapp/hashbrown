# NuGet Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Publish the qualified .NET preview through OIDC and verify the actual NuGet.org package end to end.

**Architecture:** A main-only manual workflow qualifies once, publishes immutable qualified artifacts, and imports the public repository-signed package into full acceptance without repacking. SDK canonical hashes distinguish NuGet signing from payload tampering.

**Tech Stack:** Existing Node test runner/Jest/Nx, .NET SDK 10.0.402, GitHub Actions, NuGet/login, PostgreSQL, Playwright. No new package dependencies.

### Task 1: Public archive import

- [ ] Add failing tests under tools/conformance/dotnet/tests for archive payload equivalence, signature presence, revision mismatch and imported preparation with no source pack.
- [ ] Extend nuget-consumer/prepare.mjs and verify.mjs to accept an explicitly validated published archive and expected original; separate raw archive integrity hash from SDK canonical restore hash.
- [ ] Extend nuget-consumer/run.mjs with a closed full-only public mode; preserve default/PR behavior, diagnostics and all launch guards; pack count zero only in imported mode.
- [ ] Run focused RED/GREEN tests, `npx nx build dotnet-conformance`, `npx nx test dotnet-conformance`, `npx nx lint dotnet-conformance`; independently review the full delta.

### Task 2: Publisher and verification workflow

- [ ] Add scripts/nuget-release.mjs and top-level tests proving successful full artifact selection, exact source revision/hashes, failed/bounded proof rejection and public download equivalence.
- [ ] Add .github/workflows/nuget-publish.yml with manual main-only dispatch, exact-SHA CI precondition, full qualification job, environment nuget OIDC publication job and public full-acceptance job. Upload sanitized evidence and always clean owned PostgreSQL.
- [ ] Use existing action versions; resolve NuGet/login official version. Environment username from vars.NUGET_USER; exact qualified package/symbol paths, no shell interpolation of untrusted metadata, no wildcard broad publishing or skip-duplicate.
- [ ] Run script tests, formatting/lint and affected package verification. Review complete workflow and artifacts independently.

### Task 3: GitHub and PR delivery

- [ ] Set environment nuget and NUGET_USER=blove without touching other settings.
- [ ] Commit scoped changes, create and attach PR; wait required exact-head green, resync main as necessary, ordinary merge and verify merged tree.
- [ ] Wait successful main CI, dispatch publisher on main once, watch qualification/publication/verification to completion. Do not re-dispatch an uncertain publish blindly.

### Task 4: Public qualification and documentation

- [ ] Audit public raw/canonical hashes, signature, full payload, revision, organization owner and exact full664+6/docs32/upgrade outcomes.
- [ ] Update four platform pages and both READMEs from local/unpublished preview to verified NuGet.org install instructions only after successful publication; preserve migration/recovery limits.
- [ ] Test affected docs build/test/lint and recipe compilation, PR and merge green, verify deployed text/highlighting/clipboard on all four routes.
- [ ] Preserve final evidence and retire only owned PostgreSQL/temp installs. Report public package link, release/PR links, verified case counts and material limitations.
