using System.Text.Json;
using System.Text.RegularExpressions;
using AGUI.Abstractions;
using Npgsql;

namespace Hashbrown.Conformance.Integration;

/// <summary>PostgreSQL-backed checkpoints with short transactions, fenced leases, and committed dispatch markers.</summary>
public sealed class PostgresInterruptStore : IInterruptStore
{
    private readonly NpgsqlDataSource _source;
    private readonly WorkflowOperationRegistry _registry;
    private readonly InterruptStoreOptions _options;
    private readonly string _schema;
    private string Batches => $"{_schema}.interrupt_batches";
    private string Ids => $"{_schema}.interrupt_ids";
    private string Metadata => $"{_schema}.interrupt_metadata";

    /// <summary>Uses an application-owned pooled data source. Initialize before accepting requests; use a dedicated schema.</summary>
    public PostgresInterruptStore(NpgsqlDataSource source, WorkflowOperationRegistry registry, string schema = "hashbrown", InterruptStoreOptions? options = null)
    {
        if (!Regex.IsMatch(schema, "^[a-z][a-z0-9_]{0,62}$", RegexOptions.CultureInvariant)) throw new ArgumentException("Invalid checkpoint schema.", nameof(schema));
        _source = source;
        _registry = registry;
        _schema = $"\"{schema}\"";
        _options = (options ?? new()).Checked();
    }

