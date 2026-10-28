# .NET NuGet packaging and external-consumer acceptance

## Outcome and authorization

Extract the tested .NET integration into a real compiled NuGet library and prove that applications can restore, build, and run the packed artifact without workspace implementation access. The user authorized brainstorming, specification, independent review, implementation using subagents, PR, merge on green, and verification without intermediate permission requests unless input is necessary. This document supplies the design for that autonomous workflow. The user explicitly approved reuse of the existing pinned dependencies under AGENTS.md on 2026-10-27; additional third-party dependencies require separate approval.

This milestone produces and qualifies a release-ready local `.nupkg` and symbol artifact. It does not push an initial version to NuGet.org or claim public-registry availability. Registry ownership, publication credentials and the initial public release remain separate work. Existing npm packages are consumed unchanged.

## Alternatives and selected architecture

1. **One compiled ASP.NET package (selected):** least extraction risk; carries the complete existing provider/store dependencies. Consumers get one coherent tested composition.
2. **Core, ASP.NET, PostgreSQL, and provider packages:** smaller optional dependency footprints but several new version/public-visibility boundaries. Defer until consumer requirements justify that work.
3. **Source/contentFiles package:** retains copied implementation ownership and does not establish assembly/API consumption. Reject.

Create `packages/dotnet/Hashbrown.AspNetCore.csproj` with Nx project `dotnet-sdk`, namespace and assembly `Hashbrown.AspNetCore`, target `net10.0`, initial independent version `0.1.0-preview.1`, MIT license and repository metadata. The preview reflects the existing upstream preview/experimental API dependence; it is not an npm version update. Use the regular .NET SDK with `Microsoft.AspNetCore.App` framework reference and explicit usings. Generate reference assembly, XML documentation and symbols; use SDK-supported package validation without new tooling dependencies. Include README/license and repository revision. Package runtime output must exclude Program, Testing, fixture identities/control endpoints, executable configuration, test credentials and implementation source contentFiles.

Move the complete reusable Integration source into `packages/dotnet/src/`, then make the conformance executable reference the library. There must be one maintained implementation. Keep existing class names and the current public contract closure for the initial preview; distinguish application-facing composition APIs from the low-level store SPI in documentation. Preserve internal implementation visibility. Do not expose private observation APIs or add friend access to make package acceptance pass; test-only hosts can retain narrowly reviewed reflection for existing white-box instrumentation, while the documented application consumer uses public APIs only.

Audit the public surface explicitly, emit a checked API baseline from the built artifact, and reject unreviewed additions/removals or conformance/test namespace leakage. Public XML documentation must accompany the shipped API. Parameter names, optional defaults, enum values and generic signatures belong to the baseline; do not treat a type-name list as a complete API check.

## Dependencies and compatibility

Under that approval, reuse only the nine existing direct dependency packages and versions from the conformance project. No new third-party package is required. The actual Azure.Core 1.63.0 artifact includes the Azure.Identity credential types used by this integration; do not introduce a historically separate package based on outdated assumptions. Use explicit exact dependency constraints for this preview-sensitive tested baseline, inspect the resulting nuspec, and verify the restored consumer closure. Do not assume the producer lockfile constrains downstream restores.

Keep SDK 10.0.402 and reproducible lockfiles. Do not place the .NET library in npm release/publish groups. Add Nx build/test/lint/pack/API-check targets with dependencies and inputs that select .NET conformance whenever package source or packaging metadata changes.

The extraction changes assembly/namespace ownership, not protocol semantics. Preserve workflow schema 3, native journal schema 2, public recovery schema 1, compatibility hashes and canonical request identity. Package version must not replace durable schema/configuration identity. Preserve caller/agent/store partition binding, atomic whole decisions, consumed/dispatch fences, private projection, publication barriers, quiescence requirements and bounded maintenance. Namespace changes must not invalidate retained native histories silently. Include a migration/upgrade acceptance check using real persisted records from the pre-extraction source host and the new package host. Old binaries are archived with SHA-256 before extraction; they are compatibility fixtures only and never qualify as the candidate implementation.

Make that baseline portable to fresh CI: extract the old host's allowlisted source/project/lock/SDK/configuration from immutable Git revision `8f0a710a75cb907c1a07e34eb5527b1834da90ed`, check a committed source-hash manifest, and compile it in its own temporary ancestry with the original locked dependencies. Full Git history is available in the current CI checkout. Do not rely on the local archived binaries being present in CI, commit a second maintained implementation, or silently substitute HEAD for the fixed revision. Candidate consumers and restarts still resolve exclusively through the qualified package descriptor. The old control host is explicitly separate historical test infrastructure.

Unchanged limits: pending mixed browser work cannot cold restore; no automatic effect retry or exactly-once external-effect claim; old workers must drain before incompatible schema changes. No reasoning-model, hosted-tool, additional target-framework, managed-identity cloud, authentication-system or release-safeguards expansion.

## Actual package consumer

Introduce a bounded prepare/qualify runner using Node built-ins and the existing .NET SDK. It packs the exact candidate once into an owned local feed, records archive identity/hash, and creates an application outside repository ancestry. It supplies its own global.json, NuGet config, csproj, package lock, isolated package/HTTP caches and controlled environment. Candidate package source mapping is exclusive to the local feed; upstream dependencies use the approved upstream source or an explicitly staged feed. No candidate ID overlaps an upstream wildcard mapping. Shared caches may seed third-party downloads only with hash verification; they may never satisfy the candidate package.

