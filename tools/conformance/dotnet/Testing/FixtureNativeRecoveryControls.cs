using Hashbrown.AspNetCore;
using Npgsql;

namespace Hashbrown.Conformance.Testing;

/// <summary>Finite corruption seams applied only to genuine owned fixture rows; never creates recovery authority.</summary>
public static class FixtureNativeRecoveryControls
{
    /// <summary>Maps explicit authenticated row corruption cases for the isolated source fixture.</summary>
    public static void Map(WebApplication app, NpgsqlDataSource source, string schema, Func<string, string, NativeSessionKey> key)
    {
        app.MapPost("/__test/native-recovery-corruption/{scenario}", async (HttpContext context, string scenario, string threadId) =>
        {
            if (context.User.FindFirst("scope")?.Value is not { } scope) return Results.Unauthorized();
            if (threadId.Length > 1024) return Results.BadRequest();
            var sql = scenario switch
            {
                "bound-descriptor" => $"UPDATE \"{schema}\".native_invocations SET descriptor='{{}}' WHERE session_id=@id",
                "future-capture" => $"UPDATE \"{schema}\".native_invocations SET captured_generation=(SELECT generation+1 FROM \"{schema}\".native_sessions WHERE id=@id) WHERE session_id=@id",
                "future-publication" => $"UPDATE \"{schema}\".native_approval_batches SET published_revision=(SELECT revision+1 FROM \"{schema}\".native_sessions WHERE id=@id) WHERE session_id=@id",
                "unsupported-native" => $"UPDATE \"{schema}\".native_sessions SET payload=jsonb_set(payload::jsonb,'{{nativeJson}}','\"[]\"'::jsonb)::text WHERE id=@id",
                "missing-browser-binding" => $"UPDATE \"{schema}\".native_sessions SET payload=jsonb_set(payload::jsonb,'{{approvals,pendingBatch,batch,browserBindings}}','[]'::jsonb)::text WHERE id=@id",
                _ => null
            };
            if (sql is null) return Results.BadRequest();
            await using var command = source.CreateCommand(sql);
            command.Parameters.AddWithValue("id", key(scope, threadId).Id);
            var changed = await command.ExecuteNonQueryAsync(context.RequestAborted);
            return changed == 1 ? Results.Ok() : Results.Conflict();
        }).RequireAuthorization("recovery");
    }
}
