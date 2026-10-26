# WebLLM SDK 0.8.3 Patch Release Plan

> Use the executing-plans and verification-before-completion workflows with independent release review. The user explicitly authorizes a new patch release and verification of the published npm image/structured-tool APIs. No routine publication confirmation is needed. Audio and cross-hardware testing remain deferred.

**Goal:** Publish all ten SDKs atomically at 0.8.3, then pull latest and verify actual registry artifacts expose the WebLLM image and structured-tool APIs.
**Architecture:** Start from current main, use existing Nx fixed-group versioning and release validators, merge a version/changelog PR through protected CI, freeze an immutable v0.8.3 tag, and invoke the existing trusted-publisher workflow against that tag. Verify registry tarballs and isolated runtime/type consumers rather than workspace aliases. No dependencies, workflow changes, new model downloads, or release-announcement changes.
**Tech stack:** Existing Nx/npm/GitHub Actions, TypeScript and built SDK artifacts.

## Prepare and review

- [x] Fetch latest main/tags, inspect release runbook/workflow, ensure no publication is active, and confirm all ten latest versions are 0.8.2 and 0.8.3 artifacts are absent.
- [x] Retain the expected RED from `node scripts/verify-release-versions.mjs --tag v0.8.3` on the unchanged manifests.
- [x] Review this plan independently. Generate explicit 0.8.3 with `npx nx release version 0.8.3 --git-commit=false --git-tag=false --stage-changes=false --git-push=false`; do not publish or create tags automatically.
- [x] Regenerate React/Angular version constants with their existing prepare targets. Add dated 0.8.3 notes to CHANGELOG.md based on v0.8.2..main: WebLLM opt-in images, selected structured tool phases, object-array validation fix, and relevant docs/.NET improvements. Preserve all external dependencies/defaults.

## Verify and integrate

- [x] Run release-validator tests and atomic v0.8.3 verification, all ten SDK build/test/lint targets and React inferred lint; use Nx commands and serialize shared generation/build dependencies. Run package-shape/install checks where applicable plus bootstrap tests and publish dry-run from existing built packages. No local model e2e in CI; no audio/hardware testing.
- [ ] Review the exact manifest/constants/changelog diff independently, fix findings, commit/push/open and attach a release PR. Merge only after protected green CI, continuing normal main synchronization. Compare reviewed and merged trees.

## Publish and verify actual artifacts

- [ ] Create immutable annotated v0.8.3 and GitHub release notes from the reviewed merged release commit. Dispatch existing npm-publish.yml from main with release_tag=v0.8.3. Do not move version tags, overwrite npm versions, add tokens, or republish a partially published version blindly.
- [ ] Observe publication to completion. Inspect the actual registry state before any retry. Ask only for an account/trusted-publisher action if required.
- [ ] Pull latest after publication. Verify all ten packages/version/latest/internal pins and tarball integrity using fresh registry metadata/downloads.
- [ ] In a separate temporary consumer using actual installed 0.8.3 packages and no workspace aliases, verify ESM/CJS exports and TypeScript declarations: existing experimental_webllm text default, image overload/types/resolver requirement, experimental_webllm_tools factory/phase/context types, and React/Angular consuming the core transport. Assert no WebLLM dependency/peer and preserve negative type controls for invalid media/tool options.
- [ ] Exercise published image and structured-tool adapters with injected model-free engines to confirm serialized image requests, selected JSON argument calls and final schema streaming. Do not claim new model/hardware quality; existing bounded Phi-3.5 qualification remains the model evidence.
- [ ] Record exact release/tag/source/workflow/tarball/consumer evidence and warnings, update the release PR description, leave original and release worktrees clean/current. Audio and cross-hardware work stay deferred.

## Pre-publication evidence

Independent plan and release-diff review found no issues. All ten builds passed; nine package test tasks passed in the initial parallel run. Core's 25-round test exceeded its unchanged 5-second timeout under that run and caused two subsequent shared-mock failures; the full isolated `npx nx test core --runInBand` passed all 2,175 tests / 95 suites / 14 snapshots without source/assertion/timeout changes. The failure and passing logs are retained.

All release-package lints, explicit React inferred lint, core/React/Angular package e2e, bootstrap test/lint, 17 release-validator tests, actionlint, atomic v0.8.3 verification, and the serial publish dry-run passed. Isolated locally packed artifacts passed seven model-free ESM/CJS runtime checks (all package imports/pins, text default, image serialization/cleanup and tool dispatch/finalization) and a strict TypeScript consumer with all image/phase/result/context/options exports and negative literal/variable controls. No workspace SDK aliases or WebLLM dependency are present in that consumer. The same fixtures will run against newly downloaded registry packages after publication.
