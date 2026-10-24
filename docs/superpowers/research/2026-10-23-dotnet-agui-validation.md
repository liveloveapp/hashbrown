# .NET AG-UI implementation and validation

The approved approach is a tested source recipe using Microsoft's upstream AG-UI integration and native OpenAI/Azure clients. Hashbrown does not need a second provider SDK or a Node bridge to serve .NET applications.

Implementation lives in `tools/conformance/dotnet/`; application recipes are `www/content/docs/{react,angular}/platform/dotnet.md`. The dependency baseline is SDK 10.0.402, MAF 1.26.0, hosting 1.26.0-preview.261023.1, AG-UI 1.0.1, MEAI OpenAI 10.10.1, OpenAI 2.14.0, and Azure.AI.OpenAI 2.1.0. The resolved graph is committed in the NuGet lockfile. The user approved these seven references before installation.

## Evidence

Local verification on October 23, 2026 uses actual ASP.NET processes, upstream event conversion, and native provider clients. Aimock replaces the model API only. The capture boundary preserves original URLs, bodies, and SSE bytes; it records authentication type rather than credential values. No live cloud credentials are required or exercised.

| Check                              | Result                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| Core build/test/lint               | Passed; 1,555 tests, 78 suites, 14 snapshots                                            |
| Parent conformance build/test/lint | Passed; 45 tests                                                                        |
| Native .NET HTTP contracts         | Passed; 34 tests, including both genuine provider clients                               |
| .NET browser matrix                | Passed; 100 cases, 25 each for React/OpenAI, React/Azure, Angular/OpenAI, Angular/Azure |
| React/Angular host builds and lint | Passed; hosts have no separate unit-test target                                         |
| Existing shared browser suites     | Passed; 72 cases, including 8 native-provider cases                                     |
| Docs build/test/lint               | Passed; 564 tests                                                                       |
| Docs route rendering               | Passed; 95/95 docs, 240/240 API routes, 467 rendered pages with share images            |
| Independent implementation review  | Material findings fixed and reviewed again                                              |

Native OpenAI requests use `/v1/chat/completions` and bearer authentication with `fixture-openai-model`. Azure uses `/openai/deployments/fixture-azure-deployment/chat/completions?api-version=…` and API-key authentication. This verifies the genuine Azure route and deployment semantics, rather than relabeling an OpenAI request.

The schema bridge sets native strict JSON schema output per request and preserves tools. This follows the [official OpenAI structured-output contract](https://developers.openai.com/api/docs/guides/structured-outputs); streaming JSON still goes through Hashbrown's existing incremental parser.

## Gaps found and disposition

- **Native interrupt serialization:** the pinned hosting baseline needs explicit upstream `RegisterInterruptContentTypes` registration. The recipe and tests include it.
- **Strict schema configuration:** the MEAI adapter does not enable strict mode merely because a schema is supplied. The bridge enables it explicitly; tests compare the exact native schema and verify that a later text request does not inherit it.
- **Tool result identity:** the .NET converter can use a tool call's ID as its own result message ID. Hashbrown previously rejected that valid correlation. Core now permits this exact pair while preserving other collision checks, with regression tests.
- **Simultaneous mixed tool ownership:** a native model response combining browser and server calls is rejected before server functions execute. Separate model turns support both ownership orders and completed effects across an interrupt.
- **Generic confirmation versus native tool approval:** the supported gate captures a server-selected operation and its parameters, uses native generic interrupt content, and validates the original complete resume batch. This does not promise MAF `ApprovalRequiredAIFunction` compatibility. Server tools need their own authorization.
- **Checkpoint execution:** accepted batches atomically claim stored operations. Preparation must be free of protected effects. Cancellation before the effect boundary releases the claim; after the boundary it stays conservative. A native tool continuation cannot execute the checkpoint again. Active work survives expiration cleanup; consumed markers survive later batches until expiry. Capacity is 128 records and lifetime is ten minutes.
- **Upstream failure before start:** the adapter can emit one native `RUN_ERROR` without a preceding `RUN_STARTED` when it fails before starting a run. Contract checks allow that error shape, require a single terminal, and continue rejecting incomplete success streams.
- **UI validation:** unexposed names are omitted; invalid props remain in the declared streaming fallback. Tests assert that neither mounts the trusted component or its action. Valid trusted components render and their user action works.

The public scope is Chat Completions on .NET 10, API-key authentication, full client-owned transcripts, and process-local generic confirmation. Responses-backed .NET clients, Entra authentication, native automatic tool approval, durable/multi-instance recovery, activities, shared state, reasoning, and finish-reason metadata remain outside this initial guarantee.

## CI and local workflow

Affected selection was checked for child sources, core, React, Angular, both hosts, testing, SDK, NuGet/npm locks, recipes, and workflow changes. Every relevant case selects `dotnet-conformance`; an unrelated PostHog source change excludes it. Recipe changes select both `www` and `dotnet-conformance`.

The combined parent Playwright collector explicitly excludes the nested .NET specs. Its original glob otherwise discovered them under projects with no provider configuration; actual collection now lists the correct 72 shared cases, while the child retains its separate 100-case matrix.

CI conditionally installs the pinned SDK before generic affected checks and runs the new browser suite after existing conformance suites. It uploads native diagnostics, screenshots, and traces on failure. The workflow is configured and locally checked; no remote GitHub Actions run is claimed here.

The existing TypeScript hook excludes the C# formatter so unrelated TypeScript commits do not need .NET; parent conformance lint still checks the TypeScript harness. A C# hook invokes the .NET lint target. The target ignores ESLint-only forwarded arguments and depends on build/locked restore, so a clean checkout has its assets before formatting.

## Warnings and execution adjustments

The affected checks retain existing core unused-variable warnings, Nx executor/plugin deprecations, Vite configuration/chunk-size warnings, and API-report TSDoc/export warnings. The .NET build reports zero warnings/errors. No warning was suppressed and no dependency downgrade was ignored.

Local attempts to run separate Nx graphs concurrently produced shared core-output races and conflicting nested host lifetimes. Required builds now run in one task graph; provider browser suites run sequentially as configured in CI. Nx's local history may still label the earlier Angular compile as flaky. The final standalone checks are authoritative.

The implementation consolidates small provider/checkpoint records and the process/proxy/model harness into fewer files than the proposed file map. HTTP boundary regressions replace mocks of the C# internals. Commits group independently reviewable core, integration, and CI/docs changes; the original plan's per-step commit sequence was not retained.