The application references the exact candidate through PackageReference only. No ProjectReference, source-copy Integration, direct assembly HintPath, inherited Directory.Build imports or workspace runtime fallback is allowed. Inspect evaluated compile/project-reference/import inputs, assets.json, deps.json, package source metadata, dependency versions and package runtime assets. Record the actual loaded implementation assembly path, identity and SHA-256; copied-to-output assemblies must hash-match the extracted candidate package asset. A runtime output path is expected and does not itself imply workspace fallback.

Qualify before and after execution without rewriting trusted metadata. Every worker and restart must use the same validated host descriptor. Package mode with missing/invalid descriptor must fail before spawn; it must never select the source dist DLL. Explicit source mode remains available for white-box tests. Application test fixtures may be copied from an allowlist to compose deterministic auth/tools/gates around the packaged implementation; they may not supply an alternate implementation. Keep a separate public-API application smoke consumer without internal reflection or fixture registrations.

Negative tests must fail before providers/browser/effects for: missing/wrong candidate despite a global-cache sentinel; modified archives, metadata, lock or DLL; overlapping mappings/fallback sources; ProjectReference/Compile/HintPath/import injections; symlink/path escapes; stale assets; modified consumer after qualification; missing descriptor and restart fallback. Include a real missing-feed/empty-candidate-cache restore failure, not only mocked validation tests.

## Acceptance coverage

Reuse existing scenario bodies and their exact identity sets; do not duplicate 664 test implementations. Run all eight React/Angular × OpenAI/Azure × Responses/Chat Completions projects against the external package host, real ASP.NET, MAF, PostgreSQL and strict aimock. Static browser hosts use the existing physically prepared published npm consumer, qualified before and after the run. Require all 664 existing identities, zero retries, skips, flaky outcomes or unexpected diagnostics; retain exact baseline identity comparison. Source-host results do not substitute for package-host results.

Run the six genuine fast/delayed/hung native approval browser regressions against a package-reference probe built once per gate. Keep the real 31s/5s/5s valid sequence, 55-second caller cancellation, one SDK call and zero effects for hung acquisition, framing/held-EOF guards, native result/history/usage assertions, and bounded drain. Do not relax test or model budgets.

Compile the exact React/Angular documentation examples through PackageReference consumers rather than copied Integration. Preserve the existing 32-program matrix and framework-parity checks; generated consumers must rely on the library nuspec for its dependencies rather than restating all transitive packages to conceal omissions. Keep ordinary unit/protocol/durability tests and their negative/concurrency/migration coverage. The actual old-to-package upgrade check must cover persisted workflow pending confirmation (schema 3), genuine native-only pending approval (native schema 2), and completed native history. Terminate/drain the old process before the packaged worker starts. Prove both lookup endpoints perform zero model, executor or browser work and preserve durable IDs and database lease/generation. Fresh local UI ownership belongs to the SDK restore guard. An explicit current-snapshot approval acquires fresh backend ownership and executes once; completed history stays inert. Preserve original configuration/catalog/scope and test rejection of changed bindings. This is a stopped-worker upgrade proof, not a mixed-version rolling-operation guarantee.

No fresh live-provider matrix is required for pure packaging/namespace changes when deterministic package acceptance, preserved semantics and qualified dependency closure are proven. Existing 54-case live evidence remains historical source-integration evidence; it is never relabelled a live NuGet qualification. A material runtime behavior change requires impact review and appropriately renewed qualification.

## CI and docs

Use one freshly packed candidate and one external consumer/npm preparation per gate. Run artifact acceptance uncached. Replace the CI source-host provider gate with the complete package-host matrix after preserving the same identities, instead of adding another full serial matrix. Source semantic tests remain. The six regression cases consume that same candidate. Separate bounded jobs if needed rather than exceed the existing measured 75-minute validation budget. PRGate must depend on required package acceptance; invalid or absent artifacts cannot produce a skipped-green gate. Include all relevant lockfiles in setup cache inputs and upload bounded provenance/diagnostics on failure without credentials.

Update both framework recipes, README, install/namespace/upgrade instructions and compiler verifiers together. Replace stale milestone-pending notes with accurate evidence and distinguish local candidate qualification from public NuGet availability. Explain the preview pin, .NET 10 requirement, PostgreSQL/auth ownership and preserved recovery limits. Keep C#/XML rendering checks on all four production routes.

## Completion gates

- Independent spec and plan approval; explicit dependency reuse approval before dependency edits.
- Public API and package-content/metadata checks pass; no fixture implementation leaks.
- Failing isolation/consumer tests recorded before fixes; build/test/lint for affected projects pass.
- Actual external PackageReference restore/build/runtime provenance and real no-fallback negative pass.
- Exact 664 package-host browser identities, six genuine regressions and 32 packaged documentation programs pass.
- Real pre-extraction to packaged durable-session compatibility passes with zero replay during recovery.
- Independent implementation spec/quality review; PR attached; up-to-date required CI green; ordinary merge.
- Merged tree verified, merge's main CI green, production docs content/highlighting verified.
- Only task-owned disposable installs/feeds/processes/databases cleaned after evidence preservation; public NuGet publication status stated explicitly.
