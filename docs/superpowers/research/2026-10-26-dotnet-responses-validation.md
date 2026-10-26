# .NET Responses migration evidence

## Scope and baseline

Work branch: `blove/dotnet-responses`, based on main `5f1aa664`.
Design and plan received independent review and approval after tightening server-owned compatibility identity, pre-adapter-loss detection and paired native call/output history assertions.

The unchanged baseline `npx nx build dotnet-conformance` passed with .NET SDK 10.0.402. Existing Nx/Vite deprecation and config-loader notices remain. Log: `/tmp/hashbrown-dotnet-responses-baseline.log`.

## Exact dependency investigation

Microsoft.Extensions.AI.OpenAI 10.10.1 declares source commit `59e1741f6fb45cf7ae08e2df088aef71537a7bc4` in its installed nuspec. The exact source for `OpenAIResponsesChatClient` was inspected from:

https://github.com/dotnet/extensions/blob/59e1741f6fb45cf7ae08e2df088aef71537a7bc4/src/Libraries/Microsoft.Extensions.AI.OpenAI/OpenAIResponsesChatClient.cs

The pinned adapter exposes `AsIChatClient(ResponsesClient, model)` and preserves original streaming updates in `ChatResponseUpdate.RawRepresentation`. Its conversion populates provider conversation IDs unless stored output is explicitly disabled. Native response IDs and message/item IDs are distinct, unlike the Chat Completions assumptions in the existing strict raw-event recovery equivalence checks. These are investigation findings, not evidence that migrated recovery works.

Microsoft's documented Azure migration uses the OpenAI .NET Responses client and Azure's `/openai/v1/` endpoint:

https://github.com/Azure-Samples/azure-openai-to-responses-csharp

## Test-first contract evidence

The initial six HTTP cases failed semantically against the unchanged implementation: native requests used Chat Completions routes, storage was not explicitly disabled and an unknown API selector reached the model. Log: `/tmp/responses-red.log`.

## Verified source results

| Check                                                                             | Result                                                                                                |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Native provider schema/continuation contracts and stable routing                  | 15 focused tests passed before subsequent regressions                                                 |
| Server configuration identity, true schema-2 migration and old comparator fencing | 19 focused tests passed                                                                               |
| Final .NET regression suite                                                       | 178 tests / 18 suites passed; C# build and format verification passed with zero warnings/errors       |
| Source browser matrix                                                             | 360/360 passed, 45 in each of eight API/framework/provider projects, zero skipped/flaky/retried cases |
| Cold diagnostic browser cases                                                     | 24/24 passed, three per project                                                                       |
| Exact C# recipe combinations                                                      | 16/16 compiled for both APIs, memory/PostgreSQL, confirmation and recovery                            |
| Conformance infrastructure                                                        | Build, lint and 72 tests passed; new non-null assertion warnings were removed                         |
| Both runtime hosts                                                                | Builds and lint passed                                                                                |
| Docs site                                                                         | Build, lint, route report and 1,005 tests passed after main resync                                    |
| Rendered .NET code                                                                | Both routes: four C# blocks with 5–7 token colors and one XML block with four colors                  |

Original 43 browser scenarios per framework/provider remain intact. Two native-wire regressions add exact tool declarations on every turn and original call/output/history checks after recovery and a later turn. Both APIs use the same scenarios, current deadlines and zero retries.

The source report is in `/private/tmp/hashbrown-dotnet-responses-kol8loex/source-browser-results.json`; its original HTML report is retained alongside it. Original native model requests are captured before aimock normalization. Source runtime inputs remained unchanged when unrelated main docs/growth changes were merged; only test warning cleanup and documentation changed afterward.

## Native capture and tool declaration corrections

Independent review required successful native completion per streaming request, including empty and truncated streams. Real HTTP SSE tests traverse the pinned native Responses client, MEAI, MAF, PostgreSQL capture and worker restart for both providers. Eleven scenarios per provider include plain/server-tool success, reasoning/encrypted/hosted/annotation output becoming unavailable, and failed/incomplete/completed-incomplete/empty/truncated streams that cannot report native success. Focused SDK probes separately cover bounded concurrent request evidence and precise response/message/function identity witnesses.

Actual native output exposed first-text deltas in `TEXT_MESSAGE_START` raw diagnostics and null parent/message fields on function events. Capture accepts these only through exact witnessed native identities, deferred first-content equality and exact function name/call ID/JSON arguments; unknown or contradictory data still fails closed. No AG-UI SSE is fabricated or rewritten.

Browser parity also exposed MAF replacing previous browser tool schemas with empty placeholders. The request-local repair recreates current browser declarations as non-invocable metadata while retaining registered server handlers. Four native HTTP tests first failed semantically, then passed for both APIs/providers. Browser tests assert complete original declarations on every native turn.

## PostgreSQL readiness evidence

The previous Unix-socket readiness probe could accept postgres:18's temporary initialization server before TCP availability. A test failed during Npgsql connection setup before assertions; an unchanged rerun passed. Inspection of the actual image entrypoint confirmed `listen_addresses=''` during initialization. The fixture now requires `pg_isready --host 127.0.0.1`; no readiness budget, assertion or retry policy was expanded.

## Published SDK and live qualification status

A fresh isolated consumer installs all ten official npm SDKs at 0.8.2. Workspace SDK sources and aliases are removed and cache restoration is disabled. Independent tarball integrity/manifests, supported imports, public API type checks, immutable diagnostics, strict defaults and inert restoration passed. The complete 360-case registry consumer matrix is in progress; final bundle origins, lockfile integrity and case counts remain to be recorded before merge.

Small bounded live HTTP preflights returned successful `gpt-4.1-mini` Responses from OpenAI and Azure using application API keys. The refreshed Azure CLI identity also succeeded with the Responses `https://ai.azure.com/.default` scope. These preflights establish account/model access and ordinary native output shapes, not full .NET/browser or managed-identity qualification. Credential values are not recorded here. Entra/managed-identity integration and full live qualification remain the next independent workstream.

No new SDK publication or Hashbrown NuGet package is part of this migration. Final PR, merge and deployed documentation evidence remain pending.
