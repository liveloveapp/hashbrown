using AGUI.Abstractions;
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Hosting.AGUI.AspNetCore;

namespace Hashbrown.Conformance.Integration;

/// <summary>Reference configuration composed with the upstream ASP.NET AG-UI integration.</summary>
public static class HashbrownEndpointConfiguration
{
    /// <summary>Registers upstream hosting and native interrupt polymorphism for this package baseline.</summary>
    public static void Configure(IServiceCollection services)
    {
        services.AddAGUIServer();
        services.AddHttpContextAccessor();
        services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
            AGUIJsonUtilities.RegisterInterruptContentTypes(options.SerializerOptions));
    }

    /// <summary>Validates application-owned request semantics before the upstream endpoint starts streaming.</summary>
    public static IEndpointConventionBuilder Map(IEndpointRouteBuilder routes, string pattern, AIAgent agent,
        PendingInterruptStore pending, Func<string> scope, IReadOnlySet<string> serverToolNames)
    {
        return routes.MapAGUIServer(pattern, agent).AddEndpointFilter(async (context, next) =>
        {
            var input = context.Arguments.OfType<RunAgentInput>().FirstOrDefault();
            if (input is null) return Results.BadRequest();
            try
            {
                _ = HashbrownRequestClient.ReadSchema(input);
                if (input.Tools?.Any(tool => serverToolNames.Contains(tool.Name)) == true)
                    return Results.BadRequest(new { error = "Browser and server tool names must be disjoint." });
            }
            catch (ArgumentException exception) { return Results.BadRequest(new { error = exception.Message }); }
            if (input.Resume is not null)
            {
                var status = pending.TryClaim(scope(), input);
                if (status != 200) return Results.Json(new { error = "Invalid, expired, or consumed confirmation batch." }, statusCode: status);
            }
            try
            {
                var result = await next(context);
                return input.Resume is not null && result is IResult stream
                    ? new ClaimedResult(stream, pending, scope(), input) : result;
            }
            catch
            {
                if (input.Resume is not null) pending.Finish(scope(), input, context.HttpContext.RequestAborted.IsCancellationRequested);
                throw;
            }
        });
    }
    private sealed class ClaimedResult(IResult inner, PendingInterruptStore pending, string scope, RunAgentInput input) : IResult
    {
        public async Task ExecuteAsync(HttpContext context)
        {
            try { await inner.ExecuteAsync(context); }
            finally { pending.Finish(scope, input, context.RequestAborted.IsCancellationRequested); }
        }
    }
}
