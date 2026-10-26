---
title: '.NET with OpenAI and Azure: Hashbrown React Docs'
meta:
  - name: description
    content: 'Use a tested ASP.NET Core AG-UI integration with OpenAI, Azure OpenAI, tools, and interrupt/resume.'
---

# .NET with OpenAI and Azure OpenAI

Connect Hashbrown to an ASP.NET Core AG-UI endpoint. The browser uses the same Hashbrown APIs as a Node-backed application; the .NET server chooses the model, holds credentials, and runs its own tools.

The tested reference uses .NET 10, Microsoft Agent Framework, and the upstream AG-UI SDK. It covers Responses and Chat Completions with both OpenAI and Azure OpenAI, streaming JSON and trusted UI, browser/server tools, and application confirmation with interrupt/resume. This is a source recipe, not a Hashbrown NuGet package.

The recovery examples below require Hashbrown SDK **0.8.1 or later**, which includes `getRecoveryConfiguration` and `restoreConversation`; SDK 0.8.0 does not include these APIs. Install matching core and framework SDK versions.

## Server dependencies

Use SDK `10.0.402`. Add these exact references to a `Microsoft.NET.Sdk.Web` project targeting `net10.0`, then restore and commit its NuGet lockfile:

```xml
<ItemGroup>
  <PackageReference Include="Microsoft.Agents.AI.Hosting.AGUI.AspNetCore" Version="1.26.0-preview.261023.1" />
  <PackageReference Include="Microsoft.Agents.AI" Version="1.26.0" />
  <PackageReference Include="AGUI.Abstractions" Version="1.0.1" />
  <PackageReference Include="AGUI.Server" Version="1.0.1" />
  <PackageReference Include="Microsoft.Extensions.AI.OpenAI" Version="10.10.1" />
  <PackageReference Include="OpenAI" Version="2.14.0" />
  <PackageReference Include="Azure.AI.OpenAI" Version="2.1.0" />
  <PackageReference Include="Azure.Core" Version="1.63.0" />
  <PackageReference Include="Npgsql" Version="10.0.3" />
</ItemGroup>
```

Copy the C# files in the [tested Integration source](https://github.com/liveloveapp/hashbrown/tree/main/tools/conformance/dotnet/Integration) into your server project. They supply request-local schema configuration, an optional confirmation workflow, bounded memory and PostgreSQL checkpoint stores, and upstream endpoint configuration. Keep their namespace or update the imports below. The fixture's `Program.cs`, `Testing/` directory, and TypeScript harness are internal testing infrastructure.

When upgrading an existing copy of this recipe, update the copied Integration helpers and startup code together. Register the former `Prepare`/`Execute` handlers under a stable operation name/version in `WorkflowOperationRegistry`, and pass a `WorkflowCheckpoint` JSON descriptor instead of captured delegates.

The baseline hosting package is a preview even though the core Agent Framework package is stable. `HashbrownEndpointConfiguration.Configure` registers upstream native interrupt serialization explicitly for this version combination. Upgrade the package set together and rerun the conformance suite.

## Choose the provider on the server

The shared `ProviderFactory` reads these server configuration keys. Supply keys through server secret configuration; Azure identity modes do not require `ApiKey`. Keep provider credentials and identity selection out of browser code.

| Key                       | OpenAI                       | Azure OpenAI                                                        |
| ------------------------- | ---------------------------- | ------------------------------------------------------------------- |
| `Provider`                | `openai`                     | `azure`                                                             |
| `ModelApi`                | `responses`                  | `responses`                                                         |
| `ModelEndpoint`           | `https://api.openai.com/v1/` | `https://<resource>.openai.azure.com/openai/v1/`                    |
| `Model`                   | Your OpenAI model name       | Your Azure deployment name                                          |
| `ApiKey`                  | Your OpenAI key              | Required only for `api-key` authentication                          |
| `AzureAuthentication`     | `api-key` (default)          | `api-key` (default), `azure-cli`, or `managed-identity`             |
| `ManagedIdentityClientId` | Omit                         | Optional user-assigned client ID; omit for system-assigned identity |

Responses is the recommended API for new integrations. Both providers use the pinned native OpenAI .NET Responses client through Microsoft's `IChatClient` adapter and the existing AG-UI host. The Azure Responses endpoint uses the OpenAI-compatible `/openai/v1/` path; an Azure resource-origin endpoint is also expanded to that path. A deployment name is not assumed to equal an OpenAI model name. Select a deployment/model that supports the requested tools and structured output.

