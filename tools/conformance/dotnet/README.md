# .NET provider conformance

Internal test infrastructure for the documented AG-UI integration. The actual
ASP.NET Core endpoint, Microsoft Agent Framework, AG-UI serializer, and native
OpenAI/Azure clients run both Responses and Chat Completions against strict aimock fixtures. Both React and Angular
consume the endpoint's real SSE stream. Model API requests are captured before
aimock normalization, with credentials reduced to their authentication type.

## Prerequisites and commands

Install the exact SDK from `global.json`, run the repository's `npm ci`, and put
`dotnet` on PATH. An isolated SDK can instead be selected with `DOTNET_HOST_PATH`
for the process harness; the Nx build still resolves `dotnet` from PATH.

```sh
npx nx build dotnet-conformance
npx nx test dotnet-conformance
npx nx lint dotnet-conformance
npx nx provider-e2e dotnet-conformance
npx nx check-docs dotnet-conformance
```

The build restores with `--locked-mode`. Only deliberate dependency updates use
`npx nx restore-lock dotnet-conformance`, followed by review of `packages.lock.json`.
The default targets need no live model credentials or account. OpenAI uses a public model name;
Azure uses a separate deployment name: Chat Completions retains its native deployment URL/API-key wire, while Responses uses the native OpenAI-compatible `/openai/v1/` route and client authentication.

Durable tests require real PostgreSQL 18. Without `DOTNET_TEST_POSTGRES`, the
harness starts one owned disposable Docker container on a dynamic loopback port,
waits for readiness, and removes it on success or failure. CI supplies the
PostgreSQL 18 service through `DOTNET_TEST_POSTGRES`; local runs can also supply an
explicit test connection string. Every cluster creates and drops only its own
random `durable_` schema. The database identity needs schema/table creation and
cleanup permissions. These tests do not silently skip when PostgreSQL is missing.
The service password in CI is a fixture-only credential.

The browser matrix defaults to ports 4431 (Angular) and 4432 (React); override them with `RUNTIME_SMOKE_ANGULAR_PORT` / `RUNTIME_SMOKE_REACT_PORT`. When using different origins, supply the matching comma-separated `FixtureOrigins` to the fixture workers. The native model
fixture, capture proxy, and .NET server use dynamic loopback ports. Reports and
traces are under `test-results/conformance/dotnet` and
`playwright-report/conformance/dotnet`. Failed fixtures preserve bounded process
logs and native model request evidence under the test-results diagnostics folder.

## Native Azure authentication

`ProviderFactory` accepts trusted `AzureAuthentication=api-key|azure-cli|managed-identity`.
The default remains API key; token modes require HTTPS and do not require a key. CLI uses only
`AzureCliCredential` with a ten-second process timeout. Managed identity uses only
the selected system-assigned identity or `ManagedIdentityClientId`. Unknown/mismatched
configuration fails before credential construction, and credential failure never
falls back to a key. The explicitly pinned Azure.Core 1.63.0 supplies Azure.Identity
credential classes and the native System.ClientModel token bridge.

Native probes exercise actual SDK requests through a test-only logical-HTTPS
transport, including scopes, bearer headers, schema/tool history, same-client token
reacquisition and cancellation. Responses cancels acquisition with its caller. The
legacy Azure client shares refresh work: a cancelled or pre-cancelled caller can
still acquire a token, then stops without model HTTP. Its shared acquisition is not
caller-preemptible; tests explicitly release/drain it. No detached timeout wrapper
changes this contract. Credential/auth mode changes do not alter checkpoint identity.

Cloud managed identity qualification remains an explicitly deferred follow-up.
Deterministic selection and local CLI authentication do not prove deployed identity
assignment or resource permissions. Live OpenAI/Azure qualification uses a separate
opt-in target and published npm clients; default aimock tests remain deterministic.

## Reference source

`Integration/` contains the recipe's reusable C# source. `Testing/`, `Program.cs`,
and the TypeScript harness are test infrastructure. Never copy the fixture's
header-based test identities, test controls, or localhost model setup into an
application. Applications supply authentication, authorization, tool permissions,
model configuration, and their own server-owned workflow checkpoint selector.

