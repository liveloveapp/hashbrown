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
npx nx package-prepare dotnet-conformance --metadata=/private/tmp/hashbrown-nuget-candidate.json
npx nx check-docs dotnet-conformance --metadata=/private/tmp/hashbrown-nuget-candidate.json
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

## CI cost and browser coverage

PR and main validation use `npx nx package-pr-acceptance dotnet-conformance`.
This explicit PR profile prepares fresh NuGet and npm consumers, qualifies their
actual loaded identities, compiles all 32 documented programs, runs upgrade
checks, and verifies 64 essential browser cases across all eight
framework/provider/model API combinations. All six native approval browser
regressions and final consumer qualifications remain required. Reports identify
this profile as `pr`; it does not claim full-matrix acceptance.

`npx nx package-acceptance dotnet-conformance` retains the original complete
664-case browser matrix and runs nightly. HTTP contract tests retain detailed
protocol, ownership, recovery and durability regressions. The manual
`npx nx provider-smoke dotnet-conformance` target runs the same eight essential
source-host journeys per combination. Neither browser nor package acceptance
target caches its results.

Disposable HTTP fixture hosts are killed immediately during final cleanup;
tests that exercise lifecycle or recovery explicitly initiate their own stop.
NuGet restore always runs before cached builds so machine-specific assets are
resolved locally; compiled outputs and deterministic checks can be reused.

## Native mixed-tool sessions

The opt-in native composition is documented in the identical compiled
[React](../../../www/content/docs/react/platform/dotnet-native-tools.md) and
[Angular](../../../www/content/docs/angular/platform/dotnet-native-tools.md) recipes.
It requires authenticated caller scope, the complete versioned function catalog,
PostgreSQL ownership and `NativeSessionAgentFactory`/`NativeSessionEndpointConfiguration`
together. Native same-response browser/server calls retain MAF pending work while
empty MAF history filters preserve the SDK's full canonical transcript. Durable
`Started` dispatch markers and the terminal publication barrier prevent automatic
effect replay after ambiguity. Publication CAS cannot retract already-authorized
or in-flight terminal bytes; `Publishing` blocks another owner until finalization
or terminal retirement after independently verified publisher quiescence. Stop and
drain older workers before changing the native format or compatible catalog
versions; there is no rolling mixed-format guarantee. Genuine native
`ApprovalRequiredAIFunction` registration is supported through this complete
composition with an immutable matching `RequiresConfirmation` catalog identity.
Whole decision batches reserve atomically before native execution; decline and
cancel never dispatch their registered executor. Cancellation supplies native
false with `Cancelled by caller.` while retaining a distinct durable Cancelled
audit disposition. Consumed decisions cannot reopen after failure, even with zero
dispatch. This guarantees at most one owned dispatch, not exactly-once external
effects; uncertain effects need downstream evidence and terminal reconciliation.

`check-docs` preserves the original four stateless/application-confirmation C#
examples and all 16 combinations. The extended native verifier is configured for
OpenAI/Azure × Responses/Chat Completions × recovery off/on × native approvals
off/on: 16 native programs, retaining the original eight and adding eight protected
programs, for 32 intended actual compiler programs overall. Identical framework
blocks share those compilations; framework parity does not double the count.
Current compiler logs, rather than this matrix description, establish passes.
Both verifiers require an explicit anchored `--metadata` candidate pointer and compile
isolated PackageReference applications. They never pack independently or copy the
implementation. Each exact source variant is hashed and qualified against the immutable
candidate before and after compilation; the combined 32-program check restores the
identical project and dependency closure once in locked mode. They do not invoke providers. The native structural tests also
check framework parity, the single exact candidate pin and authenticated initialization.

