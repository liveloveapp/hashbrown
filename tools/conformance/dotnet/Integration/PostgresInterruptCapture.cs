namespace Hashbrown.Conformance.Integration;

public sealed partial class PostgresInterruptStore
{
    /// <inheritdoc />
    public async ValueTask<CheckpointCaptureHandle?> StartCaptureAsync(InterruptClaim claim, CancellationToken cancellationToken = default)
    {
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var record = await ReadAsync(connection, $"SELECT b.* FROM {Batches} b WHERE id=@id FOR UPDATE", cancellationToken, ("id", claim.BatchId));
        var now = await NowAsync(connection, cancellationToken);
        if (record is null || record.Token != claim.Token || record.Generation != claim.Generation || record.State is not ("Claimed" or "Declined") || record.State == "Claimed" && record.LeaseUntil <= now) return null;
        await ExecuteAsync(connection, $"UPDATE {Batches} SET capture_token=@token,generation_outcome='Running',observed_at=@now,revision=revision+1 WHERE id=@id AND claim_token=@token AND generation=@generation", cancellationToken,
            ("id", claim.BatchId), ("token", claim.Token), ("generation", claim.Generation), ("now", now));
        await transaction.CommitAsync(cancellationToken);
        return new(claim, record.OriginalRequest, _options);
    }

    /// <inheritdoc />
    public async ValueTask<bool> CompleteCaptureAsync(CheckpointCaptureHandle handle, string outcome, string? snapshot, CancellationToken cancellationToken = default)
    {
        RecoverySerialization.ValidateCapture(handle, outcome, snapshot);
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        var claim = handle.Claim;
        // Every write, including cleanup after effect completion, matches both authorities.
        var changed = await ExecuteAsync(connection, $"UPDATE {Batches} SET generation_outcome=@outcome,terminal_snapshot=CASE WHEN created_at>clock_timestamp()-@retention THEN @snapshot ELSE NULL END,observed_at=clock_timestamp(),revision=revision+1 WHERE id=@id AND claim_token=@token AND capture_token=@token AND generation=@generation AND state<>'Reconciled' AND generation_outcome='Running'", cancellationToken,
            ("id", claim.BatchId), ("token", claim.Token), ("generation", claim.Generation), ("outcome", outcome), ("retention", _options.SnapshotRetention), ("snapshot", snapshot is null ? DBNull.Value : snapshot));
        if (changed == 1) return true;
        await using var command = Command(connection, $"SELECT count(*) FROM {Batches} WHERE id=@id AND claim_token=@token AND capture_token=@token AND generation=@generation AND state<>'Reconciled' AND generation_outcome<>'Running'", ("id", claim.BatchId), ("token", claim.Token), ("generation", claim.Generation));
        return (long)(await command.ExecuteScalarAsync(cancellationToken))! == 1;
    }
}
