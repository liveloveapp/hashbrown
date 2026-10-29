# CI cache boundaries implementation plan

**Goal:** Reuse deterministic library builds and source .NET tests across unrelated changes while keeping external package qualification fresh.

- [x] Record real Nx task hashes before changing configuration and reproduce missing library cache eligibility and overly broad .NET invalidation.
- [x] Enable caching for deterministic library compile, assembly, version preparation and unit test targets. Include compilation source and assembly tooling in build hashes so restored packages cannot be stale.
- [x] Replace the .NET source test target's transitive production input with its actual source, recovery adapters, shared harness, configuration and qualification-test closure. Retain SDK version and PostgreSQL configuration. Keep package acceptance, preparation, docs and upgrade commands uncached and retain commit-bound SDK provenance.
- [x] Verify real Nx hashes: unrelated UI/docs preserve the source test hash; SDK/core/recovery/harness/workflow changes invalidate it. Confirm built package restoration after deleting output and invalidation after source edits.
- [ ] Run build, test and lint for affected packages, plus package guard regressions. Review the changes, push to PR #814, retain required checks and squash auto-merge, and monitor the latest head.

No dependency additions, merge-protection changes, package guard changes, or additional CI runners.

Validation evidence:

- Five cache regression tests pass after reproducing three failures.
- Real Nx hashes preserve source .NET results for unrelated browser UI, docs and provider edits; core, recovery and C# fixture edits invalidate them.
- Sequential compiler/build/test/lint validation reused 37 of 38 tasks in 12.5 seconds.
- Moving aside the assembled Azure output restored all 31 files byte-for-byte with 4/4 cache hits in 828ms.
- All 57 workbench/embed cases, route parity and mobile checks passed.
- The first full .NET run passed 519 tests; its one timeout led to removing redundant disposable consumer cloning. All 33 consumer tests then passed in 123.7 seconds, retaining the fifteen tamper cases, baseline requalification before each case, no-launch checks and original timeouts. Production qualification was unchanged.
