# Incremental CI implementation plan

**Goal:** Reduce repeated CI work while preserving every test and qualification gate.

**Architecture:** Isolate label previews in their own workflow. Keep the .NET test entry point as an aggregate of three independently cached suites, with explicit coverage and cache-input contracts.

**Stack:** GitHub Actions, Nx, Jest, TypeScript, .NET, PostgreSQL.

## 1. Label isolation

- [ ] Add failing workflow contracts in `tools/conformance/harness/ci-workflows.spec.ts` for label events, concurrency independence, required gate ownership, and preview head/security boundaries.
- [ ] Extract deployment target selection into `.github/workflows/select-deployment-targets.yml`; invoke it from PR/Main CI and `.github/workflows/preview-label.yml`.
- [ ] Remove label events from PR/Main CI; preserve ordinary previews and production behavior.
- [ ] Run contracts, conformance build/test/lint, and actionlint.

## 2. Independent .NET suites

- [ ] Add failing suite-coverage and cache-input contracts to conformance harness tests.
- [ ] Create an explicit `tools/conformance/dotnet/test-suites.ts` manifest and three extending Jest configs.
- [ ] Add harness/runtime/package targets and make `test` their aggregate in `tools/conformance/dotnet/project.json`. Retain broad source-guard inputs for package tests, and explicit execution closures for the other suites.
- [ ] Compare actual Jest discovery with the original full selection; verify no omissions or duplicates.
- [ ] Prove selective invalidation with real Nx hash probes and restore all changed probe bytes.
- [ ] Run affected build/test/lint, cold aggregate and warm repeat using an owned database; remove only owned resources.

## 3. Review and deliver

- [ ] Review the complete diff, qualification settings and access scope.
- [ ] Commit validated changes separately; report checks, timings, limitations and remaining hosted verification.
