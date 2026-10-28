using System.Data.Common;
using System.Text.Json;

namespace Hashbrown.AspNetCore;

/// <summary>Explicit authenticated opt-in read-only recovery routes. Applications own all scope resolution.</summary>
public static class RecoveryEndpointConfiguration
{
  /// <summary>Maps a bounded read-only query. A required authorization policy and authenticated server scope resolver fail closed.</summary>
  public static IEndpointConventionBuilder MapRecovery(IEndpointRouteBuilder routes, string pattern, IInterruptStore store,
      string authorizationPolicy, Func<HttpContext, string?> resolveScope, InterruptStoreOptions? limits = null)
  {
    ArgumentException.ThrowIfNullOrWhiteSpace(authorizationPolicy);
    ArgumentNullException.ThrowIfNull(resolveScope);
    var maximumQueryBytes = (limits ?? new()).Checked().RecoveryQueryBytes;
    return routes.MapPost(pattern, async (HttpContext context, string threadId) =>
    {
      context.Response.Headers.CacheControl = "no-store";
      if (context.User.Identity?.IsAuthenticated != true) return Results.Unauthorized();
      var scope = resolveScope(context);
      if (string.IsNullOrWhiteSpace(scope)) return Results.Forbid();
      if (string.IsNullOrWhiteSpace(threadId) || threadId.Length > 512) return Results.BadRequest();
      try
      {
        if (context.Request.ContentLength > maximumQueryBytes) return Results.StatusCode(413);
        using var body = new MemoryStream();
        var buffer = new byte[8192];
        int read;
        while ((read = await context.Request.Body.ReadAsync(buffer, context.RequestAborted)) > 0)
        {
          if (body.Length + read > maximumQueryBytes) return Results.StatusCode(413);
          body.Write(buffer, 0, read);
        }
        var configuration = JsonSerializer.Deserialize<ConversationRecoveryConfiguration>(body.ToArray(), JsonSerializerOptions.Web) ?? throw new JsonException();
        var result = await store.RecoverAsync(scope, threadId, configuration, context.RequestAborted);
        return result.Recovery is null ? Results.StatusCode(result.Status) : Results.Json(result.Recovery, statusCode: result.Status);
      }
      catch (JsonException) { return Results.BadRequest(); }
      catch (Exception exception) when (exception is DbException or TimeoutException) { return Results.StatusCode(503); }
    }).RequireAuthorization(authorizationPolicy);
  }

  /// <summary>Maps separately authorized bounded inspection and terminal reconciliation. All authority comes from authenticated server resolvers.</summary>
  public static void MapOperations(IEndpointRouteBuilder routes, string pattern, IInterruptStore store, string authorizationPolicy,
      Func<HttpContext, IReadOnlySet<string>> resolveScopes, Func<HttpContext, string?> resolveActor)
  {
    ArgumentException.ThrowIfNullOrWhiteSpace(authorizationPolicy);
    ArgumentNullException.ThrowIfNull(resolveScopes);
    ArgumentNullException.ThrowIfNull(resolveActor);
    async Task<IResult> Guard(HttpContext context, Func<IReadOnlySet<string>, string, Task<IResult>> action)
    {
      context.Response.Headers.CacheControl = "no-store";
      if (context.User.Identity?.IsAuthenticated != true) return Results.Unauthorized();
      var actor = resolveActor(context);
      var scopes = resolveScopes(context);
      if (string.IsNullOrWhiteSpace(actor) || actor.Length > 512 || scopes.Count == 0 || scopes.Count > 100 || scopes.Any(scope => string.IsNullOrWhiteSpace(scope) || scope.Length > 512)) return Results.Forbid();
      try { return await action(scopes, actor); }
      catch (JsonException) { return Results.BadRequest(); }
      catch (Exception exception) when (exception is DbException or TimeoutException) { return Results.StatusCode(503); }
    }
    bool Page(HttpContext context, out int limit, out string? cursor)
    {
      var value = context.Request.Query["limit"].FirstOrDefault();
      limit = value is null ? 50 : int.TryParse(value, out var parsed) ? parsed : 0;
      cursor = context.Request.Query["cursor"].FirstOrDefault();
      return limit is > 0 and <= 100 && (cursor is null || cursor.Length == 32 && cursor.All(Uri.IsHexDigit)) && context.Request.QueryString.Value?.Length is not > 2048;
    }
    routes.MapGet(pattern, (Func<HttpContext, Task<IResult>>)((HttpContext context) => Guard(context, async (scopes, _) =>
    {
      if (!Page(context, out var limit, out var cursor)) return Results.BadRequest();
      var state = context.Request.Query["state"].FirstOrDefault();
      if (!CheckpointSummaries.State(state)) return Results.BadRequest();
      return Results.Json(await store.ListAsync(scopes, limit, cursor, state, context.RequestAborted));
    }))).RequireAuthorization(authorizationPolicy);
    routes.MapGet(pattern + "/{batchId}", (HttpContext context, string batchId) => Guard(context, async (scopes, _) =>
    {
      if (!Page(context, out var limit, out var cursor) || batchId.Length > 64) return Results.BadRequest();
      var inspection = await store.InspectAsync(scopes, batchId, limit, cursor, context.RequestAborted);
      return inspection is null ? Results.NotFound() : Results.Json(inspection);
    })).RequireAuthorization(authorizationPolicy);
    routes.MapPost(pattern + "/{batchId}/reconcile", (HttpContext context, string batchId) => Guard(context, async (scopes, actor) =>
    {
      if (batchId.Length > 64) return Results.BadRequest();
      if (context.Request.ContentLength > 16 * 1024) return Results.StatusCode(413);
      using var bytes = new MemoryStream();
      var buffer = new byte[4096];
      int read;
      while ((read = await context.Request.Body.ReadAsync(buffer, context.RequestAborted)) > 0)
      {
        if (bytes.Length + read > 16 * 1024) return Results.StatusCode(413);
        bytes.Write(buffer, 0, read);
      }
      var request = JsonSerializer.Deserialize<CheckpointReconciliation>(bytes.ToArray(), JsonSerializerOptions.Web);
      if (request is null || !request.Valid) return Results.BadRequest();
      var status = await store.ReconcileAsync(scopes, batchId, actor, request, context.RequestAborted);
      return Results.StatusCode(status);
    })).RequireAuthorization(authorizationPolicy);
  }
}