    /// <summary>Serializes schema creation across instances and rejects unknown schema versions.</summary>
    public async ValueTask InitializeAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await ExecuteAsync(connection, $"SELECT pg_advisory_xact_lock(hashtextextended(@schema, 0))", cancellationToken, ("schema", _schema));
        await ExecuteAsync(connection, $"CREATE SCHEMA IF NOT EXISTS {_schema}; CREATE TABLE IF NOT EXISTS {Metadata}(id integer PRIMARY KEY CHECK(id=1), version integer NOT NULL); INSERT INTO {Metadata}(id,version) VALUES(1,1) ON CONFLICT DO NOTHING", cancellationToken);
        await using (var command = new NpgsqlCommand($"SELECT version FROM {Metadata} WHERE id=1 FOR UPDATE", connection))
        {
            if ((int)(await command.ExecuteScalarAsync(cancellationToken))! != 1) throw new InvalidOperationException("Unsupported interrupt schema version.");
        }
        await ExecuteAsync(connection, $"""
            CREATE TABLE IF NOT EXISTS {Batches}(
                id text PRIMARY KEY, scope text NOT NULL, thread_id text NOT NULL, origin_run_id text NOT NULL,
                fingerprint bytea NOT NULL, operation_name text NOT NULL, operation_version integer NOT NULL,
                parameters jsonb NOT NULL, effect_id text NOT NULL UNIQUE, created_at timestamptz NOT NULL,
                expires_at timestamptz NOT NULL, state text NOT NULL CHECK(state IN ('Pending','Claimed','EffectStarted','Completed','Declined','FailedBeforeEffect','FailedAfterEffect')),
                claim_token text, generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0), lease_until timestamptz, completed_at timestamptz,
                CHECK(state <> 'Claimed' OR (claim_token IS NOT NULL AND lease_until IS NOT NULL)),
                CHECK(state <> 'EffectStarted' OR claim_token IS NOT NULL));
            CREATE TABLE IF NOT EXISTS {Ids}(interrupt_id text PRIMARY KEY, batch_id text NOT NULL REFERENCES {Batches}(id) ON DELETE CASCADE);
            CREATE INDEX IF NOT EXISTS interrupt_ids_batch ON {Ids}(batch_id);
            CREATE UNIQUE INDEX IF NOT EXISTS interrupt_live_thread ON {Batches}(scope,thread_id) WHERE state IN ('Pending','Claimed','EffectStarted');
            """, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    /// <inheritdoc />
    public async ValueTask<PendingInterrupt> CreateAsync(string scope, RunAgentInput input, WorkflowCheckpoint checkpoint, CancellationToken cancellationToken = default)
    {
        _ = _registry.Resolve(checkpoint);
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await ExecuteAsync(connection, $"SELECT id FROM {Metadata} WHERE id=1 FOR UPDATE", cancellationToken);
        var now = await NowAsync(connection, cancellationToken);
        await ExecuteAsync(connection, $"DELETE FROM {Batches} WHERE (state='Pending' AND expires_at<=@now) OR (state='Claimed' AND expires_at<=@now AND lease_until<=@now) OR (state IN ('Completed','Declined','FailedBeforeEffect','FailedAfterEffect') AND completed_at<=@retained)", cancellationToken, ("now", now), ("retained", now - _options.TerminalRetention));
        var existing = await ReadAsync(connection, $"SELECT b.* FROM {Batches} b WHERE scope=@scope AND thread_id=@thread AND state IN ('Pending','Claimed','EffectStarted') FOR UPDATE", cancellationToken, ("scope", scope), ("thread", input.ThreadId));
        if (existing is not null)
        {
            await transaction.CommitAsync(cancellationToken);
            return existing.Batch;
        }
        await using (var count = new NpgsqlCommand($"SELECT count(*) FROM {Batches}", connection))
        {
            if ((long)(await count.ExecuteScalarAsync(cancellationToken))! >= _options.Capacity) throw new InvalidOperationException("Pending confirmation capacity reached.");
        }
        var id = Guid.NewGuid().ToString("N");
        var effectId = Guid.NewGuid().ToString("N");
        var ids = new[] { Guid.NewGuid().ToString("N"), Guid.NewGuid().ToString("N") }.Order(StringComparer.Ordinal).ToArray();
        await ExecuteAsync(connection, $"""
            INSERT INTO {Batches}(id,scope,thread_id,origin_run_id,fingerprint,operation_name,operation_version,parameters,effect_id,created_at,expires_at,state)
            VALUES(@id,@scope,@thread,@run,@fingerprint,@name,@version,CAST(@parameters AS jsonb),@effect,@now,@expires,'Pending');
            INSERT INTO {Ids}(interrupt_id,batch_id) SELECT unnest(@ids),@id;
            """, cancellationToken, ("id", id), ("scope", scope), ("thread", input.ThreadId), ("run", input.RunId),
            ("fingerprint", InterruptValidation.Fingerprint(input)), ("name", checkpoint.Name), ("version", checkpoint.Version),
            ("parameters", checkpoint.Parameters.GetRawText()), ("effect", effectId), ("now", now), ("expires", now + _options.ApprovalTtl), ("ids", ids));
        await transaction.CommitAsync(cancellationToken);
        return new(id, Array.AsReadOnly(ids), now + _options.ApprovalTtl, checkpoint, effectId);
    }

    /// <inheritdoc />
    public async ValueTask<InterruptClaimResult> TryClaimAsync(string scope, RunAgentInput input, CancellationToken cancellationToken = default)
    {
        if (input.Resume is not { Count: > 0 }) return new(400);
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var record = await ReadAsync(connection, $"SELECT b.* FROM {Batches} b WHERE b.id IN (SELECT batch_id FROM {Ids} WHERE interrupt_id=ANY(@ids)) ORDER BY b.id LIMIT 1 FOR UPDATE", cancellationToken,
            ("ids", input.Resume.Select(entry => entry.InterruptId).ToArray()));
        if (record is null) return new(410);
        // clock_timestamp(), sampled after the row lock, is intentionally not transaction-start now().
        var now = await NowAsync(connection, cancellationToken);
        var status = InterruptValidation.Validate(scope, input, record, now);
        if (status != 200) return new(status);
        try { _ = _registry.Resolve(record.Batch.Checkpoint); }
        catch (InvalidOperationException) { return new(503); }
        var declined = InterruptValidation.Declined(input);
        var claim = new InterruptClaim(record.Batch.Id, Guid.NewGuid().ToString("N"), record.Generation + 1, record.Batch.Checkpoint, record.Batch.EffectId, declined);
        await ExecuteAsync(connection, $"UPDATE {Batches} SET state=@state,claim_token=@token,generation=@generation,lease_until=@lease,completed_at=@completed WHERE id=@id", cancellationToken,
            ("state", declined ? "Declined" : "Claimed"), ("token", claim.Token), ("generation", claim.Generation), ("lease", now + _options.PreparationLease), ("completed", declined ? now : DBNull.Value), ("id", claim.BatchId));
        await transaction.CommitAsync(cancellationToken);
        return new(200, claim);
    }

    /// <inheritdoc />
    public async ValueTask<bool> TryStartEffectAsync(InterruptClaim claim, CancellationToken cancellationToken = default)
    {
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await ExecuteAsync(connection, $"SELECT id FROM {Batches} WHERE id=@id FOR UPDATE", cancellationToken, ("id", claim.BatchId));
        var now = await NowAsync(connection, cancellationToken);
        var changed = await ExecuteAsync(connection, $"UPDATE {Batches} SET state='EffectStarted' WHERE id=@id AND claim_token=@token AND generation=@generation AND state='Claimed' AND lease_until>@now", cancellationToken,
            ("id", claim.BatchId), ("token", claim.Token), ("generation", claim.Generation), ("now", now));
        // No caller may execute if this commit or its acknowledgement fails.
        await transaction.CommitAsync(cancellationToken);
        return changed == 1;
    }

    /// <inheritdoc />
    public async ValueTask FinishAsync(InterruptClaim claim, InterruptFinish finish, CancellationToken cancellationToken = default)
    {
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var record = await ReadAsync(connection, $"SELECT b.* FROM {Batches} b WHERE id=@id FOR UPDATE", cancellationToken, ("id", claim.BatchId));
        if (record is null || record.Token != claim.Token || record.Generation != claim.Generation || record.State is not ("Claimed" or "EffectStarted")) return;
        var now = await NowAsync(connection, cancellationToken);
        if (record.State == "Claimed" && record.LeaseUntil <= now) return;
        var released = finish == InterruptFinish.Cancelled && record.State == "Claimed";
        var state = released ? "Pending" : finish == InterruptFinish.Completed ? "Completed" : record.State == "EffectStarted" ? "FailedAfterEffect" : "FailedBeforeEffect";
        await ExecuteAsync(connection, $"UPDATE {Batches} SET state=@state,claim_token=@token,lease_until=NULL,completed_at=@completed WHERE id=@id AND claim_token=@oldtoken AND generation=@generation", cancellationToken,
            ("state", state), ("token", released ? DBNull.Value : claim.Token), ("completed", released ? DBNull.Value : now), ("id", claim.BatchId), ("oldtoken", claim.Token), ("generation", claim.Generation));
        await transaction.CommitAsync(cancellationToken);
    }

    private async ValueTask<InterruptRecord?> ReadAsync(NpgsqlConnection connection, string sql, CancellationToken cancellationToken, params (string Name, object Value)[] parameters)
    {
        await using var command = Command(connection, sql, parameters);
        InterruptRecord? record;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            if (!await reader.ReadAsync(cancellationToken)) return null;
            var checkpoint = new WorkflowCheckpoint(reader.GetString(reader.GetOrdinal("operation_name")), reader.GetInt32(reader.GetOrdinal("operation_version")), JsonSerializer.Deserialize<JsonElement>(reader.GetString(reader.GetOrdinal("parameters"))));
            var batch = new PendingInterrupt(reader.GetString(reader.GetOrdinal("id")), Array.Empty<string>(), reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("expires_at")), checkpoint, reader.GetString(reader.GetOrdinal("effect_id")));
            var tokenIndex = reader.GetOrdinal("claim_token");
            var leaseIndex = reader.GetOrdinal("lease_until");
            var completedIndex = reader.GetOrdinal("completed_at");
            record = new(batch, reader.GetString(reader.GetOrdinal("scope")), reader.GetString(reader.GetOrdinal("thread_id")), reader.GetString(reader.GetOrdinal("origin_run_id")),
                reader.GetFieldValue<byte[]>(reader.GetOrdinal("fingerprint")), reader.GetString(reader.GetOrdinal("state")), reader.IsDBNull(tokenIndex) ? null : reader.GetString(tokenIndex),
                reader.GetInt64(reader.GetOrdinal("generation")), reader.IsDBNull(leaseIndex) ? null : reader.GetFieldValue<DateTimeOffset>(leaseIndex), reader.IsDBNull(completedIndex) ? null : reader.GetFieldValue<DateTimeOffset>(completedIndex));
        }
        await using var idsCommand = Command(connection, $"SELECT interrupt_id FROM {Ids} WHERE batch_id=@id ORDER BY interrupt_id", ("id", record.Batch.Id));
        var ids = new List<string>();
        await using var idsReader = await idsCommand.ExecuteReaderAsync(cancellationToken);
        while (await idsReader.ReadAsync(cancellationToken)) ids.Add(idsReader.GetString(0));
        return record with { Batch = record.Batch with { Ids = ids.AsReadOnly() } };
    }

    private static NpgsqlCommand Command(NpgsqlConnection connection, string sql, params (string Name, object Value)[] parameters)
    {
        var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters)
        {
            var parameter = command.Parameters.AddWithValue(name, value);
            if (value == DBNull.Value) parameter.NpgsqlDbType = name == "token" ? NpgsqlTypes.NpgsqlDbType.Text : NpgsqlTypes.NpgsqlDbType.TimestampTz;
        }
        return command;
    }

    private static async ValueTask<int> ExecuteAsync(NpgsqlConnection connection, string sql, CancellationToken cancellationToken, params (string Name, object Value)[] parameters)
    {
        await using var command = Command(connection, sql, parameters);
        return await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async ValueTask<DateTimeOffset> NowAsync(NpgsqlConnection connection, CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand("SELECT clock_timestamp()", connection);
        return new DateTimeOffset((DateTime)(await command.ExecuteScalarAsync(cancellationToken))!);
    }
}
