---
title: '.NET with OpenAI and Azure: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Use a tested ASP.NET Core AG-UI integration with OpenAI, Azure OpenAI, tools, and interrupt/resume.'
---

# .NET with OpenAI and Azure OpenAI

Connect Hashbrown to an ASP.NET Core AG-UI endpoint. The browser uses the same Hashbrown APIs as a Node-backed application; the .NET server chooses the model, holds credentials, and runs its own tools.

The tested reference uses .NET 10, Microsoft Agent Framework, and the upstream AG-UI SDK. It covers Chat Completions with both OpenAI and Azure OpenAI, streaming JSON and trusted UI, browser/server tools, and application confirmation with interrupt/resume. This is a source recipe, not a Hashbrown NuGet package.

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
  <PackageReference Include="Npgsql" Version="10.0.3" />
</ItemGroup>
```

Copy the C# files in the [tested Integration source](https://github.com/liveloveapp/hashbrown/tree/main/tools/conformance/dotnet/Integration) into your server project. They supply request-local schema configuration, an optional confirmation workflow, bounded memory and PostgreSQL checkpoint stores, and upstream endpoint configuration. Keep their namespace or update the imports below. The fixture's `Program.cs`, `Testing/` directory, and TypeScript harness are internal testing infrastructure.

When upgrading an existing copy of this recipe, update the copied Integration helpers and startup code together. Register the former `Prepare`/`Execute` handlers under a stable operation name/version in `WorkflowOperationRegistry`, and pass a `WorkflowCheckpoint` JSON descriptor instead of captured delegates.

The baseline hosting package is a preview even though the core Agent Framework package is stable. `HashbrownEndpointConfiguration.Configure` registers upstream native interrupt serialization explicitly for this version combination. Upgrade the package set together and rerun the conformance suite.

## Choose the provider on the server

The shared `ProviderFactory` reads these server configuration keys. Supply `ApiKey` through your server's secret configuration, never browser code.

| Key             | OpenAI                      | Azure OpenAI                        |
| --------------- | --------------------------- | ----------------------------------- |
| `Provider`      | `openai`                    | `azure`                             |
| `ModelEndpoint` | `https://api.openai.com/v1` | Your Azure OpenAI resource endpoint |
| `Model`         | Your OpenAI model name      | Your Azure deployment name          |
| `ApiKey`        | Your OpenAI key             | Your Azure resource key             |

The factory creates the genuine provider client. Azure uses `AzureOpenAIClient`, the deployment route, SDK-selected API version, and API-key authentication. A deployment name is not assumed to equal an OpenAI model name. Select a deployment/model that supports the requested tools and structured output.

## Host the endpoint

The following startup uses the reference helpers and a real server tool. It assumes your application signs users into the `app` cookie scheme with a `NameIdentifier` claim; integrate your existing authentication scheme instead when appropriate. Serve the browser and `/run` under the same origin so the ordinary session cookie reaches the endpoint.

```csharp
using System.Security.Claims;
using System.Text.Json;
using Hashbrown.Conformance.Integration;
using Microsoft.Extensions.AI;

var builder = WebApplication.CreateBuilder(args);
HashbrownEndpointConfiguration.Configure(builder.Services);
builder.Services.AddAuthentication("app").AddCookie("app");
builder.Services.AddAuthorization();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

var accessor = app.Services.GetRequiredService<IHttpContextAccessor>();
string Scope() => accessor.HttpContext?.User
    .FindFirst(ClaimTypes.NameIdentifier)?.Value
    ?? throw new UnauthorizedAccessException();

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
IInterruptStore pending = new PendingInterruptStore(TimeProvider.System, registry);
var client = new HashbrownRequestClient(
    ProviderFactory.Create(builder.Configuration));
var agent = client.AsAIAgent(
    name: "ApplicationAssistant",
    tools: [AIFunctionFactory.Create(LookupAirport, "lookupAirport")]);

HashbrownEndpointConfiguration.Map(
    app, "/run", agent, pending, Scope,
    new HashSet<string>(["lookupAirport"], StringComparer.Ordinal))
    .RequireAuthorization();

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

Use the normal [structured-output API](/docs/angular/concept/structured-output) or [trusted components](/docs/angular/concept/components). Their schemas reach the native model request, and JSON returns through assistant text events for Skillet's incremental parser. `ui: true` remains a marker; there is no separate .NET renderer. State snapshots, tool results, A2UI surfaces, and `RUN_FINISHED.result` do not replace Hashbrown's text-JSON output contract.

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
    options: new InterruptStoreOptions
    {
        Capacity = 128,
        ApprovalTtl = TimeSpan.FromMinutes(10),
        PreparationLease = TimeSpan.FromSeconds(30),
        TerminalRetention = TimeSpan.FromMinutes(10)
    });
await durable.InitializeAsync(); // Complete before accepting requests.
IInterruptStore pending = durable;
```

