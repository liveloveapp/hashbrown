#pragma warning disable MAAI001 // Pinned MAF 1.26.0 public session serialization/store boundary is experimental.
using System.Text.Json;
using Microsoft.Agents.AI;

namespace Hashbrown.AspNetCore;

/// <summary>Adapts the native public opaque session API to the owned durable journal.</summary>
internal sealed class NativeMafSessionStore(IHttpContextAccessor accessor) : AgentSessionStore
{
  private NativeSessionContext Context => NativeSessionContext.Get(accessor.HttpContext) ?? throw new NativeSessionRequestException(409);
  /// <inheritdoc />
  public override async ValueTask<AgentSession> GetOrCreateSessionAsync(AIAgent agent, AgentSessionStoreKey key, CancellationToken cancellationToken = default)
  {
    var session = await GetSessionAsync(agent, key, cancellationToken);
    if (session is not null) return session;
    if (Context.Admission?.IsNew != true) throw new NativeSessionRequestException(503);
    session = await agent.CreateSessionAsync(cancellationToken: Context.Cancellation);
    Context.Bind(session);
    return session;
  }
  /// <inheritdoc />
  public override async ValueTask<AgentSession?> GetSessionAsync(AIAgent agent, AgentSessionStoreKey key, CancellationToken cancellationToken = default)
  {
    var context = Context;
    await context.AdmitAsync(agent, key, cancellationToken);
    if (context.Admission!.IsNew)
    {
      if (context.Admission.Snapshot?.NativeJson is not null) throw new NativeSessionRequestException(503);
      return null;
    }
    if (context.Admission.Snapshot?.NativeJson is not { } json) throw new NativeSessionRequestException(503);
    try
    {
      using var document = JsonDocument.Parse(json);
      var session = await agent.DeserializeSessionAsync(document.RootElement, cancellationToken: context.Cancellation);
      context.Bind(session);
      return session;
    }
    catch (Exception exception) when (exception is JsonException or ArgumentException or InvalidOperationException or NotSupportedException) { throw new NativeSessionRequestException(503); }
  }
  /// <inheritdoc />
  public override async ValueTask SaveSessionAsync(AIAgent agent, AgentSessionStoreKey key, AgentSession session, CancellationToken cancellationToken = default)
  {
    var context = Context;
    context.Require(agent, key, session);
    if (context.Receipt is not null) throw new NativeSessionRequestException(409);
    var projection = context.Projection ?? throw new NativeSessionRequestException(503);
    projection.Complete();
    var projected = projection.Result;
    if (!projected.Available || projected.PublicRequestJson is null)
    {
      context.Http.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("NativeSessionSave").LogWarning("Native projection unavailable before save; terminal type {TerminalType}, outcome {TerminalOutcome}.", projected.TerminalType, projected.TerminalOutcome);
      throw new NativeSessionRequestException(503);
    }
    NativeApprovalSnapshot approvals = NativeApprovalSnapshot.Empty;
    if (context.CapturedApprovalBatch is { } batch)
    {
      var locations = new Dictionary<string, NativePublicCallLocation>(StringComparer.Ordinal);
      foreach (var member in batch.ProtectedRequests.Select(item => (item.RequestId, CallId: item.Call.Id)).Concat(batch.BrowserBindings.Select(item => (item.RequestId, item.CallId))))
      {
        var location = projection.PublicLocation(member.CallId) ?? throw new NativeSessionRequestException(503);
        locations.Add(member.RequestId, new(location.Parent, location.MessageIndex, location.CallIndex));
      }
      approvals = new(new NativeBoundApprovalBatch(batch, locations));
    }
    var json = await agent.SerializeSessionAsync(session, cancellationToken: context.Cancellation);
    context.Receipt = await context.Registration.Journal.SaveAsync(context.Lease,
        new NativeSessionSave(json.GetRawText(), projected.PublicRequestJson, context.PendingCalls(), projected.ExpectedBrowserCallIds, projected.TurnCompleted, approvals), context.Cancellation)
        ?? throw new NativeSessionRequestException(409);
  }
  /// <inheritdoc />
  public override ValueTask DeleteSessionAsync(AIAgent agent, AgentSessionStoreKey key, CancellationToken cancellationToken = default) =>
      throw new NotSupportedException("Native selectors require scoped terminal retirement with quiescence evidence.");
}