`HashbrownRequestClient` enables strict native JSON schema output and fails a
single model turn combining browser and server tool calls before server effects.
Sequential mixed workflows use the upstream agent pipeline. `InterruptWorkflowClient`
handles explicit application confirmation; it does not claim automatic native
MAF approval-tool compatibility. The native interrupt serializer registration is
required by the pinned hosting baseline.

`IInterruptStore` binds a full confirmation batch to principal, thread,
conversation/tool/schema fingerprint, versioned operation, server-owned JSON
parameters, and expiry. Both stores require a `WorkflowOperationRegistry`;
registry versions retain their meaning across deployments and incompatible
persisted parameters fail closed. `PendingInterruptStore` is an explicit
single-process development option. `PostgresInterruptStore` persists claims and
fenced dispatch markers; call `InitializeAsync` before accepting requests and keep
the pooled `NpgsqlDataSource` alive for the host lifetime. All replicas require the
same authoritative database, compatible registry, and stable authenticated scope
(including ordinary shared cookie keys/session configuration where applicable).

Approval defaults to ten minutes, pure preparation leases to thirty seconds, and
terminal retention to ten minutes, with capacity 128 including retained batches.
The database clock controls durable deadlines. Expired preparation loses claim
authority; a fresh admitted claim can recover pre-effect work. No database
transaction spans preparation, effect execution, model calls, or streaming.

The guarantee is at most one registered executor dispatch per batch. The marker
commits before invocation, so a crash can produce zero effects or an unknown
outcome after execution. Neither outcome is automatically replayed. Stable
`effectId` supports application-specific downstream idempotency; it does not
provide exactly-once external effects by itself. Stranded markers are retained,
can occupy capacity, and need authorized terminal reconciliation. The opt-in
operator API records bounded external evidence and never supplies a retry queue. PostgreSQL must retain
acknowledged commits; backup rollback, unsafe failover, or administrative edits
can invalidate the guarantee.

The browser matrix preserves all 172 Chat Completions cases from SDK 0.8.2 and adds the same scenarios for Responses plus native-history regressions, including live-browser
restart and competing-instance confirmation scenarios across React/Angular and
OpenAI/Azure. Durable HTTP coverage additionally exercises process death,
preparation lease takeover, stale workers, committed-marker and completed-effect
crash windows, malformed input, expiry, and database/registry failures. Effect
observations are stored in PostgreSQL, rather than inferred from process-local
counters.

Recovery adds actual reload/restart, fresh local approval ownership, exact resumed
native configuration/system IDs, acknowledged pre-effect failure and lease refresh,
two-tab claim competition, authenticated scope isolation, delayed lookup guards,
completed/unavailable answers, historical browser-tool inertness, trusted structured
history and protected operator reconciliation across all four framework/provider
combinations. Native model calls and durable effects are asserted independently.
Deterministic server barriers cover claim/dispatch/capture windows; no guessed
sleep establishes dispatch or owner quiescence. The default native host does not
acknowledge a run before blocked pure preparation produces its first update. Its
unacknowledged pre-effect restart/lease path remains covered. The acknowledged
pre-effect crash test opts into a fixture-only, visible "Preparing server action."
ChatResponseUpdate on accepted resumes, once per request, before invoking the real
workflow. Native hosting emits its own actual lifecycle and text events; no SSE or
RUN_STARTED is synthesized. The prelude performs no model/effect work and never runs
on initial pending requests, so original fingerprint authority is unchanged.

`POST /threads/{threadId}/recovery` requires the configured ordinary-user policy and
a server-owned authenticated scope resolver. It consumes the direct public
`getRecoveryConfiguration()` value and returns a no-store versioned envelope.
Browser fixtures opt in with `recoveryUrl`, keep only the thread selector in their
endpoint/scenario-scoped URL, and explicitly refresh. A revision CAS and synchronous
selector/request-generation guards retire stale responses. Restoration receives the
server snapshot directly; it never replays SSE, tools, approvals, or a model run.
Busy/unknown/ambiguous/unrestorable states disable sends and decisions separately
from the assistant transcript. Unknown envelope versions/dispositions fail closed.

