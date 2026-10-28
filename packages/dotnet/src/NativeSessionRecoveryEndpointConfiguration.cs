using System.Data.Common;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using AGUI.Abstractions;

namespace Hashbrown.AspNetCore;

/// <summary>Versioned read-only native disposition containing a snapshot only when safe to restore.</summary>
public sealed record NativeSessionRecovery(int SchemaVersion, string Disposition, long ServerRevision,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ConversationSnapshot? Snapshot = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Reason = null);

/// <summary>Authenticated native recovery and separately scoped terminal operator routes; neither executes tools.</summary>
public static class NativeSessionRecoveryEndpointConfiguration
{
  /// <summary>Maps bounded recovery using the application's complete trusted key and current browser configuration.</summary>
  public static IEndpointConventionBuilder MapRecovery(IEndpointRouteBuilder routes, string pattern, INativeSessionJournal journal,
      string policy, Func<HttpContext, string, NativeSessionKey?> resolveKey, NativeSessionOptions? limits = null)
  {
    ArgumentException.ThrowIfNullOrWhiteSpace(policy);
    ArgumentNullException.ThrowIfNull(resolveKey);
    var maximum = (limits ?? new()).Checked().PublicBytes;
    return routes.MapPost(pattern, async (HttpContext context, string threadId) =>
    {
      context.Response.Headers.CacheControl = "no-store";
      if (context.User.Identity?.IsAuthenticated != true) return Results.Unauthorized();
      try
      {
        var key = resolveKey(context, threadId);
        if (key is null) return Results.Forbid();
        if (key.Selector != threadId) return Results.BadRequest();
        var bytes = await ReadBody(context, maximum);
        if (bytes is null) return Results.StatusCode(413);
        var configuration = JsonSerializer.Deserialize<ConversationRecoveryConfiguration>(bytes, JsonSerializerOptions.Web) ?? throw new JsonException();
        var status = await journal.ReadStatusAsync(key, context.RequestAborted);
        if (status.Status != 200) return Results.StatusCode(status.Status);
        ConversationSnapshot? snapshot = null;
        var disposition = status.State switch
        {
          "Owned" or "Saved" or "Publishing" => "Busy",
          "PublicationUnknown" or "Blocked" => "UnknownEffect",
          "Ready" when status.IsNew => "FailedBeforeEffect",
          "Ready" when status.PendingInterrupts is { Count: > 0 } || status.RecoveryReason == "PendingMixedBrowserResult" => "Pending",
          "Ready" when status.TurnCompleted => "Completed",
          "Ready" => "NativePendingBrowserResults",
          "Expired" => "Expired",
          _ => "Unavailable"
        };
        if (status.PublicRequest is { } original)
        {
          var input = JsonSerializer.Deserialize(original, AGUIJsonSerializerContext.Default.RunAgentInput) ?? throw new JsonException();
          var expected = JsonSerializer.SerializeToElement(new RunAgentInput { ThreadId = "", RunId = "", Tools = input.Tools, ForwardedProperties = input.ForwardedProperties }, AGUIJsonSerializerContext.Default.RunAgentInput);
          var supplied = JsonSerializer.SerializeToElement(new RunAgentInput { ThreadId = "", RunId = "", Tools = configuration.Tools?.ToList(), ForwardedProperties = configuration.ForwardedProps }, AGUIJsonSerializerContext.Default.RunAgentInput);
          var system = input.Messages.FirstOrDefault() as AGUISystemMessage;
          if (!JsonNode.DeepEquals(JsonNode.Parse(expected.GetRawText()), JsonNode.Parse(supplied.GetRawText())) || system?.Content != configuration.System) return Results.Conflict();
          if (disposition == "Completed" || disposition == "Pending" && status.RecoveryReason is null)
          {
            var serialized = JsonSerializer.SerializeToElement(input, AGUIJsonSerializerContext.Default.RunAgentInput);
            snapshot = new(input.ThreadId, serialized.GetProperty("messages").Clone(), input.State?.Clone(), Interrupts: status.PendingInterrupts, ConfiguredSystemMessageId: system?.Id);
          }
        }
        return Results.Json(new NativeSessionRecovery(1, disposition, status.Revision, snapshot, status.RecoveryReason));
      }
      catch (Exception exception) when (exception is ArgumentException or JsonException) { return Results.BadRequest(); }
      catch (Exception exception) when (exception is DbException or TimeoutException) { return Results.StatusCode(503); }
    }).RequireAuthorization(policy);
  }

