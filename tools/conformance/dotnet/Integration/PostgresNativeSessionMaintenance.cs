using Npgsql;

namespace Hashbrown.Conformance.Integration;

public sealed partial class PostgresNativeSessionJournal
{
    /// <inheritdoc />
    public async ValueTask<int> MaintainAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await RequireSchemaVersion(connection, cancellationToken);
        var rows = new List<(string Id, string State)>();
        // Row locks precede the authoritative database clock check below. The predicate only bounds candidates.
        await using (var command = new NpgsqlCommand($"SELECT id,state FROM {Sessions} WHERE (payload IS NOT NULL OR EXISTS(SELECT 1 FROM {Approvals} a WHERE a.session_id={Sessions}.id AND a.private_descriptor IS NOT NULL) OR EXISTS(SELECT 1 FROM {Calls} c WHERE c.session_id={Sessions}.id AND c.descriptor IS NOT NULL)) AND expires_at<=clock_timestamp() ORDER BY id LIMIT {_options.MaintenanceBatch} FOR UPDATE SKIP LOCKED", connection))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
            while (await reader.ReadAsync(cancellationToken)) rows.Add((reader.GetString(0), reader.GetString(1)));
        var now = await Now(connection, cancellationToken);
        foreach (var (id, state) in rows)
        {
            await Execute(connection, $"""
                UPDATE {Sessions} AS session SET state=CASE
                    WHEN state IN ('Publishing','PublicationUnknown') THEN 'PublicationUnknown'
                    WHEN state='Blocked' OR (state='Owned' AND (EXISTS(SELECT 1 FROM {Calls} WHERE session_id=@id AND dispatch_generation=session.generation) OR EXISTS(SELECT 1 FROM {Approvals} WHERE session_id=@id AND admitted_generation=session.generation) OR EXISTS(SELECT 1 FROM {ApprovalBatches} WHERE session_id=@id AND admitted_generation=session.generation))) THEN 'Blocked'
                    ELSE 'Retired' END,
                    payload=NULL,admitted_request=NULL,token=NULL,lease_until=NULL,generation=generation+1,revision=revision+1
                    WHERE id=@id AND expires_at<=@now;
                UPDATE {Calls} SET descriptor=NULL WHERE session_id=@id;
                UPDATE {Approvals} SET private_descriptor=NULL,state='Retired' WHERE session_id=@id;
                UPDATE {ApprovalBatches} SET state='Retired' WHERE session_id=@id;
                """, cancellationToken, ("id", id), ("now", now));
        }
        await transaction.CommitAsync(cancellationToken);
        return rows.Count;
    }

    private async ValueTask RetireRow(NpgsqlConnection connection, Row row, NativeSessionKey key, string state, CancellationToken cancellationToken)
    {
        await Execute(connection, $"UPDATE {Sessions} SET state=@state,payload=NULL,admitted_request=NULL,token=NULL,lease_until=NULL,generation=generation+1,revision=revision+1 WHERE id=@id; UPDATE {Calls} SET descriptor=NULL WHERE session_id=@id; UPDATE {Approvals} SET private_descriptor=NULL,state='Retired' WHERE session_id=@id; UPDATE {ApprovalBatches} SET state='Retired' WHERE session_id=@id", cancellationToken, ("state", state), ("id", key.Id));
    }
}
