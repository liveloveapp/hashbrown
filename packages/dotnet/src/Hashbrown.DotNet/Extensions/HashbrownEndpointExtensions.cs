using Hashbrown.DotNet.Services;
using Microsoft.Agents.AI;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using static Microsoft.Agents.AI.ChatHistoryProvider;


namespace Hashbrown.DotNet.Extensions;

/// <summary>
/// Extension methods for mapping Hashbrown agent endpoints.
/// </summary>
public static class HashbrownEndpointExtensions
{
    /// <summary>
    /// Maps a Hashbrown agent endpoint that handles both load-thread and generate operations.
    /// Requires <c>services.AddHashbrown()</c> to be called during service registration.
    /// </summary>
    /// <param name="endpoints">The endpoint route builder.</param>
    /// <param name="pattern">The URL pattern for the endpoint (e.g., "/chat").</param>
    /// <param name="agent">The configured agent to handle generate operations.</param>
    /// <param name="messageProvider">Optional ChatHistoryProvider for thread persistence.</param>
    /// <returns>The endpoint convention builder.</returns>
    public static IEndpointConventionBuilder MapHashbrownAgent(
        this IEndpointRouteBuilder endpoints,
        string pattern,
        AIAgent agent,
        ChatHistoryProvider? messageProvider = null)
    {
        return endpoints.MapPost(pattern, async (HttpContext context) =>
        {
            var service = context.RequestServices.GetRequiredService<IHashbrownAgentService>();
            await service.HandleRequestAsync(context, agent, messageProvider, context.RequestAborted);
        });
    }

}