For an existing Chat Completions integration, explicitly set `ModelApi` to `chat-completions`. Use the OpenAI `/v1/` endpoint or Azure resource-origin endpoint as before. That Azure path retains `AzureOpenAIClient`, deployment routing, its SDK-selected API version and the selected Azure authentication mode. Direct `ProviderFactory` callers that omit `ModelApi` retain Chat Completions compatibility; the startup recipe below explicitly defaults new applications to Responses. Unknown API/provider values fail before model work.

Responses requests use `store=false` and resend application-owned canonical history. Provider conversation IDs, continuation tokens and background responses are disabled; restoration does not poll or resume a provider-owned response. This does not enable general chat-session persistence or hosted tools. Responses carries strict output schemas in `text.format`; Chat Completions uses `response_format`, with the same Hashbrown schema semantics.

The Responses adapter requires a successful native completion; failed, incomplete, or truncated streams cannot become successful final answers. Recovery checks native output before the AG-UI adapter can omit meaningful items. Unsupported reasoning, encrypted continuation, hosted-tool items, annotations, or unknown native output make retained terminal history unavailable. A visible text answer alone does not prove that its full native history can be restored; the checkpoint status remains authoritative and effects are not replayed to obtain another answer.

## Azure authentication

Omitting `AzureAuthentication` keeps API-key authentication for both APIs. Set it to `azure-cli` for an explicitly selected developer CLI identity, or `managed-identity` on an Azure host. These modes use the native SDK's token credential support and require an HTTPS `ModelEndpoint`. Empty or unknown modes, an identity mode with OpenAI, and a managed identity selector outside managed identity mode fail at startup. Identity failure never falls back to a configured key or another credential.

For local Azure CLI authentication, sign in outside application startup using the account with inference permission on your resource, then configure your server:

```sh
Provider=azure \
ModelApi=responses \
ModelEndpoint='https://<resource>.openai.azure.com/' \
Model='<deployment>' \
AzureAuthentication=azure-cli \
dotnet run
```

The factory uses `AzureCliCredential` with a ten-second CLI process timeout. It does not start interactive sign-in or change the CLI's selected account. For an Azure-hosted application, select `AzureAuthentication=managed-identity`; omit `ManagedIdentityClientId` for its system-assigned identity, or set it to the client ID of an already assigned user identity. Grant that identity inference permission through your normal deployment process. No developer credential chain is used in managed identity mode.

This pinned package baseline supplies the `Azure.Identity` credential types through `Azure.Core` 1.63.0. Responses uses the fixed public-Azure scope `https://ai.azure.com/.default`; the legacy Azure client uses `https://cognitiveservices.azure.com/.default`. These scopes and the authentication mode are trusted server configuration, independent of the application's browser/session authentication. Rotating credentials or switching between Azure authentication modes preserves checkpoint compatibility when provider, API, endpoint and model remain the same.

Responses propagates caller cancellation during token acquisition. In the pinned legacy Chat Completions client, shared token refresh is not interrupted by one caller's cancellation; even a pre-cancelled call can acquire a token before it stops without model dispatch. The CLI process timeout bounds CLI execution, not an entire model request. Prefer Responses when prompt cancellation is required.

Managed identity selection is covered deterministically. A real Azure-hosted managed identity run remains a documented follow-up; a successful local Azure CLI run does not establish managed identity qualification.

## Host the endpoint

The following startup uses the reference helpers and a real server tool. It assumes your application signs users into the `app` cookie scheme with a `NameIdentifier` claim; integrate your existing authentication scheme instead when appropriate. Serve the browser and `/run` under the same origin so the ordinary session cookie reaches the endpoint.

