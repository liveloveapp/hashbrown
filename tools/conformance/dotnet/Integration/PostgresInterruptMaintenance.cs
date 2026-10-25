using Npgsql;

namespace Hashbrown.Conformance.Integration;

/// <summary>Committed maintenance counts; each category is independently capped by CleanupBatchSize.</summary>
public sealed record InterruptCleanupResult(int MetadataRemoved, int TranscriptsPurged, int AuditsRemoved);

public sealed partial class PostgresInterruptStore
{
    /// <summary>Commits one bounded maintenance pass independently of checkpoint admission, preserving unresolved effects.</summary>
    public async ValueTask<InterruptCleanupResult> CleanupAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var result = await CleanupAsync(connection, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    private async ValueTask<InterruptCleanupResult> CleanupAsync(NpgsqlConnection connection, CancellationToken cancellationToken)
    {
        var now = await NowAsync(connection, cancellationToken);
        const string removable = "((state='Pending' AND expires_at<=@now) OR (state='Claimed' AND expires_at<=@now AND lease_until<=@now) OR (state IN ('Completed','Declined','FailedBeforeEffect','Reconciled') AND completed_at<=@retained))";
        var metadata = await ExecuteAsync(connection, $"""
            WITH expired AS (SELECT id FROM {Batches} WHERE {removable} ORDER BY id LIMIT {_options.CleanupBatchSize} FOR UPDATE SKIP LOCKED)
            DELETE FROM {Batches} WHERE id IN (SELECT id FROM expired) AND {removable}
            """, cancellationToken, ("now", now), ("retained", now - _options.TerminalRetention));
        var transcripts = await ExecuteAsync(connection, $"""
            WITH expired AS (SELECT id FROM {Batches} WHERE created_at<=@snapshot AND (original_request IS NOT NULL OR terminal_snapshot IS NOT NULL) ORDER BY id LIMIT {_options.CleanupBatchSize} FOR UPDATE SKIP LOCKED)
            UPDATE {Batches} SET original_request=NULL,terminal_snapshot=NULL,revision=revision+1
            WHERE id IN (SELECT id FROM expired) AND created_at<=@snapshot AND (original_request IS NOT NULL OR terminal_snapshot IS NOT NULL)
            """, cancellationToken, ("snapshot", now - _options.SnapshotRetention));
        var audits = await ExecuteAsync(connection, $"""
            WITH expired AS (SELECT id FROM {Audit} WHERE recorded_at<=@audit ORDER BY id LIMIT {_options.CleanupBatchSize} FOR UPDATE SKIP LOCKED)
            DELETE FROM {Audit} WHERE id IN (SELECT id FROM expired) AND recorded_at<=@audit
            """, cancellationToken, ("audit", now - _options.AuditRetention));
        return new(metadata, transcripts, audits);
    }
}