Native recovery uses a complete trusted key, current configuration and server
revision. Native-only Pending approval snapshots restore with a fresh local batch
token and no lookup/restore model, executor or browser-handler work. An explicit
current decision is required to continue. Live mixed continuation can settle a
cancelled original browser sibling (handler count zero) and receive a fresh model
browser call (fresh ID, handler once); a fresh call is not automatic. Pending mixed
cold recovery returns Pending with `PendingMixedBrowserResult`, no snapshot and no
adoptable batch. Disable sends/decisions and expose an explicit new-thread action;
terminal operator retirement requires independent quiescence/evidence. Ordinary
pending browser results remain `NativePendingBrowserResults` without a snapshot.
Never invent results, drop calls or change registrations to evade that limit.
Completed genuine histories can restore without rerunning historical work.

Expiry uses DB time. Permanent selector, consumed-decision and invocation fences
survive private-byte purge and count toward capacity: 128 live/private payloads and
4096 selectors per agent/scope. Input/selector capacity known at admission rejects
before model work; native-output capacity may be discovered after a real model
request and rejects before excess capture, protected dispatch or publication,
without fence eviction or automatic retry. Native schema 2 migration requires
stopped/drained/quiescent schema1 workers; it preserves existing safety metadata
and is separate from workflow checkpoint schema3. Public recovery remains schema1.

Historical milestone-one qualification recorded 408 physical deterministic browser
results and 48 live results across eight groups, with 75 actual model calls and 99
reserved calls. Those results do not qualify milestone-two native approvals. The
Task7 source matrix has 664 actual result identities reported in its current
handoff. Published package qualification uses separate signature, payload and
physical bundle acceptance evidence. Published-package live qualification now has 54 actual passed cases, three preflights and 93 model/wire calls using NuGet `0.1.0-preview.1` and published npm `0.8.3`; see the [versioned qualification record](../../../docs/superpowers/research/2026-10-31-dotnet-public-live-qualification.md). The browser matrix uses Responses, with Azure CLI Chat Completions covered by one preflight.
Documentation compilation alone establishes no provider, browser or published-SDK
qualification; preserve each gate's raw evidence and do not substitute intended
counts for passing results.

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

`packages/dotnet/src/` contains the single maintained library implementation. `Testing/`, `Program.cs`,
and the TypeScript harness are test infrastructure. Never copy the fixture's
header-based test identities, test controls, or localhost model setup into an
application. Applications supply authentication, authorization, tool permissions,
model configuration, and their own server-owned workflow checkpoint selector.

