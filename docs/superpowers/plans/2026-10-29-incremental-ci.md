# Incremental CI implementation plan

**Goal:** Reduce repeated CI work while preserving every test and qualification gate.

**Architecture:** Isolate label previews in their own workflow. Keep the .NET test entry point as an aggregate of three independently cached suites, with explicit coverage and cache-input contracts.

**Stack:** GitHub Actions, Nx, Jest, TypeScript, .NET, PostgreSQL.

## 1. Label isolation

- [x] Add failing workflow contracts in `tools/conformance/harness/ci-workflows.spec.ts` for label events, concurrency independence, required gate ownership, and preview head/security boundaries.
- [x] Extract deployment target selection into `.github/workflows/select-deployment-targets.yml`; invoke it from PR/Main CI and `.github/workflows/preview-label.yml`.
- [x] Remove label events from PR/Main CI; preserve ordinary previews and production behavior.
- [x] Run contracts, conformance build/test/lint, and actionlint.

## 2. Independent .NET suites

- [x] Add failing suite-coverage and cache-input contracts to conformance harness tests.
- [x] Create an explicit `tools/conformance/dotnet/test-suites.ts` manifest and three extending Jest configs.
- [x] Add harness/runtime/package targets and make `test` their aggregate in `tools/conformance/dotnet/project.json`. Retain broad source-guard inputs for package tests, and explicit execution closures for the other suites.
- [x] Compare actual Jest discovery with the original full selection; verify no omissions or duplicates.
- [x] Prove selective invalidation with real Nx hash probes and restore all changed probe bytes.
- [x] Run affected build/test/lint, cold aggregate and warm repeat using an owned database; remove only owned resources.

## 3. Review and deliver

- [x] Review the complete diff, qualification settings and access scope.
- [x] Commit validated changes separately; report checks, timings, limitations and remaining hosted verification.

## Verification evidence

- Workflow regression contracts reproduced label-triggered validation and unrelated-label preview cancellation before the fixes, then passed.
- Actual Jest discovery: 14 harness + 33 runtime + 7 package spec files, exactly the original 54 files with no omissions or duplicates.
- Complete local .NET command: 520 tests passed (90 harness, 324 runtime, 106 package), 577.867 seconds wall time. Identical repeat: 2.006 seconds wall time, four of six tasks reused locally (all three suites and build); restore and the aggregate still execute. These are local measurements, not hosted CI timings.
- Nine real Nx hash probes passed: docs/workflows change only package; SDK/core/recovery/role shape change runtime and package; each spec group changes the expected suite. All file bytes and original hashes were restored before full validation.
- Final integrated conformance build, all 128 tests, and lint passed; .NET build and lint passed. The final source build reported zero compiler warnings/errors.
- All workflow structural actionlint checks passed; new workflows also passed ShellCheck. The existing unused PostgreSQL loop variable warning (SC2034), Nx/Jest deprecations, and color-environment notices remain. Locked npm installation reported existing audit/deprecation warnings; dependency files are unchanged.
- Separate specification, quality, and combined reviews approved the changes. All six fresh qualification target objects, broad package source guard, SDK commit provenance, original Jest config/spec files, and current five-target deployment catalog were compared with main and preserved.
- The first hosted execution will populate the new suite keys. Hosted savings still require a completed subsequent run with matching inputs.
