using System.Text.Json;
using AGUI.Abstractions;
using Hashbrown.AspNetCore;
using Npgsql;

namespace Hashbrown.Conformance.Testing;

/// <summary>Deterministic retention scenarios against the fixture's isolated real PostgreSQL schema.</summary>
public static class FixtureRetentionControls
{
    /// <summary>Maps test-only scenarios; production recipes copy Integration sources only.</summary>
    public static void Map(WebApplication app, NpgsqlDataSource source, string schema)
    {
        app.MapPost("/__test/retention/{scenario}", async (string scenario, CancellationToken cancellationToken) =>
        {
            var registry = new WorkflowOperationRegistry([new("fixture", 1, _ => true, (_, _) => ValueTask.CompletedTask, (_, _, _) => ValueTask.CompletedTask)]);
            var options = new InterruptStoreOptions { Capacity = 1, CleanupBatchSize = 2, SnapshotRetention = TimeSpan.FromDays(2), AuditRetention = TimeSpan.FromDays(3), TerminalRetention = TimeSpan.FromDays(1) };
            var store = new PostgresInterruptStore(source, registry, schema, options);
            var batches = $"\"{schema}\".interrupt_batches";
            var audit = $"\"{schema}\".interrupt_reconciliation_audit";
            async Task Execute(string sql)
            {
                await using var command = source.CreateCommand(sql);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            async Task<long> Count(string sql)
            {
                await using var command = source.CreateCommand(sql);
                return (long)(await command.ExecuteScalarAsync(cancellationToken))!;
            }
            async Task Seed(string id, string state, string age = "4 days", string lease = "-1 day") => await Execute($"""
                INSERT INTO {batches}(id,scope,thread_id,origin_run_id,fingerprint,operation_name,operation_version,parameters,effect_id,created_at,expires_at,state,claim_token,lease_until,completed_at,original_request,terminal_snapshot)
                VALUES('{id}','fixture','{id}','run',decode('00','hex'),'fixture',1,json_build_object(),'effect-{id}',clock_timestamp()-interval '{age}',clock_timestamp()-interval '1 day','{state}','token',clock_timestamp()+interval '{lease}',clock_timestamp()-interval '{age}','private-original','private-terminal');
                INSERT INTO "{schema}".interrupt_ids(interrupt_id,batch_id) VALUES('interrupt-{id}','{id}');
                """);
            if (scenario == "bounded")
            {
                for (var index = 0; index < 5; index++) await Seed($"expired-{index}", "Completed");
                for (var index = 0; index < 5; index++) await Seed($"ambiguous-{index}", index % 2 == 0 ? "EffectStarted" : "FailedAfterEffect");
                await Execute($"""
                    INSERT INTO {audit}(id,batch_id,scope,actor,recorded_at,prior_state,prior_generation,prior_revision,outcome,reason,evidence_reference,external_quiescence_acknowledged)
                    SELECT 'audit-'||n,'absent','fixture','operator',clock_timestamp()-interval '4 days','EffectStarted',1,1,'Unresolved','reason','evidence',true FROM generate_series(1,5) n;
                    """);
                var first = await store.CleanupAsync(cancellationToken);
                var second = await store.CleanupAsync(cancellationToken);
                var third = await store.CleanupAsync(cancellationToken);
                var fourth = await store.CleanupAsync(cancellationToken);
                var replay = await store.TryClaimAsync("fixture", new RunAgentInput { ThreadId = "expired-0", RunId = "replay", Messages = [], Resume = [new() { InterruptId = "interrupt-expired-0", Status = "cancelled" }] }, cancellationToken);
                return Results.Json(new { first, second, third, fourth, replay = replay.Status, retained = await Count($"SELECT count(*) FROM {batches}"), transcripts = await Count($"SELECT count(*) FROM {batches} WHERE original_request IS NOT NULL OR terminal_snapshot IS NOT NULL"), audits = await Count($"SELECT count(*) FROM {audit}") });
            }
            if (scenario == "independent")
            {
                await Seed("claim", "Claimed", lease: "1 day");
                await Seed("unknown", "FailedAfterEffect");
                await Seed("recent", "Completed", "1 hour");
                await Seed("terminal-before-snapshot", "Completed", "36 hours");
                await Execute($"""
                    INSERT INTO {audit}(id,batch_id,scope,actor,recorded_at,prior_state,prior_generation,prior_revision,outcome,reason,evidence_reference,external_quiescence_acknowledged)
                    VALUES('recent-audit','unknown','fixture','operator',clock_timestamp()-interval '60 hours','EffectStarted',1,1,'Unresolved','reason','evidence',true);
                    """);
                var cleanup = await store.CleanupAsync(cancellationToken);
                var replay = await store.TryClaimAsync("fixture", new RunAgentInput { ThreadId = "unknown", RunId = "replay", Messages = [], Resume = [new() { InterruptId = "interrupt-unknown", Status = "cancelled" }] }, cancellationToken);
                return Results.Json(new { cleanup, retained = await Count($"SELECT count(*) FROM {batches}"), snapshots = await Count($"SELECT count(*) FROM {batches} WHERE terminal_snapshot IS NOT NULL"), audits = await Count($"SELECT count(*) FROM {audit}"), replay = replay.Status });
            }
            if (scenario == "locked")
            {
                await Seed("locked", "Pending");
                await Seed("available", "Pending");
                await using var connection = await source.OpenConnectionAsync(cancellationToken);
                await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
                await using var command = new NpgsqlCommand($"UPDATE {batches} SET expires_at=clock_timestamp()+interval '1 day',lease_until=clock_timestamp()+interval '1 day',state='Claimed' WHERE id='locked'", connection);
                await command.ExecuteNonQueryAsync(cancellationToken);
                var first = await store.CleanupAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                var second = await store.CleanupAsync(cancellationToken);
                return Results.Json(new { first, second, retained = await Count($"SELECT count(*) FROM {batches} WHERE id='locked' AND state='Claimed'") });
            }
            if (scenario == "capacity")
            {
                await Seed("expired", "Completed");
                await Seed("ambiguous", "FailedAfterEffect");
                var rejected = false;
                try { await store.CreateAsync("fixture", new RunAgentInput { ThreadId = "new", RunId = "new", Messages = [] }, new("fixture", 1, JsonSerializer.SerializeToElement(new { })), cancellationToken); }
                catch (InvalidOperationException) { rejected = true; }
                var afterRejection = await Count($"SELECT count(*) FROM {batches}");
                var cleanup = await store.CleanupAsync(cancellationToken);
                return Results.Json(new { rejected, afterRejection, cleanup, remaining = await Count($"SELECT count(*) FROM {batches}") });
            }
            if (scenario == "reconciled")
            {
                await Seed("unknown", "FailedAfterEffect");
                var before = await store.CleanupAsync(cancellationToken);
                var inspection = (await store.InspectAsync(new HashSet<string> { "fixture" }, "unknown", cancellationToken: cancellationToken))!.Checkpoint!;
                var reconciled = await store.ReconcileAsync(new HashSet<string> { "fixture" }, "unknown", "operator", new("FailedAfterEffect", inspection.Generation, inspection.ServerRevision, "ConfirmedNotPerformed", "verified", "case:fixture", true), cancellationToken);
                var immediate = await store.CleanupAsync(cancellationToken);
                await Execute($"UPDATE {batches} SET completed_at=clock_timestamp()-interval '2 days'");
                var expired = await store.CleanupAsync(cancellationToken);
                return Results.Json(new { before, reconciled, immediate, expired, auditRetained = await Count($"SELECT count(*) FROM {audit}") });
            }
            if (scenario == "late-capture")
            {
                var input = new RunAgentInput { ThreadId = "capture", RunId = "origin", Messages = [] };
                var batch = await store.CreateAsync("fixture", input, new("fixture", 1, JsonSerializer.SerializeToElement(new { })), cancellationToken);
                var resumed = JsonSerializer.SerializeToNode(input, AGUIJsonSerializerContext.Default.RunAgentInput)!;
                resumed["resume"] = JsonSerializer.SerializeToNode(batch.Ids.Select(id => new { interruptId = id, status = "resolved", payload = new { approved = true } }));
                var claim = (await store.TryClaimAsync("fixture", JsonSerializer.Deserialize(resumed.ToJsonString(), AGUIJsonSerializerContext.Default.RunAgentInput)!, cancellationToken)).Claim!;
                var handle = (await store.StartCaptureAsync(claim, cancellationToken))!;
                await Execute($"UPDATE {batches} SET created_at=clock_timestamp()-interval '4 days'");
                var cleanup = await store.CleanupAsync(cancellationToken);
                var snapshot = JsonSerializer.Serialize(new { threadId = "capture", messages = Array.Empty<object>() });
                var captured = await store.CompleteCaptureAsync(handle, "Finished", snapshot, cancellationToken);
                return Results.Json(new { cleanup, captured, bytes = await Count($"SELECT count(*) FROM {batches} WHERE original_request IS NOT NULL OR terminal_snapshot IS NOT NULL") });
            }
            if (scenario == "scheduler")
            {
                await Seed("expired", "Completed");
                using var service = new PostgresInterruptCleanupService(store, Microsoft.Extensions.Logging.Abstractions.NullLogger<PostgresInterruptCleanupService>.Instance, TimeSpan.FromMilliseconds(10), TimeSpan.FromSeconds(2));
                await service.StartAsync(cancellationToken);
                try
                {
                    for (var attempt = 0; ; attempt++)
                    {
                        if (await Count($"SELECT count(*) FROM {batches}") == 0) break;
                        if (attempt == 200) throw new InvalidOperationException("Scheduler did not clean idle storage.");
                        await Task.Delay(10, cancellationToken);
                    }
                }
                finally { await service.StopAsync(cancellationToken); }
                return Results.Json(new { remaining = await Count($"SELECT count(*) FROM {batches}") });
            }
            if (scenario == "memory")
            {
                var clock = new FixtureClock();
                var memory = new PendingInterruptStore(clock, registry, options with { Capacity = 5, TerminalRetention = TimeSpan.FromMinutes(1), SnapshotRetention = TimeSpan.FromMinutes(1) });
                var owned = (System.Collections.IDictionary)typeof(PendingInterruptStore).GetField("_pending", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.GetValue(memory)!;
                foreach (var state in new[] { "EffectStarted", "FailedAfterEffect" })
                {
                    var input = new RunAgentInput { ThreadId = state, RunId = "origin", Messages = [] };
                    var batch = await memory.CreateAsync("fixture", input, new("fixture", 1, JsonSerializer.SerializeToElement(new { })), cancellationToken);
                    owned[batch.Id] = FixtureIntegrationReflection.Copy(owned[batch.Id]!, ("State", state), ("CompletedAt", clock.GetUtcNow()), ("OriginalRequest", null), ("TerminalSnapshot", "terminal-only"));
                }
                clock.Advance();
                await memory.CreateAsync("fixture", new RunAgentInput { ThreadId = "trigger", RunId = "new", Messages = [] }, new("fixture", 1, JsonSerializer.SerializeToElement(new { })), cancellationToken);
                return Results.Json(new { ambiguous = owned.Values.Cast<object>().Count(record => FixtureIntegrationReflection.Read<string>(record, "State") is "EffectStarted" or "FailedAfterEffect"), privateSnapshots = owned.Values.Cast<object>().Count(record => FixtureIntegrationReflection.Read<string>(record, "ThreadId") != "trigger" && (FixtureIntegrationReflection.Read<string?>(record, "OriginalRequest") is not null || FixtureIntegrationReflection.Read<string?>(record, "TerminalSnapshot") is not null)) });
            }
            if (scenario == "scheduler-failure")
            {
                await Seed("expired", "Completed");
                await Execute($"""
                    CREATE FUNCTION "{schema}".fixture_cleanup_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private fixture detail'; END $$;
                    CREATE TRIGGER fixture_cleanup_fail BEFORE DELETE ON {batches} FOR EACH ROW EXECUTE FUNCTION "{schema}".fixture_cleanup_fail();
                    """);
                var logger = new MaintenanceLogger();
                using var service = new PostgresInterruptCleanupService(store, logger, TimeSpan.FromMilliseconds(10), TimeSpan.FromSeconds(2));
                await service.StartAsync(cancellationToken);
                try
                {
                    await logger.Failed.Task.WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
                    await Execute($"DROP TRIGGER fixture_cleanup_fail ON {batches}");
                    await logger.Completed.Task.WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
                }
                finally { await service.StopAsync(cancellationToken); }
                return Results.Json(new { remaining = await Count($"SELECT count(*) FROM {batches}"), logs = logger.Messages.ToArray() });
            }
            if (scenario == "cancel")
            {
                await Seed("delete", "Completed");
                await Seed("purge", "EffectStarted");
                await Execute($"""
                    CREATE FUNCTION "{schema}".fixture_cleanup_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(71933021); RETURN NEW; END $$;
                    CREATE TRIGGER fixture_cleanup_wait BEFORE UPDATE ON {batches} FOR EACH ROW EXECUTE FUNCTION "{schema}".fixture_cleanup_wait();
                    """);
                await using var blocker = await source.OpenConnectionAsync(cancellationToken);
                await using var transaction = await blocker.BeginTransactionAsync(cancellationToken);
                await using var gate = new NpgsqlCommand("SELECT pg_advisory_xact_lock(71933021)", blocker);
                await gate.ExecuteNonQueryAsync(cancellationToken);
                using var stop = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                var running = store.CleanupAsync(stop.Token).AsTask();
                for (var attempt = 0; ; attempt++)
                {
                    if (await Count("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=71933021 AND NOT granted") > 0) break;
                    if (attempt == 200) throw new InvalidOperationException("Cleanup did not reach the cancellation barrier.");
                    await Task.Delay(10, cancellationToken);
                }
                stop.Cancel();
                var cancelled = false;
                try { await running; } catch (OperationCanceledException) { cancelled = true; }
                var rollbackRows = await Count($"SELECT count(*) FROM {batches}");
                await transaction.CommitAsync(cancellationToken);
                await Execute($"DROP TRIGGER fixture_cleanup_wait ON {batches}");
                var retry = await store.CleanupAsync(cancellationToken);
                return Results.Json(new { cancelled, rollbackRows, retry });
            }
            return Results.NotFound();
        });
    }

    private sealed class MaintenanceLogger : ILogger<PostgresInterruptCleanupService>
    {
        public readonly TaskCompletionSource Failed = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public readonly TaskCompletionSource Completed = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public readonly System.Collections.Concurrent.ConcurrentQueue<string> Messages = new();
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Messages.Enqueue(formatter(state, exception));
            if (eventId.Id == 7102) Failed.TrySetResult();
            if (eventId.Id == 7100) Completed.TrySetResult();
        }
    }
}
