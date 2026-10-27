#pragma warning disable MAAI001 // Pinned MAF 1.26.0 keyed store/isolation APIs are experimental.
using System.Data.Common;
using System.Text.Json;
using AGUI.Abstractions;
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Hosting;
using Microsoft.Agents.AI.Hosting.AGUI.AspNetCore;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Hashbrown.Conformance.Integration;

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
        return routes.MapAGUIServer(pattern, agent).RequireAuthorization(authorizationPolicy).AddEndpointFilter(async (filter, next) =>
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
                var scope = NativeSessionKey.Required(registration.Scope(http) ?? "");
                var isolation = scope;
                if (input.Resume is { Count: > 0 }) return Results.BadRequest(new { error = "Native approvals are not enabled." });
                _ = NativeSessionKey.Required(input.RunId);
                _ = HashbrownRequestClient.ReadSchema(input);
                var key = new NativeSessionKey(name, scope, input.ThreadId, new Dictionary<string, string> { ["isolation"] = isolation });
                _ = NativeSessionHistory.Normalize(JsonSerializer.Serialize(input, AGUIJsonSerializerContext.Default.RunAgentInput), key, registration.Catalog, registration.Options);
                context = new NativeSessionContext(registration, http, input, scope, isolation);
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
