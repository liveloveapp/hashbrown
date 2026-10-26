using System.Text.Json;
using System.Text.RegularExpressions;
using AGUI.Abstractions;
using Npgsql;

namespace Hashbrown.Conformance.Integration;

/// <summary>PostgreSQL-backed checkpoints with short transactions, fenced leases, and committed dispatch markers.</summary>
public sealed partial class PostgresInterruptStore : IInterruptStore
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
        int schemaVersion;
        await using (var command = new NpgsqlCommand($"SELECT version FROM {Metadata} WHERE id=1 FOR UPDATE", connection))
        {
            schemaVersion = (int)(await command.ExecuteScalarAsync(cancellationToken))!;
            if (schemaVersion is not (1 or 2 or 3)) throw new InvalidOperationException("Unsupported interrupt schema version.");
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
        if (schemaVersion == 1)
        {
            await ExecuteAsync(connection, $"""
                ALTER TABLE {Batches} DROP CONSTRAINT IF EXISTS interrupt_batches_state_check;
                ALTER TABLE {Batches} ADD CONSTRAINT interrupt_batches_state_check CHECK(state IN ('Pending','Claimed','EffectStarted','Completed','Declined','FailedBeforeEffect','FailedAfterEffect','Reconciled'));
                ALTER TABLE {Batches} ADD COLUMN IF NOT EXISTS original_request text;
                ALTER TABLE {Batches} ADD COLUMN IF NOT EXISTS terminal_snapshot text;
                ALTER TABLE {Batches} ADD COLUMN IF NOT EXISTS generation_outcome text NOT NULL DEFAULT 'NotStarted' CHECK(generation_outcome IN ('NotStarted','Running','Finished','Failed','Interrupted','Unavailable'));
                ALTER TABLE {Batches} ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1 CHECK(revision>0);
                ALTER TABLE {Batches} ADD COLUMN IF NOT EXISTS capture_token text;
                ALTER TABLE {Batches} ADD COLUMN IF NOT EXISTS observed_at timestamptz;
                ALTER TABLE {Batches} ADD COLUMN IF NOT EXISTS reconciliation_outcome text CHECK(reconciliation_outcome IN ('ConfirmedPerformed','ConfirmedNotPerformed','Unresolved'));
                ALTER TABLE {Batches} ADD CONSTRAINT interrupt_reconciled_outcome CHECK((state='Reconciled')=(reconciliation_outcome IS NOT NULL));
                CREATE INDEX IF NOT EXISTS interrupt_thread_latest ON {Batches}(scope,thread_id,created_at DESC);
                CREATE INDEX IF NOT EXISTS interrupt_scoped_list ON {Batches}(scope,id);
                UPDATE {Metadata} SET version=2 WHERE id=1;
                """, cancellationToken);
        }
        if (schemaVersion < 3)
        {
            // NULL retains the original unbound legacy state; migration cannot infer model authority.
            await ExecuteAsync(connection, $"ALTER TABLE {Batches} ADD COLUMN IF NOT EXISTS compatibility_identity text; UPDATE {Metadata} SET version=3 WHERE id=1", cancellationToken);
        }
        await ExecuteAsync(connection, $"""
            CREATE TABLE IF NOT EXISTS {Audit}(
                id text PRIMARY KEY,batch_id text NOT NULL,scope text NOT NULL,actor text NOT NULL,recorded_at timestamptz NOT NULL,
                prior_state text NOT NULL CHECK(prior_state IN ('EffectStarted','FailedAfterEffect')),prior_generation bigint NOT NULL,prior_revision bigint NOT NULL,
                outcome text NOT NULL CHECK(outcome IN ('ConfirmedPerformed','ConfirmedNotPerformed','Unresolved')),
                reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000),evidence_reference text NOT NULL CHECK(length(evidence_reference) BETWEEN 1 AND 2048),
                external_quiescence_acknowledged boolean NOT NULL CHECK(external_quiescence_acknowledged));
            CREATE INDEX IF NOT EXISTS interrupt_audit_scoped_batch ON {Audit}(scope,batch_id,id);
            """, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    /// <inheritdoc />
    public async ValueTask<PendingInterrupt> CreateAsync(string scope, RunAgentInput input, WorkflowCheckpoint checkpoint, CancellationToken cancellationToken = default)
    {
        _ = _registry.Resolve(checkpoint);
        var original = RecoverySerialization.Original(input, _options);
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await ExecuteAsync(connection, $"SELECT id FROM {Metadata} WHERE id=1 FOR UPDATE", cancellationToken);
        await CleanupAsync(connection, cancellationToken);
        var now = await NowAsync(connection, cancellationToken);
        var existing = await ReadAsync(connection, $"SELECT b.* FROM {Batches} b WHERE scope=@scope AND thread_id=@thread AND state IN ('Pending','Claimed','EffectStarted') FOR UPDATE", cancellationToken, ("scope", scope), ("thread", input.ThreadId));
        if (existing is not null)
        {
            if (existing.CompatibilityIdentity != _options.CompatibilityIdentity) throw new InvalidOperationException("The checkpoint server configuration is incompatible.");
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
            INSERT INTO {Batches}(id,scope,thread_id,origin_run_id,fingerprint,operation_name,operation_version,parameters,effect_id,created_at,expires_at,state,original_request,compatibility_identity)
            VALUES(@id,@scope,@thread,@run,@fingerprint,@name,@version,CAST(@parameters AS jsonb),@effect,@now,@expires,'Pending',@original,@identity);
            INSERT INTO {Ids}(interrupt_id,batch_id) SELECT unnest(@ids),@id;
            """, cancellationToken, ("id", id), ("scope", scope), ("thread", input.ThreadId), ("run", input.RunId),
            ("original", original), ("identity", (object?)_options.CompatibilityIdentity ?? DBNull.Value), ("fingerprint", InterruptValidation.Fingerprint(input, _options.CompatibilityIdentity)), ("name", checkpoint.Name), ("version", checkpoint.Version),
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
        var status = InterruptValidation.Validate(scope, input, record, now, _options.CompatibilityIdentity);
        if (status != 200) return new(status);
        try { _ = _registry.Resolve(record.Batch.Checkpoint); }
        catch (InvalidOperationException) { return new(503); }
        var declined = InterruptValidation.Declined(input);
        var claim = new InterruptClaim(record.Batch.Id, Guid.NewGuid().ToString("N"), record.Generation + 1, record.Batch.Checkpoint, record.Batch.EffectId, declined);
        await ExecuteAsync(connection, $"UPDATE {Batches} SET state=@state,claim_token=@token,generation=@generation,lease_until=@lease,completed_at=@completed,revision=revision+1,capture_token=NULL,generation_outcome='NotStarted',terminal_snapshot=NULL WHERE id=@id", cancellationToken,
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
        var changed = await ExecuteAsync(connection, $"UPDATE {Batches} SET state='EffectStarted',revision=revision+1 WHERE id=@id AND claim_token=@token AND generation=@generation AND state='Claimed' AND lease_until>@now AND compatibility_identity IS NOT DISTINCT FROM @identity", cancellationToken,
            ("id", claim.BatchId), ("token", claim.Token), ("generation", claim.Generation), ("now", now), ("identity", (object?)_options.CompatibilityIdentity ?? DBNull.Value));
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
        await ExecuteAsync(connection, $"UPDATE {Batches} SET state=@state,claim_token=@token,lease_until=NULL,completed_at=@completed,revision=revision+1 WHERE id=@id AND claim_token=@oldtoken AND generation=@generation", cancellationToken,
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
                reader.GetInt64(reader.GetOrdinal("generation")), reader.IsDBNull(leaseIndex) ? null : reader.GetFieldValue<DateTimeOffset>(leaseIndex), reader.IsDBNull(completedIndex) ? null : reader.GetFieldValue<DateTimeOffset>(completedIndex),
                reader.IsDBNull(reader.GetOrdinal("original_request")) ? null : reader.GetString(reader.GetOrdinal("original_request")),
                reader.IsDBNull(reader.GetOrdinal("terminal_snapshot")) ? null : reader.GetString(reader.GetOrdinal("terminal_snapshot")),
                reader.GetString(reader.GetOrdinal("generation_outcome")), reader.GetInt64(reader.GetOrdinal("revision")), reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at")),
                reader.IsDBNull(reader.GetOrdinal("capture_token")) ? null : reader.GetString(reader.GetOrdinal("capture_token")),
                reader.IsDBNull(reader.GetOrdinal("reconciliation_outcome")) ? null : reader.GetString(reader.GetOrdinal("reconciliation_outcome")),
                reader.IsDBNull(reader.GetOrdinal("compatibility_identity")) ? null : reader.GetString(reader.GetOrdinal("compatibility_identity")));
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
            if (value == DBNull.Value) parameter.NpgsqlDbType = name is "token" or "snapshot" or "identity" ? NpgsqlTypes.NpgsqlDbType.Text : NpgsqlTypes.NpgsqlDbType.TimestampTz;
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
