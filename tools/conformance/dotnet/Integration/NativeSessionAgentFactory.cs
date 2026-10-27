#pragma warning disable MAAI001 // Pinned MAF 1.26.0 native bypass and public session APIs require this narrow compatibility opt-in.
using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;

namespace Hashbrown.Conformance.Integration;

/// <summary>Composes native bypass, application-owned history and durable registered-function fences together.</summary>
public static class NativeSessionAgentFactory
{
    /// <summary>Creates an agent for the authenticated durable endpoint recipe. Tool permissions remain application-owned.</summary>
    public static AIAgent Create(IChatClient client, string name, IEnumerable<AIFunction> functions, NativeToolCatalog catalog, IHttpContextAccessor accessor)
    {
        ArgumentNullException.ThrowIfNull(client); ArgumentNullException.ThrowIfNull(functions); ArgumentNullException.ThrowIfNull(catalog); ArgumentNullException.ThrowIfNull(accessor);
        name = NativeSessionKey.Required(name);
        var registered = functions.ToArray();
        if (!catalog.MatchesDefinitions(registered.Select(function => new KeyValuePair<string, JsonElement>(function.Name, function.JsonSchema))) || registered.Any(function => function is ApprovalRequiredAIFunction))
            throw new ArgumentException("Every native function must be unique, catalogued and free of native approval requirements.");
        NativeSessionContext Context() => NativeSessionContext.Get(accessor.HttpContext) ?? throw new NativeSessionRequestException(409);
        var agent = new HashbrownRequestClient(client, () => NativeSessionContext.Get(accessor.HttpContext)).AsAIAgent(new ChatClientAgentOptions
        {
            Name = name,
            EnableInvocableFunctionBypassing = true,
            ChatHistoryProvider = new InMemoryChatHistoryProvider(new()
            {
                StorageInputRequestMessageFilter = _ => [],
                StorageInputResponseMessageFilter = _ => [],
                ProvideOutputMessageFilter = _ => []
            }),
            ChatOptions = new() { Tools = registered.Cast<AITool>().ToList() }
        }).AsBuilder().Use(async (AIAgent owner, FunctionInvocationContext invocation, Func<FunctionInvocationContext, CancellationToken, ValueTask<object?>> next, CancellationToken cancellationToken) =>
        {
            var context = Context();
            try
            {
                var call = await context.StartAsync(invocation.CallContent.CallId, invocation.Function.Name,
                    JsonSerializer.SerializeToElement(invocation.Arguments), AIAgent.CurrentRunContext?.Session, cancellationToken);
                context.Cancellation.ThrowIfCancellationRequested();
                var result = await next(invocation, context.Cancellation);
                await context.CompleteAsync(call, context.Cancellation);
                return result;
            }
            catch { await context.CancelWorkAsync(); throw; }
        }).Build();
        return new NativeGuardAgent(agent, catalog, accessor);
    }
    private sealed class NativeGuardAgent(AIAgent inner, NativeToolCatalog catalog, IHttpContextAccessor accessor) : DelegatingAIAgent(inner), INativeSessionAgent
    {
        NativeToolCatalog INativeSessionAgent.Catalog => catalog;
        protected override async IAsyncEnumerable<AgentResponseUpdate> RunCoreStreamingAsync(IEnumerable<ChatMessage> messages, AgentSession? session, AgentRunOptions? options, [EnumeratorCancellation] CancellationToken cancellationToken)
        {
            var context = NativeSessionContext.Get(accessor.HttpContext) ?? throw new NativeSessionRequestException(409);
            context.RequireSession(session);
            if (!ReferenceEquals(context.Registration.Catalog, catalog)) throw new NativeSessionRequestException(409);
            await foreach (var update in InnerAgent.RunStreamingAsync(messages, session, options, context.Cancellation))
            {
                if (update.Contents.Any(content => content is ToolApprovalRequestContent or ToolApprovalResponseContent)) throw new NotSupportedException("Native approval transport is not enabled by this composition.");
                yield return update;
            }
        }
        protected override Task<AgentResponse> RunCoreAsync(IEnumerable<ChatMessage> messages, AgentSession? session, AgentRunOptions? options, CancellationToken cancellationToken) =>
            throw new NotSupportedException("The native Hashbrown endpoint requires streaming execution.");
    }
}

/// <summary>Private composition proof checked before a route can create native request authority.</summary>
internal interface INativeSessionAgent
{
    NativeToolCatalog Catalog { get; }
}
