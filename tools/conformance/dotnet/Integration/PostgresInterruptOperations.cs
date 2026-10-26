using Npgsql;

namespace Hashbrown.Conformance.Integration;

public sealed partial class PostgresInterruptStore
{
    private string Audit => $"{_schema}.interrupt_reconciliation_audit";

    /// <inheritdoc />
    public async ValueTask<CheckpointPage> ListAsync(IReadOnlySet<string> scopes, int limit = 50, string? cursor = null, string? state = null, CancellationToken cancellationToken = default)
    {
        CheckpointSummaries.ValidatePage(scopes, limit, cursor, state);
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        var records = new List<CheckpointSummary>();
        // IDs are read first to avoid nested readers; every detail lookup is constrained again by scopes.
        await using var command = Command(connection, $"SELECT id FROM {Batches} WHERE scope=ANY(@scopes) AND id>@cursor AND (@state='' OR state=@state) ORDER BY id LIMIT @limit", ("scopes", scopes.ToArray()), ("cursor", cursor ?? ""), ("state", state ?? ""), ("limit", limit + 1));
        var ids = new List<string>();
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken)) while (await reader.ReadAsync(cancellationToken)) ids.Add(reader.GetString(0));
        foreach (var id in ids.Take(limit))
        {
            var record = await ReadAsync(connection, $"SELECT b.* FROM {Batches} b WHERE id=@id AND scope=ANY(@scopes)", cancellationToken, ("id", id), ("scopes", scopes.ToArray()));
            if (record is not null) records.Add(CheckpointSummaries.Summary(record));
        }
        return new(records, ids.Count > limit ? ids[limit - 1] : null);
    }

    /// <inheritdoc />
    public async ValueTask<CheckpointInspection?> InspectAsync(IReadOnlySet<string> scopes, string batchId, int limit = 50, string? cursor = null, CancellationToken cancellationToken = default)
    {
        CheckpointSummaries.ValidatePage(scopes, limit, cursor);
        if (batchId.Length > 64) throw new ArgumentException("Invalid checkpoint identity.");
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        var record = await ReadAsync(connection, $"SELECT b.* FROM {Batches} b WHERE id=@id AND scope=ANY(@scopes)", cancellationToken, ("id", batchId), ("scopes", scopes.ToArray()));
        var audit = new List<CheckpointAudit>();
        await using var command = Command(connection, $"SELECT * FROM {Audit} WHERE batch_id=@id AND scope=ANY(@scopes) AND id>@cursor ORDER BY id LIMIT @limit", ("id", batchId), ("scopes", scopes.ToArray()), ("cursor", cursor ?? ""), ("limit", limit + 1));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) audit.Add(new(reader.GetString(reader.GetOrdinal("id")), batchId, reader.GetString(reader.GetOrdinal("actor")), reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("recorded_at")), reader.GetString(reader.GetOrdinal("prior_state")), reader.GetInt64(reader.GetOrdinal("prior_generation")), reader.GetInt64(reader.GetOrdinal("prior_revision")), reader.GetString(reader.GetOrdinal("outcome")), reader.GetString(reader.GetOrdinal("reason")), reader.GetString(reader.GetOrdinal("evidence_reference")), reader.GetBoolean(reader.GetOrdinal("external_quiescence_acknowledged"))));
        if (record is null && audit.Count == 0) return null;
        return new(record is null ? null : CheckpointSummaries.Summary(record), audit.Take(limit).ToArray(), audit.Count > limit ? audit[limit - 1].Id : null);
    }

    /// <inheritdoc />
    public async ValueTask<int> ReconcileAsync(IReadOnlySet<string> scopes, string batchId, string actor, CheckpointReconciliation request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actor) || actor.Length > 512 || scopes.Count is < 1 or > 100) return 400;
        if (!request.Valid) return 400;
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var record = await ReadAsync(connection, $"SELECT b.* FROM {Batches} b WHERE id=@id AND scope=ANY(@scopes) FOR UPDATE", cancellationToken, ("id", batchId), ("scopes", scopes.ToArray()));
        if (record is null) return 404;
        if (record.State != request.ExpectedState || record.Generation != request.ExpectedGeneration || record.Revision != request.ExpectedRevision || record.State is not ("EffectStarted" or "FailedAfterEffect")) return 409;
        var now = await NowAsync(connection, cancellationToken);
        await ExecuteAsync(connection, $"""
            INSERT INTO {Audit}(id,batch_id,scope,actor,recorded_at,prior_state,prior_generation,prior_revision,outcome,reason,evidence_reference,external_quiescence_acknowledged)
            VALUES(@audit,@id,@scope,@actor,@now,@state,@generation,@revision,@outcome,@reason,@evidence,true);
            UPDATE {Batches} SET state='Reconciled',reconciliation_outcome=@outcome,revision=revision+1,generation=generation+1,claim_token=NULL,capture_token=NULL,lease_until=NULL,completed_at=@now,generation_outcome=CASE WHEN generation_outcome='Running' THEN 'Unavailable' ELSE generation_outcome END WHERE id=@id;
            """, cancellationToken, ("audit", Guid.NewGuid().ToString("N")), ("id", batchId), ("scope", record.Scope), ("actor", actor), ("now", now), ("state", record.State), ("generation", record.Generation), ("revision", record.Revision), ("outcome", request.Outcome), ("reason", request.Reason), ("evidence", request.EvidenceReference));
        await transaction.CommitAsync(cancellationToken);
        return 200;
    }
}
