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
        await RequireSchemaVersion(connection, cancellationToken);
        var row = await Read(connection, lease.Key, cancellationToken);
        var now = await Now(connection, cancellationToken);
        if (!Owns(row, lease, now) || row!.State != "Owned") return false;
        var existing = await ReadCall(connection, lease.Key, call.Id, cancellationToken);
        if (existing is not null) return existing.State == "Captured" && Same(existing.Call, call);
        await using (var fence = Command(connection, $"SELECT EXISTS(SELECT 1 FROM {Approvals} WHERE session_id=@id AND call_id=@call)", ("id", lease.Key.Id), ("call", call.Id)))
            if ((bool)(await fence.ExecuteScalarAsync(cancellationToken))!) return false;
        if (row.AdmittedRequest is null) return false;
        var admittedMessages = System.Text.Json.Nodes.JsonNode.Parse(row.AdmittedRequest)!["messages"]!.AsArray();
        if (admittedMessages.SelectMany(message => message!["toolCalls"] is System.Text.Json.Nodes.JsonArray calls ? calls : []).Any(recorded => recorded!["id"]!.GetValue<string>() == call.Id)) return false;
        if (!await HasCallCapacity(connection, lease.Key, call.Id, cancellationToken)) return false;
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
        await RequireSchemaVersion(connection, cancellationToken);
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
        await RequireSchemaVersion(connection, cancellationToken);
        var row = await Read(connection, lease.Key, cancellationToken);
        var now = await Now(connection, cancellationToken);
        if (!Owns(row, lease, now) || row!.State != "Owned") return false;
        var stored = await ReadCall(connection, lease.Key, call.Id, cancellationToken);
        if (stored is null || !Same(stored.Call, call) || stored.State != (complete ? "Started" : "Captured") || complete && stored.Generation != lease.Generation) return false;
        if (!complete && _catalog.RequiresConfirmation(call.Name))
        {
            await using var approved = Command(connection, $"SELECT EXISTS(SELECT 1 FROM {Approvals} a JOIN {ApprovalBatches} b USING(session_id,batch_id) WHERE a.session_id=@id AND a.call_id=@call AND a.kind='Protected' AND a.state='DecisionAdmitted' AND a.decision='Approved' AND a.admitted_generation=@generation AND b.state='DecisionAdmitted' AND b.admitted_generation=@generation AND a.admitted_revision=b.admitted_revision AND a.expires_at>@now AND b.expires_at>@now)", ("id", lease.Key.Id), ("call", call.Id), ("generation", lease.Generation), ("now", now));
            if (!(bool)(await approved.ExecuteScalarAsync(cancellationToken))!) return false;
        }
        await Execute(connection, $"UPDATE {Calls} SET state=@state,dispatch_generation=@generation WHERE session_id=@id AND call_id=@call; UPDATE {Sessions} SET revision=revision+1 WHERE id=@id", cancellationToken,
            ("id", lease.Key.Id), ("call", call.Id), ("state", complete ? "Completed" : "Started"), ("generation", lease.Generation));
        if (complete && _catalog.RequiresConfirmation(call.Name))
        {
            await using var batch = Command(connection, $"UPDATE {Approvals} SET state='Settled' WHERE session_id=@id AND call_id=@call AND kind='Protected' AND state='DecisionAdmitted' AND decision='Approved' AND admitted_generation=@generation RETURNING batch_id", ("id", lease.Key.Id), ("call", call.Id), ("generation", lease.Generation));
            if (await batch.ExecuteScalarAsync(cancellationToken) is not string batchId) return false;
            await SettleApprovalBatch(connection, lease.Key, batchId, cancellationToken);
        }
        // Only a successful commit acknowledgment grants dispatch permission. No callback occurs inside this transaction.
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    private static bool Same(NativeToolCall? left, NativeToolCall right) => left is not null && left.Id == right.Id && left.Name == right.Name && left.Version == right.Version && System.Text.Json.Nodes.JsonNode.DeepEquals(System.Text.Json.Nodes.JsonNode.Parse(left.Arguments.GetRawText()), System.Text.Json.Nodes.JsonNode.Parse(right.Arguments.GetRawText()));
    private async ValueTask<StoredCall?> ReadCall(NpgsqlConnection connection, NativeSessionKey key, string id, CancellationToken cancellationToken)
    {
        await using var command = Command(connection, $"SELECT descriptor,state,dispatch_generation,captured_generation FROM {Calls} WHERE session_id=@key AND call_id=@call", ("key", key.Id), ("call", id));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new(reader.IsDBNull(0) ? null : JsonSerializer.Deserialize<NativeToolCall>(reader.GetString(0), JsonOptions), reader.GetString(1), reader.IsDBNull(2) ? 0 : reader.GetInt64(2), reader.GetInt64(3));
    }
    private async ValueTask<bool> HasDispatch(NpgsqlConnection connection, NativeSessionKey key, long generation, CancellationToken cancellationToken)
    {
        await using var command = Command(connection, $"SELECT EXISTS(SELECT 1 FROM {Calls} WHERE session_id=@id AND dispatch_generation=@generation) OR EXISTS(SELECT 1 FROM {Approvals} WHERE session_id=@id AND admitted_generation=@generation) OR EXISTS(SELECT 1 FROM {ApprovalBatches} WHERE session_id=@id AND admitted_generation=@generation) OR EXISTS(SELECT 1 FROM {ApprovalBatches} b JOIN {Approvals} a USING(session_id,batch_id) WHERE b.session_id=@id AND b.published_revision IS NULL AND b.state='Pending' AND a.captured_generation=@generation)", ("id", key.Id), ("generation", generation));
        return (bool)(await command.ExecuteScalarAsync(cancellationToken))!;
    }
    private async ValueTask RemoveUncommittedCalls(NpgsqlConnection connection, NativeSessionKey key, NativeSessionSnapshot snapshot, CancellationToken cancellationToken)
    {
        await Execute(connection, $"DELETE FROM {Calls} WHERE session_id=@id AND state='Captured' AND NOT(call_id=ANY(@pending)) AND NOT EXISTS(SELECT 1 FROM {Approvals} a WHERE a.session_id=@id AND a.call_id={Calls}.call_id)", cancellationToken, ("id", key.Id), ("pending", snapshot.PendingCalls.Select(call => call.Id).ToArray()));
    }
    private sealed record StoredCall(NativeToolCall? Call, string State, long Generation, long CapturedGeneration);
}
