# npm 0.9.0 release preparation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the follow-redirects security update and prepare complete, verified npm 0.9.0 release notes, merge on green and verify without publishing.

**Architecture:** Use the isolated `blove/release-0.9.0` worktree based on current main. Retain main's existing atomic 0.9.0 versions. Fix the stale deployment-catalog test without changing production deployment behavior; apply the reviewed follow-redirects patch and the explicitly approved AG-UI/Vercel security qualification below. NuGet source and publication remain separate. Keep changelog Unreleased, no release announcement, publication tag, registry mutation or publish workflow dispatch.

**Tech Stack:** Nx, npm lockfile, Node test runner, TypeScript, React, Angular, GitHub Actions.

### Task 1: Reproduce and fix the security-update gate

- [x] Read PR #859 and failing CI; reproduce `node --test tools/vercel/bootstrap.test.mjs` unchanged. The lifecycle catalog assertion fails because it reads `.github/workflows/pr-main.yml` after the catalog moved to `.github/workflows/select-deployment-targets.yml`.
- [x] Update only `tools/vercel/bootstrap.test.mjs` to read the owning workflow and accurately name the test. Retain exact lifecycle, marketing and ordered-target assertions. Run `npx nx test vercel-bootstrap` and `npx nx lint vercel-bootstrap`.
- [x] Apply PR #859's exact follow-redirects 1.16.1→1.16.2 lockfile patch. No new dependencies or broad dependency refresh. Verify current GitHub advisory patched range and lock integrity; install frozen lock.

### Expanded security scope (approved by Brian November 8)

- [x] Upgrade direct AG-UI pins to 1.0.4 and keep transitive AG-UI packages coherent for existing B4 dependencies, without changing B4 or NuGet versions. Verify official package manifests and remove vulnerable runtime Zod 3 instances; retain remaining development-tool findings explicitly.
- [x] Upgrade the existing Vercel development CLI to the advisory-patched 65.12.1 rather than forcing incompatible Zod 4 into old CLI internals. Run bootstrap, adapters, builds and deployment verification. Do not run npm audit fix --force.
- [x] Rerun the full preflight on the revised candidate, including framework/provider/local transport contracts and packed-package dependency audits. Preserve original audit and superseded checks as evidence.

### Task 2: Complete 0.9.0 notes and verify versions

- [x] Audit every commit and package public-API change since v0.8.3 through current main. Expand `CHANGELOG.md` 0.9.0 (Unreleased) for breaking prose rename, core recovery/retry/tool UX/subagent changes, provider additions, compatibility/qualification, documentation and release tooling. Separate npm changes from independently prepared NuGet preview and historical evidence.
- [x] Keep install instructions truthful about published 0.8.3. State npm/NuGet approval/publication independently; do not modify NuGet versions/code or announce availability. Existing migration guides remain linked.
- [x] Run `node scripts/verify-release-versions.mjs --tag v0.9.0`. Inspect all ten manifests/internal pins and lock consistency; preserve already-correct versions.

### Task 3: Full release preflight on final source

- [x] Run `node --test scripts/verify-release-versions.spec.mjs scripts/verify-npm-release.spec.mjs`; actionlint all workflows; bootstrap checks.
- [x] Run `npx nx run-many -t build -p angular anthropic azure bedrock core google ollama openai react typesafe --parallel=3`, then equivalent test and lint targets. Run all ten build-api-report targets and investigate changes rather than blindly updating baselines.
- [x] Run relevant packed-package/e2e consumers for all ten release packages; preserve current WebLLM 0.2.87 qualification limits. Run affected www checks for notes/docs if changed. Retain failures/warnings, avoid weakened assertions or model retuning. Audio/cross-hardware remain deferred.
- [x] Run `npm_config_ignore_scripts=true npm_config_dry_run=true npx nx release publish --dry-run --parallel=1`; confirm all ten 0.9.0 artifacts and no registry mutation. Save candidate hashes and source identity under sibling evidence directory.

### Task 4: Review, PR, merge and verify

- [ ] Independent review of code, complete release notes and preflight evidence. Address findings; stage only intended changes and commit with hooks enabled and NX_DAEMON=false/NX_NO_CLOUD=true.
- [ ] Open release-preparation PR, explicitly recording npm publication hold and separate NuGet scope; incorporate security PR as superseded only once merged patch verified. Wait all PR checks green, then merge reviewed head normally, no admin bypass.
- [ ] Verify merged tree, complete main CI, production deployment when applicable and unchanged public registry/tag state. Do not create v0.9.0 or move npm/latest, publish packages, dispatch npm/NuGet workflows, or deploy a release announcement. Report concrete approval-ready state.

Local preparation and independent review are complete. PR/merge/main deployment execution receipts are maintained separately in the sibling release artifact directory after this preparation commit. npm publication remains held and NuGet publication remains separate.

### CI follow-up: candidate-only security dependency graph

PR #881's first CI run rejected AG-UI 1.0.4 against the immutable published 0.8.3 consumer graph. Preserve that historical manifest/lock and archive integrities. Add a narrowly reviewed candidate graph overlay anchored to original lock bytes and exact old-record hashes; preparation and qualification independently derive it. Keep original historical metadata separate from the candidate graph and its identity. Do not weaken graph/archive/source checks. Old-core negative controls must install the historical AG-UI graph; old framework and tamper controls use the candidate external graph, with the actual selected old SDK metadata. Cover exact graph delta, input immutability, stale/rejected overlays, and old-core/framework graph selection before exercising real candidate preparation and missing-API controls. NuGet package versions/source/publication remain separate.

### CI follow-up: deterministic SDK artifact cache

The final-head affected run restored remote SDK artifacts with a different core module layout and missing OpenAI README, invalidating sealed producer provenance and two package checks. Anchor core module output to its absolute source directory; include platform/architecture and NODE_ENV in library build inputs. Keep all inventory and package assertions. Verify fresh builds, cache population, deleted-output warm restore, all ten package inventories/checks and the exact seal → restored build → starter qualification sequence before another CI run. The missing README cache origin is unproven; do not describe it as a runtime SDK defect.
