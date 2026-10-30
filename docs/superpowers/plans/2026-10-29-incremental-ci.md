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

## Merge follow-up and cold-path profile

- Integrated main's framework conformance and production documentation verification changes. Integration checks passed: conformance build/lint, 128 Jest tests, 22 framework-harness tests and 13 real-framework tests; core build/lint and 2,467 tests; .NET build/lint. The earlier full 520-test source run predates this base update; fresh required hosted validation covers the latest head.
- Preserved main's generated framework fixture bytes after the merge hook attempted formatting. The canonical generator check verifies all three framework captures.
- Original hosted PR run 41006953861: CI job 22m40s; source validation 9m48s; source suites 1m23s harness, 8m06s runtime, 1m18s package (cold keys); conformance 2m05s; uncached package acceptance 9m13s.
- Saved local Jest performance data from the complete cold source run: native-approval-durability.spec.ts 179.439s (about 42% of runtime suite time); live-wait-policy.spec.ts 62.149s (two intentional 31-second acquisition waits); nuget-consumer.spec.ts 63.043s. These are local file timings, not hosted per-file measurements.
- Hosted acceptance artifact: passed PR profile, 32 documentation programs. Phases: candidate 31.089s, npm preparation 6.063s, initial qualification 2.449s, docs 162.277s, upgrade 27.972s, smoke 104.507s, fault regressions 212.726s, final qualification 2.418s, final npm qualification 0.251s; total 552.572s. Docs plus fault regressions account for about 68% of the total.
- Next candidates: virtual time for the two synthetic long-acquisition tests while retaining real abort/deadline coverage; profile per-case host/database startup in native approval durability; inspect repeated preparation in docs and fault regressions while retaining every program, mutation, and qualification assertion. These candidates are investigation findings, not implemented behavior changes.
- Remaining hosted follow-up: merge only after the latest required checks pass; observe protected main storing the new suite hashes, then match subsequent PR remote hits to those exact hashes. Local warm results and within-job reuse alone are insufficient.
