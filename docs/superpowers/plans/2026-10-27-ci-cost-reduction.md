# Reduce CI minutes and cost

Goal: perform less work per PR while retaining focused checks of streaming and
all supported .NET framework/provider/model API combinations.

- Accelerate ordinary workbench fixture chunks; retain recording and dedicated
  streaming pacing. Hold initial provisional output until browser assertions
  release it, rather than relying on machine speed or a fixed sleep.
- Cache deterministic website generation, lint, unit tests, typechecks and
  builds. Restore generated reference and LLM files. Give workbench checks
  explicit source inputs so unrelated site content does not invalidate them.
  Keep recording and live-provider verification uncached.
- Determine expensive setup from the complete affected Nx task graph, including
  dependencies. Provision PostgreSQL only for .NET. Provision Chromium only for
  browser suites; test launch before falling back to OS package installation.
  Skip deployment target selection on PRs without the preview label.
- Run eight essential .NET browser flows across all eight supported combinations
  in PR/main checks (64 cases). Keep detailed HTTP contracts and the full browser
  matrix, with the full matrix running nightly. Dispose test-owned hosts
  immediately; explicit lifecycle/recovery assertions still control their stop.
- Cache deterministic .NET checks and binaries, but always restore NuGet assets
  locally to avoid caching machine-specific paths. Each conformance project owns
  its TypeScript build and lint checks.

Validation: failing regression tests before implementation; build, test and lint
for www, conformance and dotnet-conformance; all workbench browser assertions;
.NET browser smoke against real SDK and PostgreSQL; cache reuse/invalidation;
workflow YAML and embedded shell syntax checks; independent source review.