```csharp
using System.Security.Claims;
using System.Text.Json;
using Hashbrown.Conformance.Integration;
using Microsoft.Extensions.AI;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration["ModelApi"] ??= "responses";
HashbrownEndpointConfiguration.Configure(builder.Services);
builder.Services.AddAuthentication("app").AddCookie("app");
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("conversation-user", policy => policy.RequireAuthenticatedUser());
    options.AddPolicy("checkpoint-operator", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("permission", "checkpoint-operator"));
});

var registry = new WorkflowOperationRegistry([
    new WorkflowOperation(
        Name: "confirm-airport", Version: 1,
        Validate: parameters => parameters.ValueKind == JsonValueKind.Object
            && parameters.EnumerateObject().Count() == 1
            && parameters.TryGetProperty("code", out var code)
            && code.ValueKind == JsonValueKind.String
            && code.GetString()?.Length == 3,
        Prepare: (_, cancellationToken) =>
        {
            cancellationToken.ThrowIfCancellationRequested();
            return ValueTask.CompletedTask; // Preparation has no external effects.
        },
        Execute: (parameters, effectId, cancellationToken) =>
        {
            cancellationToken.ThrowIfCancellationRequested();
            _ = LookupAirport(parameters.GetProperty("code").GetString()!);
            // For a business effect, pass effectId to downstream idempotency handling.
            return ValueTask.CompletedTask;
        })
]);
var checkpointOptions = new InterruptStoreOptions
{
    CompatibilityIdentity = ServerConfigurationIdentity.Create(builder.Configuration)
};
IInterruptStore pending = new PendingInterruptStore(TimeProvider.System, registry, checkpointOptions);

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

var accessor = app.Services.GetRequiredService<IHttpContextAccessor>();
string Scope() => accessor.HttpContext?.User
    .FindFirst(ClaimTypes.NameIdentifier)?.Value
    ?? throw new UnauthorizedAccessException();

var client = new HashbrownRequestClient(
    ProviderFactory.Create(builder.Configuration));
var agent = client.AsAIAgent(
    name: "ApplicationAssistant",
    tools: [AIFunctionFactory.Create(LookupAirport, "lookupAirport")]);

HashbrownEndpointConfiguration.Map(
    app, "/run", agent, pending, Scope,
    new HashSet<string>(["lookupAirport"], StringComparer.Ordinal))
    .RequireAuthorization("conversation-user");

await app.RunAsync();

static object LookupAirport(string code) => new
{
    code,
    name = code == "PDX" ? "Portland International Airport" : "Unknown"
};
```

The server-tool names passed to `Map` must match the tools registered on the agent. A browser tool cannot reuse one of those names. Use separate model turns for browser and server calls: the reference configuration rejects a single response combining both kinds before server functions execute. Sequential mixed workflows are covered by CI.

Hashbrown supplies the complete canonical transcript on each run. Keep the agent's persisted chat-session storage disabled for this recipe; appending that transcript to a stored transcript duplicates history. Use `threadId` as conversation identity, not as authorization. The reference does not require a `parentRunId`.

## Structured output and trusted UI

The reference client reads `forwardedProps.hashbrown.responseSchema`, clones the request's `ChatOptions`, and applies the native JSON schema format with strict mode. It preserves tools and other AG-UI options. A later ordinary-text request does not inherit the previous request's schema.

Use the normal [structured-output API](/docs/react/concept/structured-output) or [trusted components](/docs/react/concept/components). Their schemas reach the native model request, and JSON returns through assistant text events for Skillet's incremental parser. `ui: true` remains a marker; there is no separate .NET renderer. State snapshots, tool results, A2UI surfaces, and `RUN_FINISHED.result` do not replace Hashbrown's text-JSON output contract.

Applications may pin or allowlist output schemas on the server. Browser-supplied schemas and tool declarations do not grant server permissions.

## Browser and server tools

Declare browser tools through the normal framework API. Their implementation stays in the browser; the server receives only the name, description, and parameter schema. Hashbrown executes a requested browser tool, then sends its result with the transcript on a new AG-UI run.

Register server functions with the .NET agent as above. They execute in .NET and emit correlated result events before the run finishes. Do not register a second browser implementation of a server tool. The tested flow supports browser then server, server then browser, and repeated calls with fresh results.

## Add application confirmation

To pause a server-selected workflow, wrap the schema client before creating the agent:

```csharp
var workflowClient = new InterruptWorkflowClient(
    client, pending, registry,
    selectCheckpoint: input => new WorkflowCheckpoint(
        "confirm-airport", 1, JsonSerializer.SerializeToElement(new { code = "PDX" })),
    scope: Scope,
    currentClaim: () => HashbrownEndpointConfiguration.GetClaim(accessor.HttpContext));
var confirmedAgent = workflowClient.AsAIAgent(
    name: "ConfirmedWorkflow",
    tools: [AIFunctionFactory.Create(LookupAirport, "lookupAirport")]);
```

Pass `confirmedAgent` instead of `agent` to `Map`. This example pauses before a server-selected airport lookup and then continues the agent. The stored checkpoint contains a versioned operation name and cloned, server-selected JSON parameters. The registry reconstructs its behavior on every instance; delegates and request closures are never persisted. Return `null` from `selectCheckpoint` for runs that need no confirmation; a browser flag is not an authorization policy. The gate asks two confirmation questions, stores their batch before emitting native interrupt content, and pauses without calling the model. It is an explicit application confirmation gate, not automatic support for MAF `ApprovalRequiredAIFunction` tools.

Authorize server tools independently. A privileged operation protected by a checkpoint must not also be exposed as an unrestricted model tool. The example lookup is read-only; the checkpoint API does not automatically intercept tool proposals.

