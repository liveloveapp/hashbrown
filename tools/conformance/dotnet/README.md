# .NET provider conformance

Internal test infrastructure for the documented AG-UI integration. The actual
ASP.NET Core endpoint, Microsoft Agent Framework, AG-UI serializer, and native
OpenAI/Azure clients run against strict aimock fixtures. Both React and Angular
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
No live model credentials or account are needed. OpenAI uses a public model name;
Azure uses a separate deployment name and its genuine deployment URL/API-key wire.

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

The browser matrix preserves all original 108 cases, including live-browser
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
reopens a consumed ID or silently evicts unresolved dispatch markers. Schema1-to2
migration keeps legacy rows safe but cannot fabricate their missing history; future
versions fail closed.

Final capture supports canonical text and server-tool history with strictly
equivalent redundant upstream diagnostics. Meaningful unknown raw/reasoning/
annotation/continuation extras, incomplete rounds and replacement snapshots during
an open fold yield unavailable terminal history. Disconnect, byte limits or storage
failure can also lose the final answer independently of effect completion. There is
no general AG-UI event replay/parity guarantee. CompletedAnswerUnavailable displays
status without inventing assistant text or repeating the effect.

The exact four C# blocks in both framework recipes are compared and compiled in all
eight memory/PostgreSQL × confirmation/no-confirmation × optional recovery mapping
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
| Npgsql                                      | 10.0.3                  |
| PostgreSQL executable reference             | 18                      |

The selected model wire is Chat Completions. Responses-backed .NET clients,
Entra authentication, older .NET runtimes, reasoning,
activities, shared chat-session state, and provider finish-reason metadata are not included in
this initial compatibility guarantee. Hashbrown's existing Node providers keep
their own behavior and tests.
