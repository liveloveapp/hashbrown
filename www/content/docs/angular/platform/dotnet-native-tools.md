---
title: 'Native .NET mixed tools: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Compose native MAF browser and server tools with authenticated PostgreSQL session ownership and bounded recovery.'
---

# Native .NET mixed tools

Use this opt-in recipe when one model response needs both browser tools and registered .NET functions. Microsoft Agent Framework (MAF) retains its native pending function state while Hashbrown executes browser tools. PostgreSQL owns each continuation and fences server dispatch across replicas and restarts.

The [stateless .NET recipe](/docs/angular/platform/dotnet) remains available for separate browser/server model turns and application workflow confirmations. Native MAF approvals, including `ApprovalRequiredAIFunction`, are unsupported by this composition. Application confirmation is a separate workflow; native approval transport is a later milestone.

## Copy the tested source and pinned dependencies

This is a source recipe. Copy the [Integration C# source](https://github.com/liveloveapp/hashbrown/tree/main/tools/conformance/dotnet/Integration) into your ASP.NET Core application; update those files and startup together. Do not copy `Program.cs`, `Testing/`, fixture authentication or fixture control routes. Use .NET SDK `10.0.402`, a `Microsoft.NET.Sdk.Web` project targeting `net10.0`, nullable/implicit usings enabled, and these exact references. Commit the generated lockfile and restore with `--locked-mode`:

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

The hosting package is a preview. The copied helpers narrowly document and suppress the pinned `MAAI001` experimental session APIs. Upgrade the package set and helpers together and rerun conformance. No private native session fields are accessed.

Use the same [server provider configuration and Azure authentication settings](/docs/angular/platform/dotnet#choose-the-provider-on-the-server) as the existing recipe. Explicitly select `Provider=openai|azure`, `ModelApi=responses|chat-completions`, the matching endpoint and model/deployment. Supply credentials through server secret configuration. Azure CLI and managed identity modes remain server-owned; deployed managed identity qualification is still a separate follow-up. Provider credentials and PostgreSQL connection strings never belong in browser configuration.

## Host the native endpoint

This complete startup assumes your application already signs users into the `app` cookie scheme with a trusted `NameIdentifier` claim. That claim must identify the full caller boundary, including tenant/issuer where necessary; provision it through your authentication system. Serve the browser and endpoint over HTTPS on the same origin. Integrate your existing authentication and request-forgery protection before accepting production requests; this example configures the session scheme and policies, not a sign-in flow.

```csharp
using System.Security.Claims;
using Hashbrown.Conformance.Integration;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.AI;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration["ModelApi"] ??= "responses";
builder.Services.AddAuthentication("app").AddCookie("app", options =>
{
    options.Cookie.HttpOnly = true;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Events = new CookieAuthenticationEvents
    {
        OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        },
        OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        }
    };
});
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("conversation-user", policy => policy.RequireAuthenticatedUser());
    options.AddPolicy("native-session-operator", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("permission", "native-session-operator"));
});

const string AgentName = "ApplicationNativeAssistant";
var functions = new[] { AIFunctionFactory.Create(LookupAirport, "lookupAirport") };
var catalog = new NativeToolCatalog(functions.Select(function =>
    new NativeToolDefinition(function.Name, 1, function.JsonSchema)));
var limits = new NativeSessionOptions
{
    PayloadCapacity = 128,
    SelectorCapacity = 4096,
    Retention = TimeSpan.FromHours(1),
    Lease = TimeSpan.FromSeconds(30)
};
await using var nativeSource = Npgsql.NpgsqlDataSource.Create(
    builder.Configuration.GetConnectionString("NativeSessions")
        ?? throw new InvalidOperationException("Configure the native session database."));
var journal = new PostgresNativeSessionJournal(
    nativeSource, catalog,
    ServerConfigurationIdentity.Create(builder.Configuration),
    schema: "hashbrown", options: limits);
await journal.InitializeAsync();
NativeSessionEndpointConfiguration.Configure(
    builder.Services, AgentName, journal, catalog, Scope, limits);

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

using var client = ProviderFactory.Create(builder.Configuration);
var agent = NativeSessionAgentFactory.Create(
    client, AgentName, functions, catalog,
    app.Services.GetRequiredService<IHttpContextAccessor>());
NativeSessionEndpointConfiguration.Map(
    app, "/run", agent, "conversation-user");

await app.RunAsync();

static string? Scope(HttpContext context) =>
    context.User.Identity?.IsAuthenticated == true
        ? context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        : null;

static object LookupAirport(string code) => new
{
    code,
    name = code == "PDX" ? "Portland International Airport" : "Unknown"
};
```

`NativeSessionEndpointConfiguration.Configure`, `NativeSessionAgentFactory.Create` and `Map` are one composition. Pass the same catalog instance, complete function set, options and stable agent name. Build the catalog from each registered `AIFunction.JsonSchema` and explicit operation version. A hand-written approximation, missing function or mismatched schema is rejected. Browser declarations cannot reuse server names. Increment operation versions when behavior changes; never modify identities to bypass a stored conflict.

The raw `ProviderFactory` client is owned and disposed after the application stops. The pooled `NpgsqlDataSource` also lives through host shutdown. Configure `ConnectionStrings:NativeSessions` through server secrets and use authenticated TLS with certificate validation as described by [Npgsql security](https://www.npgsql.org/doc/security.html). The reference is tested with PostgreSQL 18. `InitializeAsync` must finish before requests are accepted; it safely initializes a separately versioned native schema without converting existing application confirmation checkpoints. Coordinate initialization DDL privileges, runtime data permissions and upgrades across every worker.

`ServerConfigurationIdentity` binds provider, API, effective endpoint and model/deployment without storing secrets. The stable catalog additionally binds operation versions and exact schemas. Credential rotation alone does not change model compatibility. An incompatible existing selector fails before model or function work.

Authentication and a nonempty server-owned scope are both required. `threadId` selects a session; it grants no permissions. Native storage includes the stable agent name, trusted scope and complete native partition set. This helper uses `isolation=scope`. Every additional partition in a customized integration must be preserved exactly in admission, persistence and recovery. Do not accept scope or partitions from the browser.

The airport lookup is read-only. Authorize each privileged tool inside application code against the authenticated caller and its resource permissions before performing an effect. A model proposal or browser tool result never grants server permission. For downstream writes, use the business system's own idempotency/evidence controls as well: the native dispatch fence cannot prove the outcome of an interrupted external operation.

## What happens during a mixed turn

Keep the browser's normal Hashbrown tool declarations and full canonical conversation history. No browser implementation is registered for `lookupAirport`. The composed agent uses native invocable-function bypass plus public empty input/output history filters, so MAF retains pending work without appending a second transcript.

When the model co-emits browser and server calls, the first native stream exposes browser calls while deferred server descriptors remain private. After the browser supplies the exact outstanding results, MAF executes the stored server functions and continues. The journal captures genuine model-emitted descriptors and commits `Started` before entering a registered function. A browser-replayed server call cannot create invocation authority. Duplicate IDs, altered prefixes/arguments, conflicting configuration and unmatched results fail before new work.

The journal atomically saves private native state, the current canonical public transcript and pending call metadata. The endpoint holds the genuine terminal event until that save and publication authorization succeed. Publication CAS cannot retract already-authorized or in-flight terminal bytes. `Publishing` blocks another owner until finalization or terminal retirement after independently verified publisher quiescence. The pinned upstream host alone emits its terminal before saving; attaching a store without this composition does not provide the barrier. Failed or unrepresentable native output withholds terminal success and makes recovery unavailable rather than reconstructing authority from client history.

A restart with the browser still alive may continue by sending its genuine pending tool result to another instance. No historical tool is rerun and no backend operation is replayed to recreate a missing answer. Unknown effect or terminal-publication outcomes remain fenced until an authorized operator establishes external quiescence and evidence.

## Add bounded recovery and operator routes

Insert this block before `await app.RunAsync();` in the startup above. The key builder mirrors the full actual native partition set. The operator policy and allowed scope claims come only from trusted application authentication; a requested route scope cannot grant access.

```csharp
NativeSessionKey Key(string scope, string threadId) => new(
    AgentName, scope, threadId,
    new Dictionary<string, string>(StringComparer.Ordinal) { ["isolation"] = scope });

NativeSessionRecoveryEndpointConfiguration.MapRecovery(
    app, "/threads/{threadId}/native-session", journal, "conversation-user",
    (context, threadId) => Scope(context) is { Length: > 0 } scope
        ? Key(scope, threadId)
        : null,
    limits);
NativeSessionRecoveryEndpointConfiguration.MapOperations(
    app, "/native-sessions", journal, "native-session-operator",
    context => context.User.FindAll("native-session-scope")
        .Select(claim => claim.Value).ToHashSet(StringComparer.Ordinal),
    Scope,
    Key);
```

The recovery route accepts `POST /threads/{threadId}/native-session` with the current `ConversationRecoveryConfiguration` from `getRecoveryConfiguration()`. Use matching core/framework SDK versions. These recovery APIs require SDK 0.8.1 or later; bounded projected diagnostic codes require **0.8.2 or later**. The current qualification consumer uses 0.8.3. See the existing [framework recovery integration](/docs/angular/platform/dotnet#recover-retained-conversations-and-inspect-effects) and send the current system/tool/forwarded configuration; configuration drift prevents snapshot restoration.

Recovery returns a versioned public disposition and server revision, never the opaque native JSON, hidden descriptors or request authority. Restore a completed or otherwise known-safe snapshot only when provided. Ignore stale refresh responses using the existing revision/configuration guards.

A pending browser call after reload returns `NativePendingBrowserResults` with **no snapshot**. `restoreConversation` rejects unresolved executable browser tools. Show the bounded unavailable/pending status, disable sends for that conversation and allow a new thread; do not invent results, restore unresolved history, or automatically rerun browser tools. Busy, unknown, incompatible, expired and retired states likewise cannot authorize execution. This is bounded continuation recovery, not general chat archive storage.

Operators can inspect `GET /native-sessions/{scope}/{threadId}` and submit `NativeSessionReconciliation` to the corresponding `/reconcile` or `/retire` route. Supply the inspected expected state, generation and revision, a bounded reason/evidence reference, and an explicit external-quiescence acknowledgement. Establish that the old worker and downstream operation can no longer act before reconciling uncertainty. These audited transitions are terminal: they never execute, retry or reopen a function. Operator grants should be separate from ordinary conversation access.

## Retention and deployment

Run `journal.MaintainAsync` from an application-owned bounded background job with cancellation and observed failures. Retention limits private payloads; maintenance retains permanent selector tombstones and unknown-effect fences. Defaults above allow 128 live/private payloads and 4096 total selectors, including tombstones, per agent/scope. A new thread uses a new selector, and capacity exhaustion fails closed. Plan scope lifecycle and capacity explicitly; deleting a row to reuse a selector defeats the fence.

Deploy compatible model, agent name, tool catalog and source versions across workers. Stop and drain older workers before changing the native format or compatible catalog versions; there is no rolling mixed-format guarantee. Size leases for your workload; helpers renew request authority, and an expired owner cannot obtain new dispatch or publication authority. Already-authorized or in-flight terminal writes still require finalization or independently verified publisher quiescence before retirement. Never silently turn a missing, expired, retired or incompatible continuation into a fresh session under the same selector.

For cookie authentication, keep secure/HTTP-only cookies, API 401/403 behavior, same-origin deployment and application request-forgery validation. If cross-origin hosting is necessary, allowlist exact trusted HTTPS origins, configure credentialed requests and your cookie/CSRF policy together; never combine credentials with wildcard CORS. Test those application policies with the browser before deployment.

The compiled documentation check builds both provider/API choices with and without recovery against the locked actual Integration source. Deterministic strict-provider tests establish protocol behavior; actual live provider and published-SDK qualification are recorded separately in the [conformance reference](https://github.com/liveloveapp/hashbrown/tree/main/tools/conformance/dotnet).