The pending store binds the complete response batch to the signed-in principal, thread, original conversation/tool/schema fingerprint, and expiry. Respond with exactly one entry per interrupt. A resolved `{ approved: true }` accepts; `{ approved: false }` declines; `cancelled` abandons the action. Invalid, expired, differently scoped, altered, or already consumed resumes fail before new model/tool work.

An accepted batch atomically claims its stored checkpoint using a fresh server token and generation. The browser's `runId` does not grant claim ownership. Cancellation before dispatch releases a valid claim; preparation must have no external effects. A preparation lease that expires loses authority to dispatch or finalize, even before another instance takes over. A valid active lease can finish after the approval admission deadline.

### Persist confirmations in PostgreSQL

For restart and multi-instance recovery, replace the `IInterruptStore pending = ...` line in the host example with this block. Keep the same registry, optional confirmation wrapper, authenticated scope, and endpoint mapping:

```csharp
await using var checkpointSource = Npgsql.NpgsqlDataSource.Create(
    builder.Configuration.GetConnectionString("Checkpoints")
        ?? throw new InvalidOperationException("Configure the server checkpoint database."));
var durable = new PostgresInterruptStore(
    checkpointSource, registry, schema: "hashbrown",
    options: checkpointOptions with
    {
        Capacity = 128,
        ApprovalTtl = TimeSpan.FromMinutes(10),
        PreparationLease = TimeSpan.FromSeconds(30),
        TerminalRetention = TimeSpan.FromMinutes(10),
        SnapshotRetention = TimeSpan.FromMinutes(10),
        AuditRetention = TimeSpan.FromDays(30)
    });
await durable.InitializeAsync(); // Complete before accepting requests.
IInterruptStore pending = durable;
builder.Services.AddHostedService(services => new PostgresInterruptCleanupService(
    durable,
    services.GetRequiredService<ILogger<PostgresInterruptCleanupService>>(),
    TimeSpan.FromMinutes(1), TimeSpan.FromSeconds(10)));
```

