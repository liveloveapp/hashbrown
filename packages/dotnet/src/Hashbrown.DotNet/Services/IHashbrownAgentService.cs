using Hashbrown.DotNet.Models;
using Microsoft.Agents.AI;
using Microsoft.AspNetCore.Http;
using static Microsoft.Agents.AI.ChatHistoryProvider;

namespace Hashbrown.DotNet.Services;

/// <summary>
/// Handles Hashbrown agent operations: thread loading and streaming generation.
/// </summary>
public interface IHashbrownAgentService
{
    /// <summary>
    /// Loads a thread and writes the result frames to the HTTP response.
    /// </summary>
    Task HandleLoadThreadAsync(
        HttpContext context,
        CompletionCreateParams request,
        AIAgent agent,
        ChatHistoryProvider? messageStore,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Runs a streaming generation and writes chunk frames to the HTTP response.
    /// </summary>
    Task HandleGenerateAsync(
        HttpContext context,
        CompletionCreateParams request,
        AIAgent agent,
        ChatHistoryProvider? messageStore,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// All-in-one entry point for custom endpoints. Parses the request body, sets streaming
    /// response headers, and dispatches to <see cref="HandleLoadThreadAsync"/> or
    /// <see cref="HandleGenerateAsync"/> based on the <c>operation</c> field.
    /// Returns <c>false</c> and writes a 400 response if the request body is invalid.
    /// </summary>
    /// <example>
    /// Use this when you want a custom endpoint without calling
    /// <c>app.MapHashbrownAgent(...)</c>:
    /// <code>
    /// app.MapPost("/my-chat", async (HttpContext ctx, IHashbrownAgentService svc) =>
    ///     await svc.HandleRequestAsync(ctx, agent, messageProvider));
    /// </code>
    /// </example>
    Task<bool> HandleRequestAsync(
        HttpContext context,
        AIAgent agent,
        ChatHistoryProvider? messageStore = null,
        CancellationToken cancellationToken = default);
}