  /// <summary>Maps safe scoped inspection and audited CAS reconciliation or retirement with explicit external quiescence.</summary>
  public static void MapOperations(IEndpointRouteBuilder routes, string pattern, INativeSessionJournal journal, string policy,
      Func<HttpContext, IReadOnlySet<string>> scopes, Func<HttpContext, string?> actor, Func<string, string, NativeSessionKey> key)
  {
    ArgumentException.ThrowIfNullOrWhiteSpace(policy);
    ArgumentNullException.ThrowIfNull(scopes); ArgumentNullException.ThrowIfNull(actor); ArgumentNullException.ThrowIfNull(key);
    async Task<IResult> Guard(HttpContext context, string scope, string threadId, Func<NativeSessionKey, IReadOnlySet<string>, string, Task<IResult>> action)
    {
      context.Response.Headers.CacheControl = "no-store";
      if (context.User.Identity?.IsAuthenticated != true) return Results.Unauthorized();
      var allowed = scopes(context); var identity = actor(context);
      if (string.IsNullOrWhiteSpace(identity) || identity.Length > 1024 || allowed.Count is 0 or > 100) return Results.Forbid();
      if (!allowed.Contains(scope)) return Results.NotFound();
      try
      {
        var resolved = key(scope, threadId);
        if (resolved.Scope != scope || resolved.Selector != threadId) return Results.BadRequest();
        return await action(resolved, allowed, identity);
      }
      catch (Exception exception) when (exception is ArgumentException or JsonException) { return Results.BadRequest(); }
      catch (Exception exception) when (exception is DbException or TimeoutException) { return Results.StatusCode(503); }
    }
    routes.MapGet(pattern + "/{scope}/{threadId}", (HttpContext context, string scope, string threadId) => Guard(context, scope, threadId, async (resolved, allowed, _) =>
    {
      var text = context.Request.Query["limit"].FirstOrDefault();
      var limit = text is null ? 50 : int.TryParse(text, out var parsed) ? parsed : 0;
      if (limit is < 1 or > 100 || context.Request.QueryString.Value?.Length > 2048) return Results.BadRequest();
      var inspection = await journal.InspectAsync(allowed, resolved, limit, context.RequestAborted);
      return inspection is null ? Results.NotFound() : Results.Json(inspection);
    })).RequireAuthorization(policy);
    foreach (var operation in new[] { "reconcile", "retire" })
      routes.MapPost(pattern + "/{scope}/{threadId}/" + operation, (HttpContext context, string scope, string threadId) => Guard(context, scope, threadId, async (resolved, allowed, identity) =>
      {
        var bytes = await ReadBody(context, 16 * 1024);
        if (bytes is null) return Results.StatusCode(413);
        var request = JsonSerializer.Deserialize<NativeSessionReconciliation>(bytes, JsonSerializerOptions.Web);
        if (request is null) return Results.BadRequest();
        var status = operation == "retire" ? await journal.RetireAsync(allowed, resolved, identity, request, context.RequestAborted)
                  : await journal.ReconcileAsync(allowed, resolved, identity, request, context.RequestAborted);
        return Results.StatusCode(status);
      })).RequireAuthorization(policy);
  }
  private static async Task<byte[]?> ReadBody(HttpContext context, int maximum)
  {
    if (context.Request.ContentLength > maximum) return null;
    using var stream = new MemoryStream(); var buffer = new byte[8192]; int read;
    while ((read = await context.Request.Body.ReadAsync(buffer, context.RequestAborted)) > 0)
    {
      if (stream.Length + read > maximum) return null;
      stream.Write(buffer, 0, read);
    }
    return stream.ToArray();
  }
}
