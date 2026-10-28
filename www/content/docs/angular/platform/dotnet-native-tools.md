---
title: 'Native .NET mixed tools: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'Compose native MAF browser and server tools with authenticated PostgreSQL session ownership and bounded recovery.'
---

# Native .NET mixed tools

Use this opt-in recipe when one model response needs both browser tools and registered .NET functions. Microsoft Agent Framework (MAF) retains its native pending function state while Hashbrown executes browser tools. PostgreSQL owns each continuation and fences server dispatch across replicas and restarts.

The [stateless .NET recipe](/docs/angular/platform/dotnet) remains available for separate browser/server model turns and application workflow confirmations. This native composition also supports genuine MAF `ApprovalRequiredAIFunction` requests through Hashbrown's generic interrupt controls. Application workflow confirmation and its checkpoint store remain a separate composition.

## Install the pinned preview from a local feed

Use .NET SDK `10.0.402` and a `Microsoft.NET.Sdk.Web` application targeting `net10.0`, with nullable and implicit usings enabled. Add this single exact package reference; its nuspec supplies the tested dependencies. Commit the generated lockfile and restore with `--locked-mode`:

This milestone produces a release-ready local `.nupkg` and `.snupkg`; version `0.1.0-preview.1` is **not published to NuGet.org**. Obtain the qualified artifacts from your release build and place the `.nupkg` in an owned local feed. Configure that feed explicitly, with `Hashbrown.AspNetCore` mapped only to it and the upstream dependencies mapped to your approved upstream feed. Restore using that configuration:

```sh
dotnet restore --configfile NuGet.Config --use-lock-file
dotnet restore --configfile NuGet.Config --locked-mode
```

Your application owns authentication, authorization, PostgreSQL credentials and permissions, provider secrets, and configuration. The package does not provision these services. Stop and drain old workers before the source-to-package upgrade; retain the same agent, catalog, scope and configuration identities. Package versions do not replace workflow schema 3 or native schema 2. Recovery remains read-only, pending mixed browser work cannot cold restore, and uncertain external effects must not be retried automatically. This is a stopped-worker upgrade, with no mixed-version rolling-operation guarantee.

<hb-code-example header="Package reference">

```xml
<ItemGroup>
  <PackageReference Include="Hashbrown.AspNetCore" Version="[0.1.0-preview.1]" />
</ItemGroup>
```

</hb-code-example>

The library and its upstream hosting dependency are previews. The pinned library narrowly documents and suppresses the `MAAI001` experimental session APIs. Upgrade the library pin and application startup together and rerun conformance. No private native session fields are accessed.

