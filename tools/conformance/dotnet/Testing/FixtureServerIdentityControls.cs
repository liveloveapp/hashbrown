using System.Collections;
using System.Security.Cryptography;
using System.Text.Json;
using AGUI.Abstractions;
using Hashbrown.AspNetCore;
using Npgsql;

namespace Hashbrown.Conformance.Testing;

/// <summary>Exercises configuration replacement against actual stores without model or workflow dispatch.</summary>
public static class FixtureServerIdentityControls
{
    /// <summary>Registers isolated fixture-only compatibility checks.</summary>
    public static void Map(WebApplication app, NpgsqlDataSource? source, string schema, WorkflowOperationRegistry registry)
    {
        MapMigration(app, source, schema, registry);
        app.MapPost("/__test/server-identity", async (HttpContext context) =>
        {
            using var document = await JsonDocument.ParseAsync(context.Request.Body);
            var body = document.RootElement;
            string? Identity(JsonElement config)
            {
                if (config.ValueKind == JsonValueKind.Null) return null;
                var configuration = new ConfigurationBuilder().AddInMemoryCollection(config.EnumerateObject().ToDictionary(property => property.Name, property => property.Value.GetString())).Build();
                return ServerConfigurationIdentity.Create(configuration);
            }
            var from = Identity(body.GetProperty("source"));
            var to = Identity(body.GetProperty("target"));
            var fingerprintBound = true;
            IInterruptStore Store(string? identity)
            {
                var options = new InterruptStoreOptions { CompatibilityIdentity = identity };
                return source is null ? new PendingInterruptStore(TimeProvider.System, registry, options) : new PostgresInterruptStore(source, registry, schema, options);
            }
            async Task<(int Recovery, int Resume)> Check(string? originalIdentity, string? currentIdentity)
            {
                var original = Store(originalIdentity);
                var current = Store(currentIdentity);
                var input = JsonSerializer.Deserialize(body.GetProperty("original"), AGUIJsonSerializerContext.Default.RunAgentInput)!;
                var node = JsonSerializer.SerializeToNode(input, AGUIJsonSerializerContext.Default.RunAgentInput)!;
                node["threadId"] = Guid.NewGuid().ToString("N");
                input = JsonSerializer.Deserialize(node.ToJsonString(), AGUIJsonSerializerContext.Default.RunAgentInput)!;
                var batch = await original.CreateAsync("identity-test", input, new("confirm-airport", 1, JsonSerializer.SerializeToElement(new { code = "PDX" })));
                var legacyFingerprint = SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new RunAgentInput { ThreadId = input.ThreadId, RunId = string.Empty, Messages = input.Messages, Tools = input.Tools, ForwardedProperties = input.ForwardedProperties }, AGUIJsonSerializerContext.Default.RunAgentInput));
                if (source is null)
                {
                    var field = typeof(PendingInterruptStore).GetField("_pending", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!;
                    var destination = (IDictionary)field.GetValue(current)!;
                    foreach (DictionaryEntry entry in (IDictionary)field.GetValue(original)!)
                    {
                        var record = entry.Value!;
                        if (originalIdentity is not null) fingerprintBound &= !FixtureIntegrationReflection.Read<byte[]>(record, "Fingerprint").SequenceEqual(legacyFingerprint);
                        destination.Add(entry.Key, body.TryGetProperty("unavailable", out var unavailable) && unavailable.GetBoolean() ? FixtureIntegrationReflection.Copy(record, ("OriginalRequest", null)) : record);
                    }
                }
                else
                {
                    await using var command = source.CreateCommand($"SELECT fingerprint FROM \"{schema}\".interrupt_batches WHERE id=@id");
                    command.Parameters.AddWithValue("id", batch.Id);
                    var fingerprint = (byte[])(await command.ExecuteScalarAsync())!;
                    if (originalIdentity is not null) fingerprintBound &= !fingerprint.SequenceEqual(legacyFingerprint);
                    if (body.TryGetProperty("unavailable", out var unavailable) && unavailable.GetBoolean())
                    {
                        await using var clear = source.CreateCommand($"UPDATE \"{schema}\".interrupt_batches SET original_request=NULL WHERE id=@id");
                        clear.Parameters.AddWithValue("id", batch.Id);
                        await clear.ExecuteNonQueryAsync();
                    }
                }
                // A new PostgreSQL store instance represents replacement/restart over the same durable row.
                node["resume"] = JsonSerializer.SerializeToNode(batch.Ids.Select(id => new { interruptId = id, status = "resolved", payload = new { approved = true } }));
                var resumed = JsonSerializer.Deserialize(node.ToJsonString(), AGUIJsonSerializerContext.Default.RunAgentInput)!;
                var recovery = await current.RecoverAsync("identity-test", input.ThreadId, new(Tools: input.Tools?.ToArray(), ForwardedProps: input.ForwardedProperties));
                var claim = await current.TryClaimAsync("identity-test", resumed);
                return (recovery.Status, claim.Status);
            }
            var forward = await Check(from, to);
            var reverse = await Check(to, from);
            var same = await Check(from, from);
            int? schemaVersion = null;
            if (source is not null)
            {
                await using var version = source.CreateCommand($"SELECT version FROM \"{schema}\".interrupt_metadata WHERE id=1");
                schemaVersion = (int)(await version.ExecuteScalarAsync())!;
            }
            return Results.Json(new { schemaVersion, sourceIdentity = from, targetIdentity = to, fingerprintBound, recovery = forward.Recovery, resume = forward.Resume, reverseRecovery = reverse.Recovery, reverseResume = reverse.Resume, sameRecovery = same.Recovery, sameResume = same.Resume });
        });
    }

    private static void MapMigration(WebApplication app, NpgsqlDataSource? source, string schema, WorkflowOperationRegistry registry)
    {
        app.MapPost("/__test/server-identity-migration", async (HttpContext context) =>
        {
            if (source is null) return Results.BadRequest();
            var input = (await JsonSerializer.DeserializeAsync(context.Request.Body, AGUIJsonSerializerContext.Default.RunAgentInput))!;
            var legacy = new PostgresInterruptStore(source, registry, schema);
            var batch = await legacy.CreateAsync("migration-test", input, new("confirm-airport", 1, JsonSerializer.SerializeToElement(new { code = "PDX" })));
            // This row has the original v2 fingerprint and no assigned server identity. Removing the
            // nullable v3 column produces the exact prior schema rather than relabeling a bound row.
            await using (var downgrade = source.CreateCommand($"ALTER TABLE \"{schema}\".interrupt_batches DROP COLUMN compatibility_identity; UPDATE \"{schema}\".interrupt_metadata SET version=2 WHERE id=1"))
                await downgrade.ExecuteNonQueryAsync();
            async Task<string> Row()
            {
                await using var command = source.CreateCommand($"SELECT (to_jsonb(b)-'compatibility_identity')::text FROM \"{schema}\".interrupt_batches b WHERE id=@id");
                command.Parameters.AddWithValue("id", batch.Id);
                return (string)(await command.ExecuteScalarAsync())!;
            }
            async Task<int> Version()
            {
                await using var command = source.CreateCommand($"SELECT version FROM \"{schema}\".interrupt_metadata WHERE id=1");
                return (int)(await command.ExecuteScalarAsync())!;
            }
            var beforeVersion = await Version();
            var before = await Row();
            var bound = new PostgresInterruptStore(source, registry, schema, new() { CompatibilityIdentity = "migration-bound-identity" });
            await bound.InitializeAsync();
            var afterVersion = await Version();
            var after = await Row();
            object? identity;
            await using (var command = source.CreateCommand($"SELECT compatibility_identity FROM \"{schema}\".interrupt_batches WHERE id=@id"))
            {
                command.Parameters.AddWithValue("id", batch.Id);
                identity = await command.ExecuteScalarAsync();
            }
            var node = JsonSerializer.SerializeToNode(input, AGUIJsonSerializerContext.Default.RunAgentInput)!;
            node["resume"] = JsonSerializer.SerializeToNode(batch.Ids.Select(id => new { interruptId = id, status = "resolved", payload = new { approved = true } }));
            var resumed = JsonSerializer.Deserialize(node.ToJsonString(), AGUIJsonSerializerContext.Default.RunAgentInput)!;
            var configuration = new ConversationRecoveryConfiguration(Tools: input.Tools?.ToArray(), ForwardedProps: input.ForwardedProperties);
            var boundRecovery = await bound.RecoverAsync("migration-test", input.ThreadId, configuration);
            var boundResume = await bound.TryClaimAsync("migration-test", resumed);
            var legacyRecovery = await legacy.RecoverAsync("migration-test", input.ThreadId, configuration);
            var legacyResume = await legacy.TryClaimAsync("migration-test", resumed);

            node["threadId"] = Guid.NewGuid().ToString("N");
            node["resume"] = null;
            var fresh = JsonSerializer.Deserialize(node.ToJsonString(), AGUIJsonSerializerContext.Default.RunAgentInput)!;
            var freshBatch = await bound.CreateAsync("migration-test", fresh, batch.Checkpoint);
            node["resume"] = JsonSerializer.SerializeToNode(freshBatch.Ids.Select(id => new { interruptId = id, status = "resolved", payload = new { approved = true } }));
            var freshResume = JsonSerializer.Deserialize(node.ToJsonString(), AGUIJsonSerializerContext.Default.RunAgentInput)!;
            byte[] storedFingerprint;
            await using (var command = source.CreateCommand($"SELECT fingerprint FROM \"{schema}\".interrupt_batches WHERE id=@id"))
            {
                command.Parameters.AddWithValue("id", freshBatch.Id);
                storedFingerprint = (byte[])(await command.ExecuteScalarAsync())!;
            }
            var v2NewRowResume = LegacyV2Admission("migration-test", freshResume, new LegacyInterruptRecord(freshBatch, "migration-test", fresh.ThreadId, storedFingerprint, "Pending", null), DateTimeOffset.UtcNow);
            return Results.Json(new { beforeVersion, afterVersion, before, after, identity = identity == DBNull.Value ? null : identity, boundRecovery = boundRecovery.Status, boundResume = boundResume.Status, legacyRecovery = legacyRecovery.Status, legacyResume = legacyResume.Status, v2NewRowResume });
        });
    }

    private sealed record LegacyInterruptRecord(PendingInterrupt Batch, string Scope, string ThreadId, byte[] Fingerprint, string State, DateTimeOffset? LeaseUntil);

    // The pre-v3 admission algorithm, intentionally without a compatibility-identity check.
    private static int LegacyV2Admission(string scope, RunAgentInput input, LegacyInterruptRecord record, DateTimeOffset now)
    {
        if (record.Scope != scope || record.ThreadId != input.ThreadId || record.Batch.ExpiresAt <= now) return 410;
        if (record.State != "Pending" && !(record.State == "Claimed" && record.LeaseUntil <= now)) return 409;
        var fingerprint = SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new RunAgentInput { ThreadId = input.ThreadId, RunId = string.Empty, Messages = input.Messages, Tools = input.Tools, ForwardedProperties = input.ForwardedProperties }, AGUIJsonSerializerContext.Default.RunAgentInput));
        if (!CryptographicOperations.FixedTimeEquals(record.Fingerprint, fingerprint)) return 400;
        var entries = input.Resume!;
        if (entries.Count != record.Batch.Ids.Count || entries.Select(entry => entry.InterruptId).Distinct(StringComparer.Ordinal).Count() != entries.Count || entries.Any(entry => !record.Batch.Ids.Contains(entry.InterruptId, StringComparer.Ordinal))) return 400;
        foreach (var entry in entries)
        {
            if (entry.Status == "cancelled") { if (entry.Payload is not null) return 400; continue; }
            if (entry.Status != "resolved" || entry.Payload is not { ValueKind: JsonValueKind.Object } payload || payload.EnumerateObject().Count() != 1 || !payload.TryGetProperty("approved", out var approved) || approved.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return 400;
        }
        return 200;
    }

}