The pooled `NpgsqlDataSource` lives for the application lifetime and is disposed when the host exits. Supply `ConnectionStrings:Checkpoints` through server secret configuration. Configure authenticated TLS and certificate validation for production according to [Npgsql security documentation](https://www.npgsql.org/doc/security.html).

`InitializeAsync` creates and checks the versioned schema safely during concurrent startup. Give the initialization identity permission to create the dedicated schema, tables, indexes, and constraints; the runtime needs access to that schema's checkpoint data. Coordinate schema-version upgrades and permissions with your deployment process. The executable reference uses PostgreSQL 18 and Npgsql 10.0.3.

Every application instance must use the same authoritative database and compatible registry. Retain each operation name/version with its original meaning while stored work may reference it; missing versions or invalid persisted parameters fail closed before effect or model work. The checkpoint selector cannot replace stored arguments on resume. Replicas must also resolve the same stable authenticated application/tenant/user scope. With the cookie example, share the normal ASP.NET Core Data Protection keys and session configuration across replicas so authentication remains valid after routing changes.

The approval deadline, preparation lease, and terminal retention are independent. Choose a lease long enough for ordinary pure preparation; there is no lease renewal. PostgreSQL server time controls durable deadlines. Expired pre-effect claims can be reacquired while approval remains valid. Terminal records remain for the configured retention, then their IDs become unknown (410). Capacity includes retained records. Active work and stranded dispatch markers are preserved; a stranded marker may continue occupying capacity and requires application-specific manual reconciliation. This recipe adds no automatic retry queue or operator reconciliation API.

Before invoking the executor, the store commits an irreversible dispatch marker. This provides **at most one registered execution dispatch per batch**, assuming all instances use the authoritative database and dispatch gate. It does not promise exactly-once external effects: a crash after the marker but before invocation can produce zero effects. A crash after an external effect but before completion is an unknown outcome. Neither case is automatically replayed. Use the stable `effectId` for application-specific downstream idempotency, or integrate the business effect and checkpoint transition in one application transaction when stronger guarantees are required. The guarantee assumes PostgreSQL retains acknowledged commits; restoring an older backup, unsafe failover, or administrative state edits can invalidate it.

The memory store remains an explicit single-process development option with the same registry contract and defaults. It loses pending batches and consumed markers on restart. Neither store persists a second chat transcript.

A live browser that is still waiting to answer can retain its pending batch while the server restarts or routes its resume to another instance. A browser reload still loses Hashbrown's local pending-batch ownership; a saved `batchId` cannot restore it. Once a resume has been acknowledged by `RUN_STARTED`, a subsequent stream failure or cancellation uses Hashbrown's existing conversation recovery/new-thread flow. The durable server store does not rehydrate that acknowledged browser batch or automatically re-answer it.

## Connect Angular and answer a batch

Configure your application's existing provider:

```ts
provideHashbrown({ baseUrl: '/run' });
```

Use the same chat resource that owns your conversation. Read `pendingInterrupts()` and `isResuming()` to show the questions and disable duplicate submissions. A method in that component can answer the complete batch:

```ts
protected answer(decision: 'approve' | 'decline' | 'cancel'): void {
  const batch = this.chat.pendingInterrupts();
  if (!batch) return;
  this.chat.resume({
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
```

```html
@for (item of chat.pendingInterrupts()?.interrupts ?? []; track item.id) {
<p>{{ item.message }}</p>
}
<button
  [disabled]="!chat.pendingInterrupts() || chat.isResuming()"
  (click)="answer('approve')"
>
  Approve
</button>
<button
  [disabled]="!chat.pendingInterrupts() || chat.isResuming()"
  (click)="answer('decline')"
>
  Decline
</button>
<button
  [disabled]="!chat.pendingInterrupts() || chat.isResuming()"
  (click)="answer('cancel')"
>
  Cancel
</button>
```

`batchId` is local browser ownership. Hashbrown sends the protocol interrupt IDs and decisions to .NET; it does not send that local token as a server lookup key. See [interrupt and resume](/docs/angular/concept/interrupt-and-resume) for complete batch and UI ownership rules.

For custom response schemas, validate form answers in your application and validate them again in the server workflow. The reference confirmation store accepts the boolean `approved` object only. Generic interrupt answers are consumed by the application and do not become empty user messages on the native model wire.

## Compatibility checks

The [internal conformance suite](https://github.com/liveloveapp/hashbrown/tree/main/tools/conformance/dotnet) runs both React and Angular against both genuine provider clients with aimock replacing only the model API. It checks native paths/authentication, exact schemas, partial text/JSON/UI, tools, interrupt decisions, duplicate/concurrent/expired resume, failure/cancellation behavior, and durable restart and competing-instance confirmation across all four framework/provider combinations.

Responses-backed .NET clients, Entra authentication, .NET 8/9, automatic native tool approval, browser reload recovery, shared chat-session state, reasoning, activities, and Hashbrown finish-reason metadata are outside this initial tested baseline. Other AG-UI backends can use the [custom provider contract](/docs/angular/platform/custom); AG-UI transport compatibility by itself does not establish all Hashbrown features.
