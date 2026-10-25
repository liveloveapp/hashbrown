# Recovery SDK 0.8.1 Patch Release Plan

> **For agentic workers:** Use executing-plans task by task, with independent release review before publication. Steps use checkbox syntax for tracking.

**Goal:** Publish the approved recovery APIs as patch 0.8.1, then verify real npm consumers against the .NET recipes with aimock.

**Architecture:** Follow the fixed ten-package release group and existing trusted-publisher workflow. Release from protected main after required CI. Verify npm metadata and tarball contents, then use an isolated temporary consumer checkout with registry-installed SDKs and no SDK source aliases for the complete .NET browser matrix. Do not add repository dependencies or publish via a long-lived token.

**Tech Stack:** Nx, npm trusted publishing, existing release validators, Playwright/aimock, native Microsoft AG-UI .NET integration and PostgreSQL 18.

## Prepare and review

- [x] Confirm current main contains recovery PR740, npm latest is 0.8.0, the publish workflow succeeds with trusted publishing, and 0.8.1 is the next patch.
- [ ] Review this plan independently. User explicitly authorized patch publication and end-to-end verification; routine versioning, protected integration, release tags and trusted publication need no further confirmation.
- [ ] Apply the runtime dependency-pin corrections from PR739, preserving test coverage. Retain the existing Anthropic 0.122.0 and Ollama 0.6.3 exact peer requirements for patch compatibility; do not silently replace them with root dev versions. Verify packed adapter imports and TypeScript consumer declarations with these existing peers before publication, while normal adapter suites exercise current root dev versions. No dependency is newly introduced.
- [ ] Generate explicit 0.8.1 versions for all ten packages and exact internal dependencies using the configured Nx release version command. Update the lockfile as required and inspect every changed file.
- [ ] Add a dated 0.8.1 changelog entry covering changes since npm/latest, particularly recovery, cancellation ownership, provider/tool improvements and compatibility limits. Do not claim an incompatible change is a patch without investigating it.
- [ ] Update both .NET guide notices to say the recovery APIs require 0.8.1 or later, preserving the cold structured/UI cancellation-provenance limitation. Explain registry verification is pending until publishing completes.

## Validate and integrate

- [ ] Run release verifier tests, atomic version verification for v0.8.1, workflow validation if available, vercel-bootstrap tests/lint, all ten SDK builds/tests/lint, package-shape/install checks, and release dry-run. Use one Nx graph at a time; record existing warnings and failures honestly.
- [ ] Review the exact version/manifests/changelog/docs diff independently, resolve findings, run normal staged checks, commit, open/attach a release PR and merge through normal green branch protection.
- [ ] Verify the merged tree and SHA. Create annotated v0.8.1 and the GitHub release with reviewed changelog notes, then move the existing npm/latest trigger tag using an explicit lease. Never overwrite v0.8.1 or republish an existing immutable version; inspect any partial publication before retrying.
- [ ] Follow the existing NPM Publish workflow to completion; diagnose failures without bypassing required checks or substituting long-lived credentials.

## Verify published consumers and recipes

- [ ] Verify all ten registry versions, latest tags, integrity and manifest dependency versions. Download actual npm artifacts and check recovery runtime/facade declarations plus ESM/CJS imports where supported.
- [ ] Create an owned temporary checkout/archive of the exact release source for the test harness, initially without dist, .nx or node_modules. Remove SDK source directories and SDK tsconfig aliases; remove dangling SDK implicitDependencies from project configurations. Disable cache restoration and skip cached tasks. Install actual 0.8.1 packages from registry, retaining exact dependency resolution evidence. Record SDK realpaths and bundler resolution metadata; fail if an SDK resolves outside registry-installed node_modules or to workspace source. Perform the same isolated-artifact consumer preparation before publication with locally packed release artifacts, then repeat with actual npm artifacts.
- [ ] Build the React/Angular hosts using installed packages, compile all eight exact C# recipe setups, and run all 160 .NET browser cases (React/Angular × OpenAI/Azure) against native hosting and aimock, including recovery/reconciliation/tools/interrupt-resume. Use an owned PostgreSQL container and unused ports; retain failure traces, preserve deadlines and assertions.
- [ ] Verify release main CI and all selected production targets, live guide SDK notices/snippets/navigation, and GitHub release/tag identity. Record public CI/release links and local consumer evidence in the PR. Remove only owned test resources and leave the worktree clean.

If isolated consumer tests uncover an artifact-only defect after publishing, do not overwrite 0.8.1; prepare the next patch through the same release gates. If trusted publisher authentication requires an account action, report the exact failed step and request only that input.