The pooled `NpgsqlDataSource` lives for the application lifetime and is disposed when the host exits. Supply `ConnectionStrings:Checkpoints` through server secret configuration. Configure authenticated TLS and certificate validation for production according to [Npgsql security documentation](https://www.npgsql.org/doc/security.html).

`InitializeAsync` creates and checks the versioned schema safely during concurrent startup. Give the initialization identity permission to create the dedicated schema, tables, indexes, and constraints; the runtime needs access to that schema's checkpoint data. Coordinate schema-version upgrades and permissions with your deployment process. The executable reference uses PostgreSQL 18 and Npgsql 10.0.3.

The checkpoint options above bind each batch to a secret-free hash of the trusted server API, provider, effective endpoint and model/deployment, as well as its existing browser configuration and operation registry. Credential rotation alone does not change this identity. The endpoint must be an HTTP(S) URL without user information, query or fragment. Changing APIs or model configuration does not authorize resuming old work: recovery and direct resume return 409 before model or effect work when the stored binding differs. Never take this identity from browser input or rewrite it to bypass a mismatch.

**Upgrade all checkpoint workers together.** The new helpers migrate PostgreSQL schema 1/2 to schema 3 transactionally. Stop and drain **all** older workers before migration; overlapping mixed-version rolling operation is unsupported. An already-running older worker can ignore the new identity on reads, write legacy rows, or use an already issued claim. Schema-version checks prevent an older binary starting afterward, and bound fingerprints prevent its old claim validator admitting new bound rows; neither retrofits an existing process.

Migration preserves legacy rows and their original fingerprints, with a null/unbound server identity. It cannot establish their original API/model configuration, so the identity-bound recipe rejects their recovery and resume with 409 rather than relabeling them as Responses. Plan pending approvals and unresolved effects before the upgrade; protected operator inspection and reconciliation remain available. Omitted-identity legacy store callers retain their original legacy behavior, but cannot claim newly bound batches. Do not backfill identities from browser data or automatically retry an uncertain effect.

Every application instance must use the same authoritative database, server compatibility identity and compatible registry. Retain each operation name/version with its original meaning while stored work may reference it; missing versions or invalid persisted parameters fail closed before effect or model work. The checkpoint selector cannot replace stored arguments on resume. Replicas must also resolve the same stable authenticated application/tenant/user scope. With the cookie example, share the normal ASP.NET Core Data Protection keys and session configuration across replicas so authentication remains valid after routing changes.

The approval deadline, preparation lease, and terminal retention are independent. Choose a lease long enough for ordinary pure preparation; there is no lease renewal. PostgreSQL server time controls durable deadlines. Expired pre-effect claims can be reacquired while approval remains valid. Terminal records remain for the configured retention, then their IDs become unknown (410). Capacity includes retained records. Active work and unresolved post-effect records are preserved; they continue occupying capacity until authorized terminal reconciliation and subsequent retention cleanup. No automatic retry queue is supplied.

Measure pure preparation under expected database and downstream load before setting `PreparationLease`; leave headroom for connection acquisition and scheduling. There is no renewal API. If preparation exceeds the lease, refresh authoritative recovery and require a fresh decision where still eligible. Never move external effects into preparation to work around lease expiry.

Before invoking the executor, the store commits an irreversible dispatch marker. This provides **at most one registered execution dispatch per batch**, assuming all instances use the authoritative database and dispatch gate. It does not promise exactly-once external effects: a crash after the marker but before invocation can produce zero effects. A crash after an external effect but before completion is an unknown outcome. Neither case is automatically replayed. Use the stable `effectId` for application-specific downstream idempotency, or integrate the business effect and checkpoint transition in one application transaction when stronger guarantees are required. The guarantee assumes PostgreSQL retains acknowledged commits; restoring an older backup, unsafe failover, or administrative state edits can invalidate it.

The memory store remains an explicit single-process development option with the same registry contract and defaults. It loses pending batches and consumed markers on restart. Both stores retain only bounded checkpoint-associated recovery history, not a general persisted chat session.

### Operate a replicated host

Separate liveness from readiness. A live process can still lack its checkpoint database, initialization permissions or compatible registry. Complete `InitializeAsync` before admitting requests; use a bounded database readiness probe and return unavailable while authoritative storage cannot be reached. Probes must not run a model or dispatch a tool. See [ASP.NET Core health checks](https://learn.microsoft.com/aspnet/core/host-and-deploy/health-checks?view=aspnetcore-10.0).

Budget proxy idle and request timeouts for approval/resume and streamed model responses. Disable response buffering for the SSE route and verify first-byte streaming through your actual gateway. During deployment, stop admitting new work, drain existing requests within your host's shutdown budget, then terminate. A forced stop after dispatch leaves an unknown outcome for an operator; restarting does not make the effect safe to repeat.

Use bounded metric labels such as operation version and checkpoint state. Track claim conflicts, expired preparation leases, unresolved effects, capacity refusals, cleanup counts/failures and recovery disposition. Record aggregate durations for preparation and streaming. Do not put thread IDs, user scopes, prompts, arguments, claim tokens, credentials or transcript text into metric labels or routine logs. Protect operator evidence separately; inspection endpoints intentionally omit transcripts and privileged parameters.

## Recover retained conversations and inspect effects

Opt in by adding these mappings before `await app.RunAsync()` in the host example. Keep ordinary recovery and operator authorization separate:

```csharp
RecoveryEndpointConfiguration.MapRecovery(
    app, "/threads/{threadId}/recovery", pending, "conversation-user",
    context => context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
RecoveryEndpointConfiguration.MapOperations(
    app, "/checkpoints", pending, "checkpoint-operator",
    context => context.User.FindAll("checkpoint-scope")
        .Select(claim => claim.Value).ToHashSet(StringComparer.Ordinal),
    context => context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
```

Your application authenticates users with its real session and issues the `checkpoint-operator` permission only to authorized operators. The `checkpoint-scope` claims come from your trusted application authorization service and list the principal scopes that operator may inspect. Never accept scopes, actor identities, or permissions from request bodies. This example scopes each conversation to its signed-in `NameIdentifier`; adapt both the run and recovery resolvers together for tenant/application ownership. A thread ID is only a selector. The internal fixture's credentials and `Testing/` code are not an authentication recipe.

`POST /threads/{threadId}/recovery` is read-only. Send the exact value from `getRecoveryConfiguration()` as JSON; it contains current trusted system text, native browser tool declarations, and forwarded properties/schema. The endpoint authenticates and resolves scope before comparing this configuration with the retained original. It returns 404 for missing/wrong-scope history, 409 for incompatible configuration, and 503 for unavailable authoritative storage. Responses use `Cache-Control: no-store`. Do not cache them or fall back to browser-selected history.

A version-1 envelope separates `effectState`, `generationOutcome`, `transcriptAvailability`, and `disposition`, and may contain a `snapshot`. Validate the envelope version and known disposition values before applying policy. Pass `snapshot` directly to `restoreConversation(snapshot, { expectedRevision })`, using the local revision captured before lookup. This atomic idle-only operation validates canonical messages, trusted schemas/tools, state and the complete interrupt list. It installs fresh local batch ownership and preserves the original configured system-message ID; it performs no network request, tool execution, or scheduling. Do not remove or reconstruct messages, replay SSE, or save a local batch ID as recovery authority.

Native requests retain cancellation text but strip private runtime provenance. The default `structuredHistory: 'strict'` rejects assistant history that fails the configured structured/UI schema after a cold reload. Plain chat retains this text visibly. In the same runtime and thread, exact echoes of locally owned cancellation markers preserve their private projection behavior.

**Diagnostic recovery requires SDK 0.8.2 or later:** `structuredHistory: 'preserve-diagnostics'` and `recovery.diagnostics` below require matching core and framework SDK versions. They are unavailable in 0.8.1; keep the strict default there. To deliberately retain unstructured historical assistant text in a structured/UI application, opt in on restore:

```ts
chat.restoreConversation(snapshot, {
  expectedRevision,
  structuredHistory: 'preserve-diagnostics',
});
```

This policy keeps exact canonical text for subsequent model requests and exposes it through `recovery.diagnostics`, while excluding it from typed responses and component rendering. Render each diagnostic's `content` visibly as escaped plain text, separately from normal assistant output. It does not identify a cancellation marker or grant generation, tool or resume authority. Tool-bearing/encrypted history and every other validation remain strict. Do not delete history, infer ownership from its wording, fabricate provenance, or hide diagnostics. A pending server checkpoint still needs an explicit decision.

With SDK 0.8.2 or later and that opt-in policy, render diagnostics alongside your normal history:

```tsx
<aside aria-label="Historical diagnostics">
  {chat.recovery.diagnostics?.map((diagnostic) => (
    <p key={diagnostic.messageId} role="note">
      {diagnostic.content}
    </p>
  ))}
</aside>
```

Remember only the thread selector across reload, scoped to the endpoint and scenario. Refresh explicitly; do not send a synthetic user message or automatically repeat an earlier approval. Disable Send and all decision controls while fetching, when recovery is required, on `Busy`, `UnknownEffect` or `AmbiguousEffect`, and when no safe snapshot is available. Unknown envelope/status values also fail closed. Display recovery status separately from assistant history. A deliberate New thread action invalidates in-flight lookup guards and clears the application gate. A successful restore alone does not authorize actions on a busy or unknown thread.

A pending unexpired batch restores approval controls. An active preparation lease is busy; after a failed stream, explicitly refresh again after lease expiry and make a new explicit decision. A successful lookup is not a reservation: competing tabs still face ordinary server claim validation, and the loser refreshes after its conflict. Expired, declined, failed-before-effect, completed and reconciled records never produce a retry action. `CompletedAnswerUnavailable` means the effect completed but the final answer was not retained; show that status without inventing assistant text or repeating the effect.

The operator routes are `GET /checkpoints?limit=50`, `GET /checkpoints/{batchId}`, and `POST /checkpoints/{batchId}/reconcile`. Listing and audit pagination are bounded (default 50, maximum 100). Inspection omits privileged arguments, claim tokens and conversation history. Reconciliation requires `expectedState`, `expectedGeneration`, `expectedRevision`, an `outcome` of `ConfirmedPerformed`, `ConfirmedNotPerformed`, or `Unresolved`, a nonempty `reason` (at most 2,000 characters), `evidenceReference` (at most 2,048), and `externalQuiescenceAcknowledged: true`. Only `EffectStarted` and `FailedAfterEffect` can be reconciled. Stale state/version races return 409 without a partial audit. The authenticated actor and server time are recorded in an immutable audit entry; reconciliation never runs preparation, execution, a model, or a browser tool and never reopens a batch.

**Fencing cannot revoke execution permission already issued.** Before asserting non-performance, independently establish that the old owner is quiescent and verify downstream evidence. A timeout is not proof; `Unresolved` is a valid terminal observation. Reconciliation retires stale claim/capture bookkeeping, but an already authorized paused worker can still execute if the external assertion is wrong. Any desired new business action needs a distinct authorized workflow.

### Retention, migration and capture boundaries

This is checkpoint-scoped recovery, not general chat-session persistence. Both stores retain the original serialized native request (default 256 KiB), bounded final canonical history (1 MiB), and at most 2,048 messages per snapshot. Recovery configuration is bounded to 256 KiB. Stored history/state may contain sensitive application data: apply database access controls, a deliberate retention policy and ordinary backup/privacy handling.

`SnapshotRetention` defaults to ten minutes measured from checkpoint creation, independently of ordinary terminal metadata retention. It is not renewed by answer completion. `AuditRetention` defaults to thirty days from each audit's recorded time, with separate bounded cleanup. Purging transcripts does not reopen consumed IDs or remove unresolved dispatch markers to make room. A missing snapshot keeps the UI gated. Memory storage loses everything on process restart; PostgreSQL retains the same server-owned contract across instances.

The PostgreSQL recipe registers `PostgresInterruptCleanupService` before building the host. It runs one maintenance pass immediately, then once per minute; each pass has a ten-second cancellation budget linked to host shutdown. These are example operational budgets, not retention deadlines. Choose a schedule that meets your physical-deletion requirements and monitor cleanup failures. Deploy this helper with the updated Integration source.

`PostgresInterruptStore.CleanupAsync(cancellationToken)` is independently committed, so an idle deployment can enforce retention without admitting another checkpoint. It returns separate metadata-deletion, transcript-purge and audit-deletion counts, each bounded by `CleanupBatchSize`. Repeat passes to drain a backlog. Concurrent maintenance skips locked candidates; later passes retry them. The scheduler does not run workflows or retry effects. Cancellation before commit rolls back the current pass.

`EffectStarted` **and** `FailedAfterEffect` records remain until explicit operator reconciliation, even after ordinary terminal retention expires. Their snapshots and audits still expire on their independent deadlines. Retained unresolved metadata counts against capacity; investigate and reconcile using authenticated evidence instead of deleting it to make room. Known terminal records can be removed after retention, making their old selectors unknown rather than reusable.

Schema initialization migrates versions 1/2 to version 3 under the existing startup lock, without fabricating missing history or a server identity. Legacy rows retain their original fingerprints, null identity and dispatch safety. The identity-bound recipe rejects their recovery and resume with 409 rather than converting them into fresh approvals; protected operator inspection remains available. Stop all older workers before migration as described above. Unsupported future schema versions fail closed. Deploy compatible Integration source, operation registry and schema together.

Final-answer capture supports canonical native text and server-tool history, including strictly equivalent redundant upstream diagnostics. Meaningful unknown raw events, reasoning/annotation/continuation extras, incomplete tool rounds, or snapshot replacement during an open text/tool fold fail closed to unavailable terminal history. A disconnect, process death, byte limit or persistence failure can also leave the answer unavailable while preserving the effect marker. This does not establish general AG-UI event replay or feature parity. Effect completion and answer availability remain independent.

## Connect React and answer a batch

Point your existing `HashbrownProvider` at `/run`:

```tsx
<HashbrownProvider url="/run">{children}</HashbrownProvider>
```

Use the `pendingInterrupts`, `isResuming`, and `resume` values returned by the same chat/completion hook that owns your conversation. A confirmation control can receive those values as props:

```tsx
import type { PendingInterruptBatch, ResumeOptions } from '@hashbrownai/core';

type ConfirmationProps = {
  batch: PendingInterruptBatch | undefined;
  isResuming: boolean;
  resume: (options: ResumeOptions) => void;
};

export function Confirmations({
  batch,
  isResuming,
  resume,
}: ConfirmationProps) {
  function answer(decision: 'approve' | 'decline' | 'cancel') {
    if (!batch) return;
    resume({
      batchId: batch.id,
      entries: batch.interrupts.map(({ id }) => ({
        interruptId: id,
        status: decision === 'cancel' ? 'cancelled' : 'resolved',
        ...(decision === 'cancel'
          ? {}
          : { payload: { approved: decision === 'approve' } }),
      })),
    });
  }

  return (
    <section>
      {batch?.interrupts.map((item) => (
        <p key={item.id}>{item.message}</p>
      ))}
      <button disabled={!batch || isResuming} onClick={() => answer('approve')}>
        Approve
      </button>
      <button disabled={!batch || isResuming} onClick={() => answer('decline')}>
        Decline
      </button>
      <button disabled={!batch || isResuming} onClick={() => answer('cancel')}>
        Cancel
      </button>
    </section>
  );
}
```

`batchId` is local browser ownership. Hashbrown sends the protocol interrupt IDs and decisions to .NET; it does not send that local token as a server lookup key. See [interrupt and resume](/docs/react/concept/interrupt-and-resume) for complete batch and UI ownership rules.

For custom response schemas, validate form answers in your application and validate them again in the server workflow. The reference confirmation store accepts the boolean `approved` object only. Generic interrupt answers are consumed by the application and do not become empty user messages on the native model wire.

### Explicit React refresh

Use the recovery methods on the same chat hook that owns the conversation (including structured/UI variants). This example receives a router-owned stable thread selector; `selectNewThread` updates that selector before changing the hook's `threadId`. Keep a restored pending batch's ordinary explicit confirmation controls and disable them with `blocked`.

```tsx
import type { ConversationSnapshot } from '@hashbrownai/core';
import { useChat } from '@hashbrownai/react';
import { useLayoutEffect, useRef, useState } from 'react';

type Envelope = {
  schemaVersion: number;
  disposition: string;
  reconciliationOutcome?: string;
  snapshot?: ConversationSnapshot;
};

export function RecoverableChat({
  threadId,
  selectNewThread,
}: {
  threadId: string;
  selectNewThread: (id: string) => void;
}) {
  const chat = useChat({
    threadId,
    system: 'Your trusted application instructions.',
  });
  const [prompt, setPrompt] = useState('');
  const [fetching, setFetching] = useState(false);
  const [gated, setGated] = useState(true); // Existing retained thread: refresh first.
  const [status, setStatus] = useState('');
  const request = useRef(0);
  const latest = useRef({ threadId, revision: chat.recovery.revision });
  useLayoutEffect(() => {
    latest.current = { threadId, revision: chat.recovery.revision };
  }, [threadId, chat.recovery.revision]);
  useLayoutEffect(
    () => () => {
      request.current++;
    },
    [],
  );

  async function refresh() {
    const generation = ++request.current;
    const expectedRevision = chat.recovery.revision;
    const current = () =>
      request.current === generation &&
      latest.current.threadId === threadId &&
      latest.current.revision === expectedRevision;
    setFetching(true);
    setGated(true);
    try {
      const response = await fetch(
        `/threads/${encodeURIComponent(threadId)}/recovery`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chat.getRecoveryConfiguration()),
        },
      );
      if (!current()) return;
      if (!response.ok) throw new Error(`Recovery HTTP ${response.status}`);
      const envelope: Envelope = await response.json();
      if (!current()) return;
      const known = [
        'Pending',
        'Busy',
        'Expired',
        'UnknownEffect',
        'AmbiguousEffect',
        'CompletedAnswerUnavailable',
        'Completed',
        'Declined',
        'FailedBeforeEffect',
        'Reconciled',
      ];
      const outcomes = [
        'ConfirmedPerformed',
        'ConfirmedNotPerformed',
        'Unresolved',
      ];
      if (
        envelope.schemaVersion !== 1 ||
        !known.includes(envelope.disposition) ||
        (envelope.disposition === 'Reconciled'
          ? !outcomes.includes(envelope.reconciliationOutcome ?? '')
          : envelope.reconciliationOutcome != null)
      )
        throw new Error('Unsupported recovery envelope');
      if (envelope.snapshot)
        chat.restoreConversation(envelope.snapshot, { expectedRevision });
      setStatus(
        envelope.reconciliationOutcome
          ? `${envelope.disposition}: ${envelope.reconciliationOutcome}`
          : envelope.disposition,
      );
      setGated(
        !envelope.snapshot ||
          ['Busy', 'UnknownEffect', 'AmbiguousEffect'].includes(
            envelope.disposition,
          ) ||
          envelope.reconciliationOutcome === 'Unresolved',
      );
    } catch (error) {
      if (current())
        setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (request.current === generation) setFetching(false);
    }
  }

  function newThread() {
    request.current++; // Invalidate history, status and finally callbacks synchronously.
    setFetching(false);
    setGated(false);
    setStatus('');
    selectNewThread(crypto.randomUUID());
  }
  const blocked = fetching || gated || chat.recovery.required;
  return (
    <section>
      <button
        disabled={fetching || chat.isLoading}
        onClick={() => void refresh()}
      >
        Refresh recovery
      </button>
      <button onClick={newThread}>New thread</button>
      <p role="status">{status}</p>
      <Confirmations
        batch={chat.pendingInterrupts}
        isResuming={chat.isResuming || blocked}
        resume={chat.resume}
      />
      <input
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
      />
      <button
        disabled={blocked || chat.isLoading}
        onClick={() => chat.sendMessage({ role: 'user', content: prompt })}
      >
        Send
      </button>
      {/* Render chat.messages with your normal trusted renderer. */}
    </section>
  );
}
```

## Compatibility checks

The [internal conformance suite](https://github.com/liveloveapp/hashbrown/tree/main/tools/conformance/dotnet) runs both React and Angular against both genuine provider clients with aimock replacing only the model API. It checks native paths/authentication, exact schemas, partial text/JSON/UI, tools, interrupt decisions, duplicate/concurrent/expired resume, failure/cancellation behavior, and durable restart, reload recovery, competing tabs, authenticated isolation, stale lookup guards, retained answers, historical browser-tool inertness and protected reconciliation across both APIs and all eight framework/provider/API combinations.

Entra authentication, live cloud-account qualification, .NET 8/9, automatic native tool approval, provider-hosted tools, general chat-session persistence, reasoning/continuation recovery, activities, and Hashbrown finish-reason metadata are outside this tested baseline. The deterministic suite uses aimock for the model API; passing it does not establish live OpenAI or Azure account behavior. Other AG-UI backends can use the [custom provider contract](/docs/react/platform/custom); AG-UI transport compatibility by itself does not establish all Hashbrown features.
