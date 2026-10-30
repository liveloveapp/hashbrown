# Incremental CI execution

## Scope and authorization

Continue the approved recommendation: prevent label changes from restarting validation, split source .NET tests into independently cached suites, and narrow their inputs. Preserve every existing test, source/package boundaries, fresh package acceptance, commit provenance, cache access controls, and required checks.

## Label-triggered previews

Remove `labeled` from PR/Main CI. A separate workflow handles only adding `preview` to a same-repository, non-Dependabot PR. It selects affected deployment targets and invokes the existing deployment workflow at the PR head. Its concurrency group is independent of PR/Main CI, and it never emits `PR Gate`. Ordinary PR updates retain their existing validation, preview, and gate behavior. Unrelated label additions schedule no jobs in the new workflow.

Reuse deployment-target selection through a callable workflow, preserving existing main target selection, workflow-change fallback, permissions, head/base handling, and optional targets. Do not use pull_request_target or grant a cache write token to PRs.

## Source .NET suites

Keep `npx nx test dotnet-conformance` as the complete entry point. Make it a no-op aggregate depending on three cached Jest targets: harness, runtime, and package. Each keeps runInBand. Preserve runtime-before-package ordering through a task dependency as a conservative safeguard while changing cache granularity; no cross-suite build race has been established. Consumer tampering uses a disposable repository copy. No additional runners.

Use an explicit suite manifest and three small Jest configurations extending the unchanged original config. A conformance test requires all discovered spec files to appear exactly once. The original Jest config remains the complete selection for package harness invocations and ad-hoc debugging.

Harness includes pure lifecycle/resource utilities and their TypeScript fixtures. Runtime includes actual host, database, and C# probe tests plus imported SDK/recovery code. Package includes consumer integrity, package identity/upgrade, host selection, and live-runner provenance tests. Package inputs retain the complete existing source guard closure, including workflow/documentation files. Runtime and harness hash their own spec files and all executable/configuration/fixture dependencies, but exclude unrelated test groups and docs/workflow content. Root lock/configuration/runtime version inputs remain explicit.

## Verification

Write failing contracts for workflow event isolation, exact suite coverage, guarded-source coverage, positive runtime dependencies, and negative unrelated-input examples. Retain PR/Main's requirement that CI_RESULT equals success and prohibit the new workflow from producing PR Gate. Run actual Jest listTests for each selection and compare its union with the original configuration. Use real Nx task hash probes to prove a docs/workflow edit changes package hashes while keeping harness/runtime hashes stable; also prove runtime invalidation for SDK source, core/recovery code, and nuget-consumer/role-shape.cjs imported through dotnet-host. Restore each probe byte-for-byte. Run build/test/lint for conformance and dotnet-conformance. Run a complete cold aggregate and warm repeat with an owned disposable PostgreSQL container; report actual timings without projecting hosted savings. Validate all workflows with actionlint. Review the finished diff and preserve uncached acceptance targets byte-for-byte.