`GET /checkpoints`, `GET /checkpoints/{batchId}`, and
`POST /checkpoints/{batchId}/reconcile` require a separate operator policy,
server-owned permitted scopes and authenticated actor. Reconciliation accepts only
EffectStarted/FailedAfterEffect with expected state/generation/revision, bounded
reason/evidence and external-quiescence acknowledgement. It records a terminal
observation and immutable audit without re-executing or reopening work. CAS cannot
revoke execution permission already issued: independently establish owner quiescence
and downstream evidence before claiming non-performance; Unresolved is legitimate.
Fixture authentication exercises ASP.NET authentication and policies with fixed test
credentials. Never publish those credentials or copy Testing into an application.

Recovery persists checkpoint-associated original native serialization and bounded
canonical final history only, not general chat sessions. Defaults: original/query
256 KiB, terminal history 1 MiB, 2,048 messages, ten-minute snapshot retention from
checkpoint creation, independent ordinary terminal metadata retention and thirty-day
audit retention from each audit's recorded time. Stored history/state can be private;
apply database access controls and deliberate retention. Purging private bytes never
reopens a consumed ID or silently evicts unresolved dispatch markers. Schema 1/2-to-3 migration preserves legacy rows and fingerprints without inventing a server compatibility identity or missing history; future versions fail closed.

Final capture supports canonical text and server-tool history with strictly
equivalent redundant upstream diagnostics. Meaningful unknown raw/reasoning/
annotation/continuation extras, incomplete rounds and replacement snapshots during
an open fold yield unavailable terminal history. Disconnect, byte limits or storage
failure can also lose the final answer independently of effect completion. There is
no general AG-UI event replay/parity guarantee. CompletedAnswerUnavailable displays
status without inventing assistant text or repeating the effect.

The exact four C# blocks in both framework recipes are compared and compiled in all
sixteen Responses/Chat Completions × memory/PostgreSQL × confirmation/no-confirmation × optional recovery mapping
combinations by `check-docs`, using the actual Integration source and locked packages
without a database. Checked insertion targets reject drift instead of compiling an
unintended combination.

## Tested dependency baseline

| Dependency                                  | Version                 |
| ------------------------------------------- | ----------------------- |
| .NET SDK                                    | 10.0.402                |
| Microsoft.Agents.AI.Hosting.AGUI.AspNetCore | 1.26.0-preview.261023.1 |
| Microsoft.Agents.AI                         | 1.26.0                  |
| AGUI.Abstractions / AGUI.Server             | 1.0.1                   |
| Microsoft.Extensions.AI.OpenAI              | 10.10.1                 |
| OpenAI                                      | 2.14.0                  |
| Azure.AI.OpenAI                             | 2.1.0                   |
| Azure.Core                                  | 1.63.0                  |
| Npgsql                                      | 10.0.3                  |
| PostgreSQL executable reference             | 18                      |

Responses is the recommended new-application path. Trusted `ModelApi=responses|chat-completions` selects the native client; omission in `ProviderFactory` preserves Chat Completions compatibility. Both providers use the pinned OpenAI Responses client and MEAI adapter. Responses runs explicitly disable storage, conversation IDs, continuation tokens and background mode; all canonical input and tool-call/output pairs remain application-owned.

Set `InterruptStoreOptions.CompatibilityIdentity` from `ServerConfigurationIdentity.Create(configuration)` as both recipes show. Checkpoints bind the trusted API, provider, effective endpoint and model/deployment, separately from browser configuration. Credential rotation does not alter the hash. Endpoints with user information, query or fragment are rejected. Both recovery and direct resume reject mismatches before effect/model work, including when retained original history is gone. Null identities remain explicit legacy/unbound data and are never reassigned to Responses.