Use the same [server provider configuration and Azure authentication settings](/docs/angular/platform/dotnet#choose-the-provider-on-the-server) as the existing recipe. Explicitly select `Provider=openai|azure`, `ModelApi=responses|chat-completions`, the matching endpoint and model/deployment. Supply credentials through server secret configuration. Azure CLI and managed identity modes remain server-owned; deployed managed identity qualification is still a separate follow-up. Provider credentials and PostgreSQL connection strings never belong in browser configuration.

## Host the native endpoint

This complete startup assumes your application already signs users into the `app` cookie scheme with a trusted `NameIdentifier` claim. That claim must identify the full caller boundary, including tenant/issuer where necessary; provision it through your authentication system. Serve the browser and endpoint over HTTPS on the same origin. Integrate your existing authentication and request-forgery protection before accepting production requests; this example configures the session scheme and policies, not a sign-in flow.

<hb-code-example header="ASP.NET Core">

```csharp
using System.Security.Claims;
using Hashbrown.AspNetCore;
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

</hb-code-example>

`NativeSessionEndpointConfiguration.Configure`, `NativeSessionAgentFactory.Create` and `Map` are one composition. Pass the same catalog instance, complete function set, options and stable agent name. Build the catalog from each registered `AIFunction.JsonSchema` and explicit operation version. A hand-written approximation, missing function or mismatched schema is rejected. Browser declarations cannot reuse server names. Increment operation versions when behavior changes; never modify identities to bypass a stored conflict.

The raw `ProviderFactory` client is owned and disposed after the application stops. The pooled `NpgsqlDataSource` also lives through host shutdown. Configure `ConnectionStrings:NativeSessions` through server secrets and use authenticated TLS with certificate validation as described by [Npgsql security](https://www.npgsql.org/doc/security.html). The reference is tested with PostgreSQL 18. `InitializeAsync` must finish before requests are accepted; it safely initializes a separately versioned native schema without converting existing application confirmation checkpoints. Coordinate initialization DDL privileges, runtime data permissions and upgrades across every worker.

`ServerConfigurationIdentity` binds provider, API, effective endpoint and model/deployment without storing secrets. The stable catalog additionally binds operation versions and exact schemas. Credential rotation alone does not change model compatibility. An incompatible existing selector fails before model or function work.

Authentication and a nonempty server-owned scope are both required. `threadId` selects a session; it grants no permissions. Native storage includes the stable agent name, trusted scope and complete native partition set. This helper uses `isolation=scope`. Every additional partition in a customized integration must be preserved exactly in admission, persistence and recovery. Do not accept scope or partitions from the browser.

The airport lookup is read-only. Authorize each privileged tool inside application code against the authenticated caller and its resource permissions before performing an effect. A model proposal or browser tool result never grants server permission. For downstream writes, use the business system's own idempotency/evidence controls as well: the native dispatch fence cannot prove the outcome of an interrupted external operation.

## Require native approval

To require native approval for this registered lookup, replace the `functions` and `catalog` declarations in the startup above with this block. Keep the rest of the startup, authenticated scope, PostgreSQL journal initialization and endpoint composition. The lookup remains read-only; approval demonstrates the native flow and does not grant application permissions.

<hb-code-example header="ASP.NET Core">

```csharp
var functions = new AIFunction[]
{
    new ApprovalRequiredAIFunction(
        AIFunctionFactory.Create(LookupAirport, "lookupAirport"))
};
var catalog = new NativeToolCatalog(functions.Select(function =>
    new NativeToolDefinition(
        function.Name, 1, function.JsonSchema, RequiresConfirmation: true)));
```

</hb-code-example>

The named `RequiresConfirmation: true` argument matches the actual wrapper; the fourth positional parameter is the optional argument validator. The complete factory composition verifies that each registered function's actual wrapper requirement matches the immutable catalog. A mixed protected/unprotected server catalog must record each function's requirement individually; marking an unwrapped function as protected is rejected. Operation versions, schemas and confirmation requirements are part of compatibility. Deploy changes deliberately, never to bypass a retained conflict.

MAF emits the genuine approval request for the registered protected function. The endpoint publishes actionable approval controls only after saving the complete native session, canonical public history and bound pending batch and authorizing terminal publication. Submit one complete decision batch for every current protected request through the existing generic interrupt controls. Each member may be approved, declined or cancelled; all decisions are admitted atomically before native execution. Each `resume` member uses resolved payload exactly `{approved: true}` or `{approved: false}`, or status `cancelled` with no payload. Missing, extra, repeated, stale or changed decisions fail before new model or executor work.

The original raw request and full actual native session key remain the authority boundary: stable agent, authenticated scope, every native partition, server configuration, registered versions and schemas, original call IDs/arguments/parents and complete batch must agree with retained server evidence. The adapter maps admitted decisions back through the original native requests using public MAF APIs. A browser-selected ID, copied server call or typed approval object cannot create permission. Your application must still authorize each operation for the caller and resource.

Declined and cancelled members never enter their registered executor. Cancellation records a distinct `Cancelled` decision and audit disposition while supplying native false approval with the fixed reason `Cancelled by caller.`. Native MAF produces the real rejection result. Cancelling a decision differs from aborting a request. Once a complete batch is consumed, failure cannot reopen it, even if no invocation reached `Started`. Inspect and terminally resolve uncertainty through the scoped operator path; do not replay the saved native session or resend a consumed decision as a retry.

The guarantee is at most one owned executor dispatch for an original call, not exactly-once external effects. A committed dispatch marker cannot establish whether an interrupted downstream operation completed. Use downstream idempotency and evidence, and establish old-worker and external-operation quiescence before terminal reconciliation.

A live native interrupt can cause the current SDK to cancel browser calls co-emitted in the same response. The cancelled original browser handler does not execute. On decision continuation, native MAF settles that original call with its genuine rejection result; the model can request a fresh browser call with a fresh ID, which the SDK can execute once. Do not promise execution of the cancelled original sibling or an automatic fresh call. Keep full canonical history and normal browser declarations.

## What happens during a mixed turn

Keep the browser's normal Hashbrown tool declarations and full canonical conversation history. No browser implementation is registered for `lookupAirport`. The composed agent uses native invocable-function bypass plus public empty input/output history filters, so MAF retains pending work without appending a second transcript.

For a mixed response without a protected approval, the first native stream exposes browser calls while deferred server descriptors remain private. Protected interrupts follow the decision flow above. After the browser supplies the exact outstanding results, MAF executes the stored server functions and continues. The journal captures genuine model-emitted descriptors and commits `Started` before entering a registered function. A browser-replayed server call cannot create invocation authority. Duplicate IDs, altered prefixes/arguments, conflicting configuration and unmatched results fail before new work.

The journal atomically saves private native state, the current canonical public transcript and pending call metadata. The endpoint holds the genuine terminal event until that save and publication authorization succeed. Publication CAS cannot retract already-authorized or in-flight terminal bytes. `Publishing` blocks another owner until finalization or terminal retirement after independently verified publisher quiescence. The pinned upstream host alone emits its terminal before saving; attaching a store without this composition does not provide the barrier. Failed or unrepresentable native output withholds terminal success and makes recovery unavailable rather than reconstructing authority from client history.

A restart with the browser still alive may continue by sending its genuine pending tool result to another instance. No historical tool is rerun and no backend operation is replayed to recreate a missing answer. Unknown effect or terminal-publication outcomes remain fenced until an authorized operator establishes external quiescence and evidence.

## Add bounded recovery and operator routes

Insert this block before `await app.RunAsync();` in the startup above. The key builder mirrors the full actual native partition set. The operator policy and allowed scope claims come only from trusted application authentication; a requested route scope cannot grant access.

<hb-code-example header="ASP.NET Core">

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

</hb-code-example>

The recovery route accepts `POST /threads/{threadId}/native-session` with the current `ConversationRecoveryConfiguration` from `getRecoveryConfiguration()`. Use matching core/framework SDK versions. These recovery APIs require SDK 0.8.1 or later; bounded projected diagnostic codes require **0.8.2 or later**. The current qualification consumer uses 0.8.3. See the existing [framework recovery integration](/docs/angular/platform/dotnet#recover-retained-conversations-and-inspect-effects) and send the current system/tool/forwarded configuration; configuration drift prevents snapshot restoration.

Recovery returns a versioned public disposition and server revision, never the opaque native JSON, hidden descriptors or request authority. Restore a completed or otherwise known-safe snapshot only when provided. Ignore stale refresh responses using the existing revision/configuration guards.

Native-only pending approvals can return a safe published `Pending` snapshot. Restoring it creates a fresh local batch token; recovery lookup and restoration perform no model, executor or browser-handler work. Submit an explicit current decision to continue, including on another worker after restart. Apply the existing configuration and server-revision guards so stale refreshes cannot adopt an old batch. The public recovery response remains schema version 1; this is separate from the native database schema.

**Pending mixed approvals with an unresolved browser sibling cannot be cold-restored.** Recovery returns `Pending` with reason `PendingMixedBrowserResult`, **no snapshot** and no adoptable resumable batch. SDK cancellation annotations do not provide the missing browser result. Show the unavailable reason, disable sends and decision controls for that conversation, and expose an explicit new-thread action. An authorized operator can use the existing terminal retirement path after establishing the required quiescence/evidence. Do not omit the call, invent a result or change tool registration to restore it.

Ordinary pending browser results still return `NativePendingBrowserResults` with **no snapshot**. `restoreConversation` rejects unresolved executable browser tools. Completed canonical histories containing genuine native results remain restorable without rerunning historical work. Busy, unknown, incompatible, expired, retired and missing states never authorize new execution under the same selector. This is bounded continuation recovery, not general chat archive storage.

Operators can inspect `GET /native-sessions/{scope}/{threadId}` and submit `NativeSessionReconciliation` to the corresponding `/reconcile` or `/retire` route. Supply the inspected expected state, generation and revision, a bounded reason/evidence reference, and an explicit external-quiescence acknowledgement. Establish that the old worker and downstream operation can no longer act before reconciling uncertainty. These audited transitions are terminal: they never execute, retry or reopen a function. Operator grants should be separate from ordinary conversation access.

## Retention and deployment

Run `journal.MaintainAsync` from an application-owned bounded background job with cancellation and observed failures. Expiry uses the database clock; caller cancellation timestamps are telemetry. Approval expiry cannot outlive its session. Maintenance purges private native/history/argument payloads while retaining permanent selector tombstones, consumed-decision and invocation fences and bounded audit evidence. Purge does not permit selector or call identity reuse. Defaults remain 128 live/private payloads and 4096 total selectors per agent/scope. Retained fences count toward bounded capacity; deleting a row to reuse a selector defeats the fence.

Input and selector/new-payload-slot capacity known at admission is rejected before model work. New native-output call or descriptor capacity can only be discovered from legitimate model output: a model request may already have occurred. Reject excess capture/allocation before protected dispatch or interrupt/terminal publication, without evicting retained fences, granting partial approval authority or automatically retrying the model. Reaching retained-call capacity does not prohibit a later model turn that needs no new call. Plan scope lifecycle and capacity explicitly.

Fresh initialization uses native schema 2. Stop, drain and establish quiescence of all schema1 workers before migration; there is no overlapping mixed-version rolling-operation guarantee. Native schema2 migration preserves existing dispatch markers, generations, tombstones and audit and is separate from application workflow checkpoint schema3. A new schema version cannot stop an already-running old binary. Deploy compatible model, agent name, tool catalog and source versions across workers. Size leases for your workload; helpers renew request authority, and an expired owner cannot obtain new dispatch or publication authority. Already-authorized or in-flight terminal writes still require finalization or independently verified publisher quiescence before retirement. Never silently turn a missing, expired, retired or incompatible continuation into a fresh session under the same selector.

For cookie authentication, keep secure/HTTP-only cookies, API 401/403 behavior, same-origin deployment and application request-forgery validation. If cross-origin hosting is necessary, allowlist exact trusted HTTPS origins, configure credentialed requests and your cookie/CSRF policy together; never combine credentials with wildcard CORS. Test those application policies with the browser before deployment.

The compiled documentation check is configured to compare identical framework C# blocks and build both provider/API choices with and without native approvals and recovery against the exact local package candidate. Its intended matrix retains the original eight native programs and adds eight approval programs; the separate stateless/application verifier retains its sixteen programs, for thirty-two compiler programs in total. Compilation results must be read from the current check output. Deterministic strict-provider tests establish protocol behavior; actual live provider and published-SDK qualification are recorded separately in the [conformance reference](https://github.com/liveloveapp/hashbrown/tree/main/tools/conformance/dotnet).
