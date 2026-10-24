using System.Data.Common;
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

    /// <summary>Reads the opaque server claim attached to this HTTP request before streaming.</summary>
    public static InterruptClaim? GetClaim(HttpContext? context) => context?.Items[typeof(InterruptClaim)] as InterruptClaim;

    /// <summary>Validates and claims application-owned confirmations before upstream streaming begins.</summary>
    public static IEndpointConventionBuilder Map(IEndpointRouteBuilder routes, string pattern, AIAgent agent,
        IInterruptStore pending, Func<string> scope, IReadOnlySet<string> serverToolNames)
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
            InterruptClaim? claim = null;
            if (input.Resume is not null)
            {
                try
                {
                    var result = await pending.TryClaimAsync(scope(), input, context.HttpContext.RequestAborted);
                    if (result.Status != 200) return Results.Json(new { error = "Invalid, expired, consumed, or unavailable confirmation batch." }, statusCode: result.Status);
                    claim = result.Claim;
                    context.HttpContext.Items[typeof(InterruptClaim)] = claim;
                }
                catch (Exception exception) when (exception is DbException or TimeoutException)
                {
                    return Results.Json(new { error = "Confirmation storage is unavailable." }, statusCode: 503);
                }
            }
            try
            {
                var result = await next(context);
                return claim is not null && result is IResult stream ? new ClaimedResult(stream, pending, claim) : result;
            }
            catch
            {
                if (claim is not null) await CleanupAsync(context.HttpContext, pending, claim);
                throw;
            }
        });
    }

    private static async ValueTask CleanupAsync(HttpContext context, IInterruptStore pending, InterruptClaim claim)
    {
        // An aborted request must not cancel its own necessary bookkeeping. Never mask a primary failure.
        using var budget = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        try { await pending.FinishAsync(claim, context.RequestAborted.IsCancellationRequested ? InterruptFinish.Cancelled : InterruptFinish.Failed, budget.Token); }
        catch (Exception exception)
        {
            context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("InterruptCleanup").LogWarning(exception, "Confirmation cleanup failed; durable dispatch state is retained.");
        }
    }

    private sealed class ClaimedResult(IResult inner, IInterruptStore pending, InterruptClaim claim) : IResult
    {
        public async Task ExecuteAsync(HttpContext context)
        {
            try { await inner.ExecuteAsync(context); }
            finally { await CleanupAsync(context, pending, claim); }
        }
    }
}