In the stateless composition, `HashbrownRequestClient` enables strict native JSON
schema output and fails a single model turn combining browser and server tool calls
before server effects. Sequential mixed workflows use the upstream agent pipeline.
The [admitted native mode](#native-mixed-tool-sessions) supports same-response mixed
calls through its complete authenticated durable composition. `InterruptWorkflowClient`
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
combinations by `check-docs`, using the exact candidate PackageReference and locked package closure
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

The default compatibility guarantee comes from deterministic suites. The separate opt-in runner below qualifies a bounded six-project live baseline when its preflights and all 54 scenarios succeed; deterministic aimock coverage alone is not live OpenAI/Azure service qualification. The historical source-integration qualification on 2026-10-27 passed all 54 cases and three preflights on the frozen published 0.8.3 consumer with gpt-4.1-mini, using 93 actual calls without retries. All six native MAF approval cases completed their three phases with 18 complete native usage calls and six matched protected effects; overall usage completeness remains unknown for legacy cancellation. This bounded service result does not broaden the deterministic compatibility contract. Older .NET runtimes, provider-hosted tools, reasoning-model continuation state, activities, arbitrary agent/session-store compositions and provider finish-reason metadata remain outside this guarantee. Hashbrown's existing Node providers keep their own behavior and tests.

## Provider-free native approval browser regression

The local regression runs the same native approval scenario as live qualification
against genuine MAF, PostgreSQL and the pinned native SDK with an in-memory HTTP
transport. It requires the existing fixture database, an explicitly prepared
NuGet candidate and a prepared published npm consumer. CI runs it without model credentials or provider opt-in.

```sh
npx nx package-prepare dotnet-conformance --metadata=/private/tmp/hashbrown-nuget-candidate.json --output-style=static
npx nx prepare-live-consumer dotnet-conformance --output-style=static
HASHBROWN_LOCAL_NATIVE_CONSUMER_METADATA=/absolute/path/from/prepare/consumer-metadata.json npx nx local-native-approval-browser dotnet-conformance --metadata=/private/tmp/hashbrown-nuget-candidate.json --output-style=static
```

Both frameworks complete all three phases while the HTTP connection remains open
after each valid terminal event. Partial, truncated and error terminals are
rejected. HTTP end-of-stream is a separate observation from complete AG-UI event
framing. This regression establishes local protocol behavior; live results are
recorded separately. Valid 31s/5s/5s response acquisition and indefinitely blocked first responses also exercise the shared 55-second case deadline. Blocked requests must cancel and drain with one SDK call, zero protected effects and no fabricated terminal.

## Opt-in published-client live qualification

The live runner is separate from deterministic CI. List the six projects and 54
scenarios without credentials, builds, native processes, or model calls:

```sh
npx nx live-provider-e2e dotnet-conformance --list
```

Prepare a public NuGet consumer from an unchanged detached checkout of release `df1340f713d3b65165a494eb09e53246298df858`, importing the original signed `Hashbrown.AspNetCore` `0.1.0-preview.1` archive and matching qualified package/symbols through the existing published import mode. Keep that checkout and descriptor intact through final verification. Prepare a standalone published npm consumer, then explicitly opt in to real model traffic. The current runner wraps the released fixture/probe roles; its source provenance is recorded separately from the package producer.
The authorized env file supplies `OPENAI_API_KEY`, `AZURE_API_KEY`,
`AZURE_ENDPOINT`, and optional `AZURE_MODEL=gpt-4.1-mini`. Azure CLI mode uses the
existing CLI account and receives no API key. Set server-owned `AZURE_CONFIG_DIR` to that existing signed-in profile explicitly: package roles retain their isolated `HOME`. Only selected Azure CLI fixture children receive that profile; probe, cleanup, qualification and browser children do not. The runner never logs in, provisions
resources, changes roles, or selects an account.

```sh
npx nx build dotnet-conformance
npx nx prepare-live-consumer dotnet-conformance
HASHBROWN_LIVE_OPT_IN=1 npx nx live-provider-e2e dotnet-conformance --credentials /absolute/path/to/authorized.env --consumer-metadata /absolute/path/from-prepare/consumer-metadata.json --nuget-metadata /absolute/path/to/public-candidate.json
```

The preparation target builds a fresh standalone consumer using the published
React, Angular, and core packages pinned to 0.8.3 and reports its metadata path.
The live runner requires explicit absolute `--consumer-metadata` and anchored public `--nuget-metadata` paths before loading credentials. It accepts only the reviewed signed archive SHA256 `288cdd59c3f123ea4f69bc044b4eed3eeae8ffd1ab53df64f9555148cd1d2f57` and DLL SHA256 `37c98d354cca12fb6b32e94210e747bd7b825881436fea9eae291de72ea3a9e2`, with genuine published import proof; there is no source fallback. Keep the same frozen consumer for published deterministic and live
qualification; host or template changes require fresh preparation and qualification.
Every source, template, bundle, installed package, and resolved module origin is
revalidated before execution and after children and owned schema cleanup drain on every outcome without rewriting the trusted
baseline. The live runner does not implicitly install another consumer. Provider credentials are excluded from
consumer builds, Playwright workers, Chromium, browser URLs, and bundles.

The fixed matrix uses React/Angular with OpenAI Responses key, Azure Responses key,
and Azure Responses CLI authentication. Its nine groups cover native streaming,
structured schema, trusted UI/action, browser and server tools, application approval
recovery and decline, real native iterator cancellation followed by a fresh thread,
same-response native browser/server interoperability, and genuine native approval
with one protected dispatch and a clean later user turn.
Three native preflights also check OpenAI Responses, Azure Responses, and Azure CLI
Chat Completions with its separate cognitive-services audience. Managed identity
on an actual Azure host remains an explicitly deferred qualification.

One worker, zero retries, fixed per-group ceilings, a 384-token native wire cap,
a shared 55-second UI/native case guard inside 60-second native scenario deadlines, and a 15-minute run deadline bound execution. The
manifest reserves 123 calls including the three preflights, below the unchanged
128-call run ceiling. Native approval reserves four calls but only its validated
three-phase sequence qualifies; unused calls cannot fund retries or another group. Owned
native process groups are terminated on abort. Cancellation evidence concerns the
actual native iterator and HTTP lifetime; it does not establish when a provider
stops compute or billing. Legacy Azure shared credential refresh retains the
native cancellation limitation documented in the identity tests.

The runner persists only projected metadata through one 2 MiB run-level JSONL
sink in its fresh `hashbrown-live-run-*` temporary directory. Raw child output and
errors are discarded. Failed native/mixed outcomes may include only a fixed, group-specific phase label; unknown or malformed labels fail closed. Playwright traces, screenshots, video, and page snapshots
are disabled; test failures are replaced before Playwright's artifact recorder
runs. The deterministic tests include an actual forced Playwright failure with
secret canaries in assertion/error/cause, DOM, and split child output, then inspect
all output artifacts. Unknown runner/Playwright overrides are rejected, and
missing prerequisites fail qualification without a passing skip or automatic retry.
Success requires 54 distinct passed outcomes matched to valid native wire/effect
evidence and all three successful preflights. All six native approval cases also
require genuine captured/admitted/published journal evidence, the original public
and native call/result values, a published zero-effect pending observation, one
matched durable protected effect, a clean later user turn, and complete input/output
usage for each actual model call. Missing, skipped, duplicate, failed, or unpersisted
evidence fails the run. The final result reports `plannedCases`,
`actualPassedCases`, `successfulPreflights`, `reportDirectory`,
`verifiedMetadataPath`, and `provenancePath`; the planned count alone never
establishes successful qualification.

### Prepared package browser gate

`package-prepare` builds the public smoke consumer and two application roles once
outside the repository. The fixture role compiles `Program.cs` and the explicit
`Testing/*.cs` allowlist in `nuget-consumer/roles.mjs`. The probe role compiles the
actual `tests/fixtures/live-approval-journal.cs.txt` with that same reviewed
application allowlist. Each role has one exact `Hashbrown.AspNetCore`
PackageReference and no project, source, or DLL fallback. The existing
`FixtureIntegrationReflection` remains test-host-only: it reads/clones existing
internal diagnostics and constructs fault-injection diagnostics. It neither
changes library visibility nor supplies an implementation or public observation
API. `FixturePackageIdentity` uses an internal module initializer, enabled only by
the controlled package environment, to report the actual loaded assembly before
readiness. Source probes retain their original output.

Prepare one published npm 0.8.3 consumer with
`npx nx prepare-live-consumer dotnet-conformance`; retain its returned
`metadataPath`. Set `HASHBROWN_LOCAL_NATIVE_CONSUMER_METADATA` to that absolute
path, then run `npx nx package-e2e dotnet-conformance --metadata=<absolute-pointer>`
and `npx nx local-native-approval-browser dotnet-conformance --metadata=<same-pointer>`.
Both commands also accept `--npm-metadata=<absolute-path>` for aggregate callers.
They never prepare implicitly, and reuse the same physically installed npm
consumer. They fully qualify NuGet and npm before and after the run. The matrix
reuses the original eight projects/spec files; its reporter compares all 664
reviewed project/file/title tuples. The separate regression reporter requires the
six genuine fast, delayed, and hung approval cases across both frameworks.

A shared synchronous schema rejects missing/resealed role, launcher, runtime, or
source-discovery evidence before acquisition. Both role targets must remain bound
to their manifested external executable and library.

Every fixture acquisition, including durable restarts and second workers, rechecks
the separately pinned pointer, metadata, role source/output closure, source
manifest, configuration, evaluated build inputs and runtime hashes. Runtime
framework versions are pinned with roll-forward disabled. No restore, compilation,
API scan, or public smoke runs per worker. Runtime-loader/build environment
injection is rejected; source mode is explicitly selected by the semantic-test and
original source-browser configurations. Package mode cannot resolve `dist`.
Outcome, qualification, and per-launch provenance reports are retained in the
candidate root's `browser-reports`, or `HASHBROWN_PACKAGE_EVIDENCE_DIRECTORY`.

## Package installation and documentation qualification

[`Hashbrown.AspNetCore` version `0.1.0-preview.1`](https://www.nuget.org/packages/Hashbrown.AspNetCore/0.1.0-preview.1)
is available from NuGet.org, targets .NET 10 (SDK 10.0.402), and uses namespace
`Hashbrown.AspNetCore`. Use one exact `PackageReference`
(`Version="[0.1.0-preview.1]"`); rely on the nuspec for dependencies. Create and
commit the application lockfile, then use locked restore:

```sh
dotnet add package Hashbrown.AspNetCore --version "[0.1.0-preview.1]" --source https://api.nuget.org/v3/index.json
dotnet restore --source https://api.nuget.org/v3/index.json --use-lock-file
dotnet restore --source https://api.nuget.org/v3/index.json --locked-mode
```

Repository package acceptance still uses an owned local feed with exclusive
candidate source mapping. Its documentation check requires an anchored prepared
candidate:

```sh
npx nx check-docs dotnet-conformance --metadata=/absolute/path/candidate.json
```

Missing or changed metadata fails closed. The check requires an already prepared
candidate, retains sixteen standard and sixteen native program identities, and
checks React/Angular parity. It does not create a replacement candidate.
The historical 54-case source result remains distinct from the subsequently audited [54-case public NuGet live qualification](../../../docs/superpowers/research/2026-10-31-dotnet-public-live-qualification.md). Each has its own immutable package/runner provenance; do not substitute historical source evidence for a published-package run.

Applications own authentication, authorization, PostgreSQL, configuration and
provider secrets. For a source-to-package upgrade, remove copied Integration files
and update imports, stop and drain old workers, and retain the original agent,
catalog, scope and configuration identities. Workflow schema 3 and native schema 2
remain separate from package version. Recovery lookup is read-only, pending mixed
browser work cannot cold restore, uncertain effects are not automatically retried,
and mixed-version rolling operation is not guaranteed.

### Pending browser recovery compatibility (source candidate)

The unreleased pending browser recovery candidate has a fourth explicit Jest
profile, `npx nx test-recovery-compatibility dotnet-conformance`. It requires
qualified public NuGet and npm baseline descriptors and fails when they are absent.
The ordinary `test-harness`, `test-runtime`, and `test-package` aggregate remains
independent of private baseline paths.

Both PR and full package acceptance invoke the mandatory recovery upgrade wrapper
inside the existing `upgrade` phase. It first retains the original historical
upgrade qualification, then prepares an isolated checkout of producer
`df1340f713d3b65165a494eb09e53246298df858`, verifies the committed original
preview1 archive pair, downloads and signature/payload-qualifies the exact official
public NuGet archive, and separately installs and qualifies npm 0.8.3 consumers.
The explicit compatibility profile proves four old-server rejection cases and
sixteen bounded rejections with unchanged durable rows and no model requests.
It does not execute those npm browser bundles; candidate browser journeys are a
separate qualification step. Baseline and candidate descriptors remain distinct
and are verified again after execution. All substeps must succeed before the
existing upgrade phase can pass; failure receipts remain in its private evidence.

Historical helper execution requires the original SDK 10.0.402 on PATH. The
producer's already-installed TypeScript 6.0.3 is copied as physical tooling files;
the standalone npm consumer still runs its own exact-lock registry installation.
The archive fixtures and provenance are documented in
[published-baselines/0.1.0-preview.1](./published-baselines/0.1.0-preview.1/README.md).
No release or preview1/npm 0.8.3 pending-browser feature availability is claimed.
