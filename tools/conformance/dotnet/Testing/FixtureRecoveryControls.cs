using System.Text;
using System.Text.Json;
using AGUI.Abstractions;
using Hashbrown.Conformance.Integration;
using Npgsql;

namespace Hashbrown.Conformance.Testing;

/// <summary>Loopback test controls for native observer boundaries and isolated database fault injection.</summary>
public static class FixtureRecoveryControls
{
    /// <summary>Registers fixture-only controls. Production applications copy Integration source only.</summary>
    public static void Map(WebApplication app, NpgsqlDataSource? source, string schema, IInterruptStore store)
    {
        app.MapPost("/__test/observe", async (HttpContext context) =>
        {
            using var document = await JsonDocument.ParseAsync(context.Request.Body);
            var body = document.RootElement;
            var input = JsonSerializer.Deserialize(body.GetProperty("original"), AGUIJsonSerializerContext.Default.RunAgentInput)!;
            var options = new InterruptStoreOptions { TerminalSnapshotBytes = body.TryGetProperty("maximumBytes", out var maximum) ? maximum.GetInt32() : 1024 * 1024 };
            var claim = new InterruptClaim("fixture", "fixture", 1, new("fixture", 1, JsonSerializer.SerializeToElement(new { })), "fixture");
            var handle = new CheckpointCaptureHandle(claim, JsonSerializer.Serialize(input, AGUIJsonSerializerContext.Default.RunAgentInput), options);
            string? outcome = null;
            string? snapshot = null;
            var committed = false;
            var committedBeforeTerminal = false;
            var output = new MemoryStream();
            string? error = null;
            var observer = new CheckpointSseObserver(handle, (terminal, final) => { if (body.TryGetProperty("failCommit", out var fail) && fail.GetBoolean()) throw new IOException("Fixture terminal persistence failure"); outcome = terminal; snapshot = final; committed = true; return ValueTask.CompletedTask; });
            try
            {
                foreach (var chunk in body.GetProperty("chunks").EnumerateArray())
                    await observer.ObserveAsync(Convert.FromBase64String(chunk.GetString()!), bytes =>
                    {
                        if (Encoding.UTF8.GetString(bytes.Span).Contains("RUN_FINISHED", StringComparison.Ordinal)) committedBeforeTerminal = committed;
                        output.Write(bytes.Span);
                        return ValueTask.CompletedTask;
                    }, context.RequestAborted);
                await observer.FinishAsync(context.RequestAborted);
            }
            catch (IOException exception) { error = exception.Message; }
            var retained = (System.Text.Json.Nodes.JsonArray)typeof(CheckpointSseObserver).GetField("_messages", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.GetValue(observer)!;
            return Results.Json(new { error, retainedBytes = Encoding.UTF8.GetByteCount(retained.ToJsonString()), outcome, snapshot = snapshot is null ? (JsonElement?)null : JsonSerializer.Deserialize<JsonElement>(snapshot), forwarded = Encoding.UTF8.GetString(output.ToArray()), committedBeforeTerminal });
        });
        app.MapPost("/__test/store-capture-validation", async (HttpContext context) =>
        {
            using var document = await JsonDocument.ParseAsync(context.Request.Body);
            var body = document.RootElement;
            var input = JsonSerializer.Deserialize(body.GetProperty("original"), AGUIJsonSerializerContext.Default.RunAgentInput)!;
            var batch = await store.CreateAsync("direct-validation", input, new("confirm-airport", 1, JsonSerializer.SerializeToElement(new { code = "PDX" })));
            var node = JsonSerializer.SerializeToNode(input, AGUIJsonSerializerContext.Default.RunAgentInput)!;
            node["resume"] = JsonSerializer.SerializeToNode(batch.Ids.Select(id => new { interruptId = id, status = "resolved", payload = new { approved = true } }));
            var resumed = JsonSerializer.Deserialize(node.ToJsonString(), AGUIJsonSerializerContext.Default.RunAgentInput)!;
            var admitted = await store.TryClaimAsync("direct-validation", resumed);
            var handle = (await store.StartCaptureAsync(admitted.Claim!))!;
            var before = await store.RecoverAsync("direct-validation", input.ThreadId, new(Tools: input.Tools?.ToArray(), ForwardedProps: input.ForwardedProperties));
            var rejected = false;
            try { await store.CompleteCaptureAsync(handle, body.GetProperty("outcome").GetString()!, body.TryGetProperty("snapshot", out var snapshot) && snapshot.ValueKind != JsonValueKind.Null ? snapshot.GetRawText() : null); }
            catch (ArgumentException) { rejected = true; }
            var after = await store.RecoverAsync("direct-validation", input.ThreadId, new(Tools: input.Tools?.ToArray(), ForwardedProps: input.ForwardedProperties));
            return Results.Json(new { rejected, before = before.Recovery, after = after.Recovery });
        });
        if (source is null) return;
        FixtureRetentionControls.Map(app, source, schema);
        app.MapPost("/__test/legacy-schema", async () =>
        {
            await using var command = source.CreateCommand($"""
                ALTER TABLE "{schema}".interrupt_batches DROP COLUMN original_request, DROP COLUMN terminal_snapshot, DROP COLUMN generation_outcome,
                    DROP COLUMN revision,DROP COLUMN capture_token,DROP COLUMN observed_at,DROP COLUMN reconciliation_outcome,DROP COLUMN compatibility_identity;
                DROP TABLE "{schema}".interrupt_reconciliation_audit;
                UPDATE "{schema}".interrupt_metadata SET version=1;
                """);
            await command.ExecuteNonQueryAsync();
            return Results.Ok();
        });
        app.MapPost("/__test/schema-version", async (int version) =>
        {
            await using var command = source.CreateCommand($"UPDATE \"{schema}\".interrupt_metadata SET version=@version");
            command.Parameters.AddWithValue("version", version);
            await command.ExecuteNonQueryAsync(); return Results.Ok();
        });
        app.MapPost("/__test/age-retention", async () =>
        {
            await using var command = source.CreateCommand($"UPDATE \"{schema}\".interrupt_batches SET created_at=clock_timestamp()-interval '31 days',completed_at=CASE WHEN completed_at IS NOT NULL THEN clock_timestamp()-interval '31 days' ELSE NULL END");
            await command.ExecuteNonQueryAsync(); return Results.Ok();
        });
        app.MapPost("/__test/fail-terminal", async () =>
        {
            await using var command = source.CreateCommand($"""
                CREATE FUNCTION "{schema}".fixture_fail_terminal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
                IF NEW.generation_outcome='Finished' THEN RAISE EXCEPTION 'Fixture terminal persistence failure'; END IF; RETURN NEW; END $$;
                CREATE TRIGGER fixture_fail_terminal BEFORE UPDATE ON "{schema}".interrupt_batches FOR EACH ROW EXECUTE FUNCTION "{schema}".fixture_fail_terminal();
                """);
            await command.ExecuteNonQueryAsync(); return Results.Ok();
        });
        app.MapPost("/__test/fail-audit", async () =>
        {
            await using var command = source.CreateCommand($"""
                CREATE FUNCTION "{schema}".fixture_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fixture immutable audit persistence failure'; END $$;
                CREATE TRIGGER fixture_fail_audit BEFORE INSERT ON "{schema}".interrupt_reconciliation_audit FOR EACH ROW EXECUTE FUNCTION "{schema}".fixture_fail_audit();
                """);
            await command.ExecuteNonQueryAsync(); return Results.Ok();
        });
    }
}
