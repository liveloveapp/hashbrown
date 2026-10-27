using System.Text;
using System.Text.Json;
using Npgsql;

namespace Hashbrown.Conformance.Integration;

public sealed partial class PostgresNativeSessionJournal
{
    /// <inheritdoc />
    public async ValueTask<bool> CaptureModelCallAsync(NativeSessionLease lease, NativeToolCall call, CancellationToken cancellationToken = default)
    {
        if (!_catalog.Matches(call) || Encoding.UTF8.GetByteCount(call.Arguments.GetRawText()) > _options.ArgumentBytes) return false;
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var row = await Read(connection, lease.Key, cancellationToken);
        var now = await Now(connection, cancellationToken);
        if (!Owns(row, lease, now) || row!.State != "Owned") return false;
        var existing = await ReadCall(connection, lease.Key, call.Id, cancellationToken);
        if (existing is not null) return existing.State == "Captured" && Same(existing.Call, call);
        if (row.AdmittedRequest is null) return false;
        var admittedMessages = System.Text.Json.Nodes.JsonNode.Parse(row.AdmittedRequest)!["messages"]!.AsArray();
        if (admittedMessages.SelectMany(message => message!["toolCalls"] is System.Text.Json.Nodes.JsonArray calls ? calls : []).Any(recorded => recorded!["id"]!.GetValue<string>() == call.Id)) return false;
        await using (var count = Command(connection, $"SELECT count(*) FROM {Calls} WHERE session_id=@id", ("id", lease.Key.Id)))
            if ((long)(await count.ExecuteScalarAsync(cancellationToken))! >= _options.MaximumCalls) return false;
        await Execute(connection, $"INSERT INTO {Calls}(session_id,call_id,name,version,descriptor,state,captured_generation) VALUES(@id,@call,@name,@version,@descriptor,'Captured',@generation); UPDATE {Sessions} SET revision=revision+1 WHERE id=@id", cancellationToken,
            ("id", lease.Key.Id), ("call", call.Id), ("name", call.Name), ("version", call.Version), ("descriptor", Serialize(call)), ("generation", lease.Generation));
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    /// <inheritdoc />
    public async ValueTask<NativeToolCall?> GetOwnedCallAsync(NativeSessionLease lease, string callId, CancellationToken cancellationToken = default)
    {
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var row = await Read(connection, lease.Key, cancellationToken);
        var now = await Now(connection, cancellationToken);
        if (!Owns(row, lease, now) || row!.State != "Owned") return null;
        var stored = await ReadCall(connection, lease.Key, callId, cancellationToken);
        return stored is { State: "Captured", Call: not null } && _catalog.HasVersion(stored.Call) ? stored.Call : null;
    }

    /// <inheritdoc />
    public ValueTask<bool> TryStartDispatchAsync(NativeSessionLease lease, NativeToolCall call, CancellationToken cancellationToken = default) => TransitionCall(lease, call, false, cancellationToken);

    /// <inheritdoc />
    public ValueTask<bool> CompleteDispatchAsync(NativeSessionLease lease, NativeToolCall call, CancellationToken cancellationToken = default) => TransitionCall(lease, call, true, cancellationToken);

    private async ValueTask<bool> TransitionCall(NativeSessionLease lease, NativeToolCall call, bool complete, CancellationToken cancellationToken)
    {
        if (!_catalog.Matches(call)) return false;
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var row = await Read(connection, lease.Key, cancellationToken);
        var now = await Now(connection, cancellationToken);
        if (!Owns(row, lease, now) || row!.State != "Owned") return false;
        var stored = await ReadCall(connection, lease.Key, call.Id, cancellationToken);
        if (stored is null || !Same(stored.Call, call) || stored.State != (complete ? "Started" : "Captured") || complete && stored.Generation != lease.Generation) return false;
        await Execute(connection, $"UPDATE {Calls} SET state=@state,dispatch_generation=@generation WHERE session_id=@id AND call_id=@call; UPDATE {Sessions} SET revision=revision+1 WHERE id=@id", cancellationToken,
            ("id", lease.Key.Id), ("call", call.Id), ("state", complete ? "Completed" : "Started"), ("generation", lease.Generation));
        // Only a successful commit acknowledgment grants dispatch permission. No callback occurs inside this transaction.
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    private static bool Same(NativeToolCall? left, NativeToolCall right) => left is not null && left.Id == right.Id && left.Name == right.Name && left.Version == right.Version && System.Text.Json.Nodes.JsonNode.DeepEquals(System.Text.Json.Nodes.JsonNode.Parse(left.Arguments.GetRawText()), System.Text.Json.Nodes.JsonNode.Parse(right.Arguments.GetRawText()));
    private async ValueTask<StoredCall?> ReadCall(NpgsqlConnection connection, NativeSessionKey key, string id, CancellationToken cancellationToken)
    {
        await using var command = Command(connection, $"SELECT descriptor,state,dispatch_generation FROM {Calls} WHERE session_id=@key AND call_id=@call", ("key", key.Id), ("call", id));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new(reader.IsDBNull(0) ? null : JsonSerializer.Deserialize<NativeToolCall>(reader.GetString(0), JsonOptions), reader.GetString(1), reader.IsDBNull(2) ? 0 : reader.GetInt64(2));
    }
    private async ValueTask<bool> HasDispatch(NpgsqlConnection connection, NativeSessionKey key, long generation, CancellationToken cancellationToken)
    {
        await using var command = Command(connection, $"SELECT EXISTS(SELECT 1 FROM {Calls} WHERE session_id=@id AND dispatch_generation=@generation)", ("id", key.Id), ("generation", generation));
        return (bool)(await command.ExecuteScalarAsync(cancellationToken))!;
    }
    private async ValueTask RemoveUncommittedCalls(NpgsqlConnection connection, NativeSessionKey key, NativeSessionSnapshot snapshot, CancellationToken cancellationToken)
    {
        await Execute(connection, $"DELETE FROM {Calls} WHERE session_id=@id AND state='Captured' AND NOT(call_id=ANY(@pending))", cancellationToken, ("id", key.Id), ("pending", snapshot.PendingCalls.Select(call => call.Id).ToArray()));
    }
    private sealed record StoredCall(NativeToolCall? Call, string State, long Generation);
}
