using Npgsql;

namespace Hashbrown.Conformance.Integration;

public sealed partial class PostgresInterruptStore
{
    /// <inheritdoc />
    public async ValueTask<CheckpointRecoveryResult> RecoverAsync(string scope, string threadId, ConversationRecoveryConfiguration configuration, CancellationToken cancellationToken = default)
    {
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        var record = await ReadAsync(connection, $"SELECT b.* FROM {Batches} b WHERE scope=@scope AND thread_id=@thread ORDER BY (state IN ('Pending','Claimed','EffectStarted','FailedAfterEffect')) DESC,created_at DESC,id DESC LIMIT 1", cancellationToken, ("scope", scope), ("thread", threadId));
        if (record is null) return new(404);
        try { _ = _registry.Resolve(record.Batch.Checkpoint); }
        catch (InvalidOperationException) { return new(503); }
        return RecoverySerialization.Recover(record, configuration, await NowAsync(connection, cancellationToken), _options);
    }
}
