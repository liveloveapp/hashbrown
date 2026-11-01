#pragma warning disable MAAI001 // Pinned MAF 1.26.0 keyed store/isolation APIs are experimental.
using System.Data.Common;
using System.Text.Json;
using AGUI.Abstractions;
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Hosting;
using Microsoft.Agents.AI.Hosting.AGUI.AspNetCore;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Hashbrown.AspNetCore;

/// <summary>Explicit authenticated native-session composition; legacy stateless routes remain independently configured.</summary>
public static class NativeSessionEndpointConfiguration
{
  /// <summary>Registers a stable named durable store, using the explicit trusted scope for native caller isolation. The application initializes and owns journal lifecycle.</summary>
  public static void Configure(IServiceCollection services, string agentName, INativeSessionJournal journal, NativeToolCatalog catalog, Func<HttpContext, string?> scope, NativeSessionOptions? options = null)
  {
    ArgumentNullException.ThrowIfNull(journal); ArgumentNullException.ThrowIfNull(catalog); ArgumentNullException.ThrowIfNull(scope);
    agentName = NativeSessionKey.Required(agentName);
    HashbrownEndpointConfiguration.Configure(services);
    var registration = new NativeSessionRegistration(agentName, journal, catalog, scope, (options ?? new()).Checked());
    services.AddKeyedSingleton(agentName, registration);
    services.AddKeyedSingleton<AgentSessionStore>(agentName, (provider, _) => new NativeMafSessionStore(provider.GetRequiredService<IHttpContextAccessor>()));
    services.TryAddSingleton<AgentIsolationKeyProvider, NativeCallerIsolation>();
  }
  /// <summary>Maps native AG-UI with required authorization, server-owned scope, durable ownership and terminal publication.</summary>
  public static IEndpointConventionBuilder Map(IEndpointRouteBuilder routes, string pattern, AIAgent agent, string authorizationPolicy)
  {
    if (agent is not INativeSessionAgent composed) throw new ArgumentException("Native routes require the matching native factory composition.", nameof(agent));
    authorizationPolicy = NativeSessionKey.Required(authorizationPolicy);
    var name = NativeSessionKey.Required(agent.Name ?? "");
    var endpoint = routes.MapAGUIServer(pattern, agent).RequireAuthorization(authorizationPolicy);
    endpoint.Finally(builder => builder.RequestDelegate = NativeSessionRawRequest.Wrap(builder.RequestDelegate ?? throw new InvalidOperationException("Native endpoint delegate is unavailable."), name));
    return endpoint.AddEndpointFilter(async (filter, next) =>
    {
      var http = filter.HttpContext;
      if (http.User.Identity?.IsAuthenticated != true) return Results.Unauthorized();
      var registration = http.RequestServices.GetRequiredKeyedService<NativeSessionRegistration>(name);
      if (!ReferenceEquals(registration.Catalog, composed.Catalog)) return Results.StatusCode(503);
      var input = filter.Arguments.OfType<RunAgentInput>().FirstOrDefault();
      if (input is null) return Results.BadRequest();
      NativeSessionContext context;
      try
      {
        NativeSessionRawRequest.RequireEquivalentBinding(http, input);
        var scope = NativeSessionKey.Required(registration.Scope(http) ?? "");
        var isolation = scope;
        if (!composed.SupportsApprovals && input.Resume is { Count: > 0 }) return Results.BadRequest(new { error = "Native approvals are not enabled." });
        _ = NativeSessionKey.Required(input.RunId);
        _ = HashbrownRequestClient.ReadSchema(input);
        var key = new NativeSessionKey(name, scope, input.ThreadId, new Dictionary<string, string> { ["isolation"] = isolation });
        var raw = NativeSessionRawRequest.Get(http);
        var recovery = NativeBrowserRecoveryAdmission.Parse(raw, registration.Options);
        if (recovery is not null && registration.Journal is not INativeSessionBrowserRecoveryJournal) return Results.StatusCode(406);
        var admissionRaw = recovery is null ? raw : NativeBrowserRecoveryAdmission.Sanitize(raw, removeResume: false).ToJsonString();
        NativeApprovalAdmissionEnvelope? decisions = input.Resume is { Count: > 0 } ? NativeApprovalAdmission.Parse(admissionRaw, key, registration.Catalog, registration.Options) : null;
        _ = decisions?.CanonicalPublicRequest ?? NativeSessionHistory.Normalize(admissionRaw, key, registration.Catalog, registration.Options);
        context = new NativeSessionContext(registration, http, input, scope, isolation, raw, decisions, recovery, composed.Observer);
        context.Observe("Original.Raw.Before", raw);
        context.ObserveInput("Original.Typed.Before", input);
        if (composed.SupportsApprovals)
        {
          var clone = System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(context.Input, AGUIJsonSerializerContext.Default.RunAgentInput))!.AsObject();
          clone["tools"] = new System.Text.Json.Nodes.JsonArray();
          var upstream = JsonSerializer.Deserialize(clone.ToJsonString(), AGUIJsonSerializerContext.Default.RunAgentInput)!;
          var index = filter.Arguments.IndexOf(input);
          filter.Arguments[index] = upstream;
          context.Observe("Transport.Independent", (!ReferenceEquals(input, upstream) && !ReferenceEquals(input.Messages, upstream.Messages) && input.Messages.Zip(upstream.Messages).All(pair => !ReferenceEquals(pair.First, pair.Second)) && !ReferenceEquals(input.Tools, upstream.Tools)).ToString());
          context.TransportInput = upstream;
          context.ObserveInput("Transport.Typed.Before", upstream);
          context.ObserveInput("Original.Typed.AfterPrepare", input);
        }
        http.Items[typeof(NativeSessionContext)] = context;
      }
      catch (Exception exception) when (exception is ArgumentException or JsonException or InvalidOperationException)
      { return Results.BadRequest(new { error = "Invalid native request or trusted scope." }); }
      try
      {
        var result = await next(filter);
        if (result is IResult stream) return new NativeSessionTerminalResult(stream, context);
        await context.DisposeAsync();
        return Results.StatusCode(503);
      }
      catch (Exception exception) when (exception is NativeSessionRequestException or DbException or TimeoutException)
      {
        await context.DisposeAsync();
        return Results.StatusCode(exception is NativeSessionRequestException request ? request.Status : 503);
      }
      catch { await context.DisposeAsync(); throw; }
    });
  }
  private sealed class NativeCallerIsolation(IHttpContextAccessor accessor) : AgentIsolationKeyProvider
  {
    public override ValueTask<string?> GetIsolationKeyAsync(CancellationToken cancellationToken = default) =>
        ValueTask.FromResult<string?>(NativeSessionContext.Get(accessor.HttpContext)?.Isolation ?? throw new NativeSessionRequestException(409));
  }
}
