#pragma warning disable MAAI001 // Pinned MAF 1.26.0 native bypass and public session APIs require this narrow compatibility opt-in.
using System.Text.Json;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;

namespace Hashbrown.AspNetCore;

/// <summary>Composes native bypass, application-owned history and durable registered-function fences together.</summary>
public static class NativeSessionAgentFactory
{
  /// <summary>Creates an agent for the authenticated durable endpoint recipe. Tool permissions remain application-owned.</summary>
  public static AIAgent Create(IChatClient client, string name, IEnumerable<AIFunction> functions, NativeToolCatalog catalog, IHttpContextAccessor accessor) =>
      CreateValidated(client, name, functions, catalog, accessor, observer: null);

  /// <summary>Observes the public composition policy using immutable passive diagnostic strings only.</summary>
  internal static AIAgent CreateObservedForTests(IChatClient client, string name, IEnumerable<AIFunction> functions, NativeToolCatalog catalog, IHttpContextAccessor accessor, Action<string> observer)
  {
    ArgumentNullException.ThrowIfNull(observer);
    return CreateValidated(client, name, functions, catalog, accessor, observer);
  }

  private static AIAgent CreateValidated(IChatClient client, string name, IEnumerable<AIFunction> functions, NativeToolCatalog catalog, IHttpContextAccessor accessor, Action<string>? observer)
  {
    ArgumentNullException.ThrowIfNull(client); ArgumentNullException.ThrowIfNull(functions); ArgumentNullException.ThrowIfNull(catalog); ArgumentNullException.ThrowIfNull(accessor);
    name = NativeSessionKey.Required(name);
    var registered = functions.ToArray();
    if (!catalog.MatchesDefinitions(registered.Select(function => (function.Name, function.JsonSchema, function is ApprovalRequiredAIFunction))))
      throw new ArgumentException("Every native wrapper must match its unique registered schema and confirmation requirement.");
    return CreateCore(client, name, registered, catalog, accessor, observer);
  }

  private static AIAgent CreateCore(IChatClient client, string name, AIFunction[] registered, NativeToolCatalog catalog, IHttpContextAccessor accessor, Action<string>? observer)
  {
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
    return new NativeApprovalAgent(agent, catalog, accessor, registered, observer);
  }
}

/// <summary>Private composition proof checked before a route can create native request authority.</summary>
internal interface INativeSessionAgent
{
  NativeToolCatalog Catalog { get; }
  bool SupportsApprovals { get; }
  Action<string>? Observer { get; }
}