**Stop and drain all older workers before migrating to schema 3.** Overlapping mixed-version rolling operation is unsupported. Older binaries cannot start afterward; already-running older workers can still read new rows without identity checks, write legacy rows or use previously issued claims. Bound fingerprints fence their old admission validator from new rows, but cannot retrofit a running process. Identity-bound stores reject unbound legacy recovery/resume with 409; protected inspection/reconciliation remains available. Plan pending approvals and unknown effects before upgrading rather than backfilling browser-selected identities or replaying work.

The default compatibility guarantee comes from deterministic suites. The separate opt-in runner below qualifies a bounded six-project live baseline when its preflights and all 42 groups succeed; deterministic aimock coverage alone is not live OpenAI/Azure service qualification. Older .NET runtimes, native MAF approval, provider-hosted tools, reasoning/continuation recovery, activities, shared chat-session persistence and provider finish-reason metadata remain outside this guarantee. Hashbrown's existing Node providers keep their own behavior and tests.

## Opt-in published-client live qualification

The live runner is separate from deterministic CI. List the six projects and 42
scenario groups without credentials, builds, native processes, or model calls:

```sh
npx nx live-provider-e2e dotnet-conformance --list
```

Build the current native fixture, then explicitly opt in to real model traffic.
The authorized env file supplies `OPENAI_API_KEY`, `AZURE_API_KEY`,
`AZURE_ENDPOINT`, and optional `AZURE_MODEL=gpt-4.1-mini`. Azure CLI mode uses the
existing CLI account and receives no API key. The runner never logs in, provisions
resources, changes roles, or selects an account.

```sh
npx nx build dotnet-conformance
HASHBROWN_LIVE_OPT_IN=1 npx nx live-provider-e2e dotnet-conformance --credentials /absolute/path/to/authorized.env
```

The runner prepares a fresh standalone consumer using the published React,
Angular, and core packages pinned to 0.8.3. To reuse an already prepared consumer,
pass `--consumer-metadata /absolute/path/to/consumer-metadata.json`; every source,
template, bundle, installed package, and resolved module origin is revalidated
without rewriting the trusted baseline. Provider credentials are excluded from
consumer builds, Playwright workers, Chromium, browser URLs, and bundles.

The fixed matrix uses React/Angular with OpenAI Responses key, Azure Responses key,
and Azure Responses CLI authentication. Its seven groups cover native streaming,
structured schema, trusted UI/action, browser and server tools, approval recovery
and decline, and real native iterator cancellation followed by a fresh thread.
Three native preflights also check OpenAI Responses, Azure Responses, and Azure CLI
Chat Completions with its separate cognitive-services audience. Managed identity
on an actual Azure host remains an explicitly deferred qualification.

One worker, zero retries, fixed per-group ceilings, a 384-token native wire cap,
60-second scenario deadlines, and a 15-minute run deadline bound execution. Owned
native process groups are terminated on abort. Cancellation evidence concerns the
actual native iterator and HTTP lifetime; it does not establish when a provider
stops compute or billing. Legacy Azure shared credential refresh retains the
native cancellation limitation documented in the identity tests.

The runner persists only projected metadata through one 2 MiB run-level JSONL
sink in its fresh `hashbrown-live-run-*` temporary directory. Raw child output and
errors are discarded. Playwright traces, screenshots, video, and page snapshots
are disabled; test failures are replaced before Playwright's artifact recorder
runs. The deterministic tests include an actual forced Playwright failure with
secret canaries in assertion/error/cause, DOM, and split child output, then inspect
all output artifacts. Unknown runner/Playwright overrides are rejected, and
missing prerequisites fail qualification without a passing skip or automatic retry.
Success requires 42 distinct passed outcomes matched to valid native wire/effect
evidence and all three successful preflights. Missing, skipped, duplicate, failed,
or unpersisted evidence fails the run. The final result reports `plannedCases`,
`actualPassedCases`, `successfulPreflights`, `reportDirectory`,
`verifiedMetadataPath`, and `provenancePath`; the planned count alone never
establishes successful qualification.
