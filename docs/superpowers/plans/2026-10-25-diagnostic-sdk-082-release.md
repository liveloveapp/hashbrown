# Diagnostic SDK 0.8.2 Release Plan

> Use the verification-before-completion workflow and independent release review. The user explicitly authorized 0.8.2 publication, protected integration, tags, trusted publishing and all 172 registry-consumer .NET browser cases. Do not ask again for routine release steps.

**Goal:** Publish the ten matching SDKs at 0.8.2 with PR751 diagnostics, then verify the published packages across React/Angular and OpenAI/Azure.

**Architecture:** Use the existing fixed release group and unchanged trusted-publisher workflow. Freeze a reviewed main commit with an immutable v0.8.2 tag; dispatch the existing manual publisher against it. Never overwrite an existing version or substitute a long-lived token. Keep release-safeguard work excluded.

**Tech stack:** Nx/npm, existing release validators, Microsoft AG-UI .NET 10, PostgreSQL 18, Playwright/aimock.

## 1. Prepare the release

- [x] Confirm registry latest is 0.8.1, v0.8.2 is unused, no publisher is active and main includes PR751. Inspect other unreleased SDK changes and preserve existing dependencies/defaults.
- [x] Run the existing v0.8.2 atomic-version verifier before bumping and retain its expected failure; inspect Nx version CLI options before execution.
- [x] Generate version 0.8.2 for all ten packages and exact internal dependency pins through the configured Nx release version command, without committing or tagging automatically. Regenerate React/Angular package-version constants and inspect lockfile changes.
- [x] Add an accurate 0.8.2 changelog, covering PR751, the opt-in Chrome phases in PR749 and related docs/example fixes since v0.8.1. Update both .NET guide notices to require 0.8.2 for diagnostics while preserving the strict default and 0.8.1 basic recovery distinction.
- [x] Independent plan/diff review; fix findings without widening release scope.

## 2. Validate and integrate

- [x] Run release validator tests, v0.8.2 atomic verification, all ten SDK builds/tests/lints, React inferred lint, affected package-shape/install checks and docs build/test/lint/route checks. Serialize Nx graphs per workspace and retain warnings/failures.
- [ ] Prepare an isolated consumer without workspace SDK sources/aliases, dist or Nx cache restoration. Install locally packed 0.8.2 artifacts, prove actual bundle origins and run all 172 unchanged .NET browser cases with eight exact recipe combinations before publication.
- [ ] Review the exact version/changelog/docs/manifests diff, open/attach a release PR, wait for the exact-head required green checks and merge. Compare reviewed and merged trees. Preserve immutable publication source.

## 3. Publish and verify

- [ ] Create annotated v0.8.2 and GitHub release notes on the merged release commit; dispatch npm-publish.yml from main with release_tag=v0.8.2. Observe the existing workflow to completion. Inspect any partial publication before retrying.
- [ ] Download all ten actual npm tarballs, verify version/latest/integrity/dependency manifests and supported ESM/CJS imports. Type-check core/React/Angular diagnostic APIs and prove explicit schema-invalid history restoration produces immutable diagnostics without work.
- [ ] Recreate or reset the isolated consumer to the exact tagged test source and install actual registry 0.8.2 SDKs. Remove SDK source directories and aliases, disable cache restoration, verify lockfile/SRI/realpaths and both bundlers' SDK origins. No assertion/deadline/retry weakening or synthetic provider warm-up.
- [ ] Run all 172 .NET browser cases (React/Angular × OpenAI/Azure), including the 12 diagnostic cases, and compile all eight exact C# recipe combinations. Preserve reports/traces and source identities.
- [ ] Verify main CI/selected production deployments and live guide version notices. Record publication and registry-consumer evidence on the PR/release. Clean up only owned test resources and leave the worktree clean.

If trusted publishing requires an account action, report the exact failed step and ask only for that input. Artifact defects require a new immutable patch rather than overwriting 0.8.2. Existing tooling/bundle/API warnings must be distinguished from new failures.
