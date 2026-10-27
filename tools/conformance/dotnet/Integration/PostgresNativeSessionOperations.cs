using System.Text.Json;
using System.Text.Json.Nodes;
using Npgsql;

namespace Hashbrown.Conformance.Integration;

public sealed partial class PostgresNativeSessionJournal
{
    /// <inheritdoc />
    public async ValueTask<NativeSavedReceipt?> SaveAsync(NativeSessionLease lease, NativeSessionSave save, CancellationToken cancellationToken = default)
    {
        NativeSessionSnapshot snapshot;
        long approvalPayloadBytes;
        try
        {
            approvalPayloadBytes = CountApprovalPayload(save.Approvals, save.PendingCalls);
            if (save.PendingCalls.Count > _options.MaximumCalls || save.ExpectedBrowserCallIds.Count > _options.MaximumCalls || save.PendingCalls.Any(call => System.Text.Encoding.UTF8.GetByteCount(call.Arguments.GetRawText()) > _options.ArgumentBytes)) return null;
            ValidateNative(save.NativeJson);
            var canonical = NativeSessionHistory.Normalize(save.PublicRequest, lease.Key, _catalog, _options);
            // Serialization owns the mutable caller collections before the first asynchronous boundary.
            snapshot = ValidatePayload(SerializePayload(new NativeSessionSnapshot(save.NativeJson, canonical, save.PendingCalls, save.ExpectedBrowserCallIds, save.TurnCompleted, save.Approvals)), lease.Key, durablePendingReader: true);
            if (!ValidPending(snapshot)) return null;
        }
        catch (Exception exception) when (BadInput(exception)) { return null; }
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await RequireSchemaVersion(connection, cancellationToken);
        var row = await Read(connection, lease.Key, cancellationToken);
        var now = await Now(connection, cancellationToken);
        if (!Owns(row, lease, now) || row!.State != "Owned" || row.AdmittedRequest is null || !Advances(row.AdmittedRequest, snapshot.PublicRequest)) return null;
        if (!await HasApprovalCapacity(connection, lease.Key, 0, 0, cancellationToken, prospectivePayloadBytes: approvalPayloadBytes) || !await CanPublishApprovalBatch(connection, row, lease, snapshot, now, cancellationToken)) return null;
        var currentBatchId = snapshot.Approvals.PendingBatch?.Batch.BatchId ?? "";
        var journalCalls = new Dictionary<string, (NativeToolCall Call, string State)>(StringComparer.Ordinal);
        await using (var command = Command(connection, $"SELECT call_id,descriptor,state FROM {Calls} WHERE session_id=@id", ("id", lease.Key.Id)))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
            while (await reader.ReadAsync(cancellationToken))
            {
                if (reader.GetString(2) == "Started" || reader.IsDBNull(1)) return null;
                var descriptor = JsonSerializer.Deserialize<NativeToolCall>(reader.GetString(1), JsonOptions)!;
                if (descriptor.Id != reader.GetString(0) || !_catalog.HasVersion(descriptor)) return null;
                journalCalls.Add(descriptor.Id, (descriptor, reader.GetString(2)));
            }
        await using (var unsettled = Command(connection, $"SELECT EXISTS(SELECT 1 FROM {ApprovalBatches} WHERE session_id=@id AND batch_id<>@batch AND state IN ('Pending','DecisionAdmitted')) OR EXISTS(SELECT 1 FROM {Approvals} WHERE session_id=@id AND batch_id<>@batch AND state IN ('Pending','DecisionAdmitted'))", ("id", lease.Key.Id), ("batch", currentBatchId)))
            if ((bool)(await unsettled.ExecuteScalarAsync(cancellationToken))!) return null;
        var captured = journalCalls.Values.Where(entry => entry.State == "Captured").Select(entry => entry.Call).ToArray();
        if (captured.Length != snapshot.PendingCalls.Count || captured.Any(call => !snapshot.PendingCalls.Any(pending => Same(call, pending)))) return null;
        var publicMessages = JsonNode.Parse(snapshot.PublicRequest)!["messages"]!.AsArray();
        var answered = publicMessages.Where(message => message!["role"]!.GetValue<string>() == "tool").Select(message => message!["toolCallId"]!.GetValue<string>()).ToHashSet(StringComparer.Ordinal);
        var represented = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in publicMessages.SelectMany(message => message!["toolCalls"] is JsonArray calls ? calls : []))
        {
            var function = item!["function"]!;
            var name = function["name"]!.GetValue<string>();
            if (!_catalog.Contains(name)) continue;
            var id = item["id"]!.GetValue<string>();
            if (!journalCalls.TryGetValue(id, out var stored)) return null;
            var call = new NativeToolCall(id, name, stored.Call.Version, JsonSerializer.Deserialize<JsonElement>(function["arguments"]!.GetValue<string>()));
            if (!Same(stored.Call, call)) return null;
            if (answered.Contains(id) && stored.State is "Declined" or "Cancelled")
            {
                var result = publicMessages.Single(message => message!["role"]!.GetValue<string>() == "tool" && message["toolCallId"]!.GetValue<string>() == id)!;
                if (result["content"] is not JsonValue content || !content.TryGetValue<string>(out var text)) return null;
                await using var rejected = Command(connection, $"SELECT EXISTS(SELECT 1 FROM {Approvals} a JOIN {Calls} c USING(session_id,call_id) JOIN {ApprovalBatches} b USING(session_id,batch_id) WHERE a.session_id=@id AND a.call_id=@call AND a.kind='Protected' AND a.state='Settled' AND a.decision=@decision AND a.result_digest=@digest AND a.admitted_generation IS NOT NULL AND c.dispatch_generation IS NULL AND b.state='Settled')", ("id", lease.Key.Id), ("call", id), ("decision", stored.State), ("digest", ApprovalResultDigest(JsonSerializer.SerializeToElement(text))));
                if (!(bool)(await rejected.ExecuteScalarAsync(cancellationToken))!) return null;
            }
            else if (stored.State != (answered.Contains(id) ? "Completed" : "Captured")) return null;
            represented.Add(id);
        }
        await using (var command = Command(connection, $"SELECT call_id,private_descriptor,result_digest,state FROM {Approvals} WHERE session_id=@id AND kind='BrowserBypass' AND batch_id<>@batch", ("id", lease.Key.Id), ("batch", currentBatchId)))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
            while (await reader.ReadAsync(cancellationToken))
            {
                if (reader.GetString(3) != "Settled" || reader.IsDBNull(1) || reader.IsDBNull(2)) return null;
                using var document = JsonDocument.Parse(reader.GetString(1));
                var binding = JsonSerializer.Deserialize<NativeBrowserRequestBinding>(document.RootElement.GetProperty("browserBinding"), JsonOptions);
                var id = reader.GetString(0);
                var call = publicMessages.SelectMany(message => message!["toolCalls"] is JsonArray calls ? calls : []).SingleOrDefault(item => item!["id"]!.GetValue<string>() == id);
                var result = publicMessages.SingleOrDefault(message => message!["role"]!.GetValue<string>() == "tool" && message["toolCallId"]!.GetValue<string>() == id);
                if (binding is null || binding.CallId != id || call?["function"]?["name"]?.GetValue<string>() != binding.Name || !JsonNode.DeepEquals(JsonNode.Parse(call["function"]!["arguments"]!.GetValue<string>()), JsonNode.Parse(binding.Arguments.GetRawText())) || result?["content"] is not JsonValue content || !content.TryGetValue<string>(out var text) || ApprovalResultDigest(JsonSerializer.SerializeToElement(text)) != reader.GetString(2)) return null;
            }
        // Native bypass may keep Captured backend calls private until browser results arrive.
        // Completed calls must always appear with results, including all earlier turns.
        if (journalCalls.Any(entry => !represented.Contains(entry.Key) && (entry.Value.State != "Captured" || snapshot.TurnCompleted || snapshot.ExpectedBrowserCallIds.Count == 0))) return null;
        if (snapshot.Approvals.PendingBatch is not null)
        {
            var changed = await Execute(connection, $"UPDATE {ApprovalBatches} SET published_revision=@revision WHERE session_id=@id AND batch_id=@batch AND published_revision IS NULL AND state='Pending'", cancellationToken, ("revision", row.Revision + 1), ("id", lease.Key.Id), ("batch", currentBatchId));
            if (changed != 1) return null;
        }
        // Retention is an explicit child-first rewrite; the parent expiry trigger never clamps safety rows.
        await Execute(connection, $"UPDATE {Approvals} SET expires_at=@expires WHERE session_id=@id AND expires_at>@expires; UPDATE {ApprovalBatches} SET expires_at=@expires WHERE session_id=@id AND expires_at>@expires", cancellationToken, ("expires", now + _options.Retention), ("id", lease.Key.Id));
        await Execute(connection, $"UPDATE {Sessions} SET state='Saved',payload=@payload,ever_saved=true,revision=revision+1,expires_at=@expires WHERE id=@id", cancellationToken,
            ("payload", SerializePayload(snapshot)), ("expires", now + _options.Retention), ("id", lease.Key.Id));
        await transaction.CommitAsync(cancellationToken);
        return new(lease, row.Revision + 1);
    }

    /// <inheritdoc />
    public async ValueTask<bool> AuthorizePublicationAsync(NativeSavedReceipt receipt, CancellationToken cancellationToken = default)
    {
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await RequireSchemaVersion(connection, cancellationToken);
        var row = await Read(connection, receipt.Lease.Key, cancellationToken);
        var now = await Now(connection, cancellationToken);
        if (!Owns(row, receipt.Lease, now) || row!.State != "Saved" || row.Revision != receipt.SavedRevision) return false;
        // The saved receipt authorizes exactly one reservation; operator observations receive a new revision.
        await Execute(connection, $"UPDATE {Sessions} SET state='Publishing',revision=revision+1 WHERE id=@id", cancellationToken, ("id", receipt.Lease.Key.Id));
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    /// <inheritdoc />
    public async ValueTask<bool> FinalizePublicationAsync(NativeSavedReceipt receipt, CancellationToken cancellationToken = default)
    {
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await RequireSchemaVersion(connection, cancellationToken);
        var row = await Read(connection, receipt.Lease.Key, cancellationToken);
        var now = await Now(connection, cancellationToken);
        if (!Owns(row, receipt.Lease, now) || row!.State != "Publishing" || row.Revision != receipt.SavedRevision + 1) return false;
        await Execute(connection, $"UPDATE {Sessions} SET state='Ready',token=NULL,lease_until=NULL,admitted_request=NULL,revision=revision+1 WHERE id=@id", cancellationToken, ("id", receipt.Lease.Key.Id));
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    /// <inheritdoc />
    public async ValueTask<bool> FailureCleanupAsync(NativeSessionLease lease, CancellationToken cancellationToken = default)
    {
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await RequireSchemaVersion(connection, cancellationToken);
        var row = await Read(connection, lease.Key, cancellationToken);
        var now = await Now(connection, cancellationToken);
        if (!Owns(row, lease, now) || row!.State is not ("Owned" or "Saved" or "Publishing")) return false;
        var blocked = row.State != "Owned" || await HasDispatch(connection, lease.Key, lease.Generation, cancellationToken);
        if (!blocked)
        {
            var previous = await ReadApprovalSnapshot(connection, row, lease, now, cancellationToken);
            await RemoveUncommittedCalls(connection, lease.Key, previous.Snapshot, cancellationToken);
        }
        await Execute(connection, $"UPDATE {Sessions} SET state=@state,token=NULL,lease_until=NULL,admitted_request=NULL,generation=generation+1,revision=revision+1 WHERE id=@id", cancellationToken,
            ("state", row.State == "Publishing" ? "PublicationUnknown" : blocked ? "Blocked" : "Ready"), ("id", lease.Key.Id));
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    /// <inheritdoc />
    public async ValueTask<NativeSessionStatus> ReadStatusAsync(NativeSessionKey key, CancellationToken cancellationToken = default)
    {
        try
        {
            await using var connection = await _source.OpenConnectionAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
            await RequireSchemaVersion(connection, cancellationToken);
            var row = await Read(connection, key, cancellationToken);
            if (row is null || row.KeyData != KeyData(key)) return new(410);
            if (row.Compatibility != _compatibility) return new(409);
            var now = await Now(connection, cancellationToken);
            if (row.Expires <= now) return new(row.State == "Retired" ? 410 : 200,
                row.State is "Publishing" or "PublicationUnknown" ? "PublicationUnknown" : row.State == "Blocked" ? "Blocked" : "Expired", row.Generation, row.Revision, null, row.LeaseUntil);
            string? history = null;
            var completed = false;
            IReadOnlyList<RecoveryInterrupt>? pendingInterrupts = null; string? recoveryReason = null;
            if (row.State == "Ready")
            {
                try
                {
                    var validated = await ReadValidatedApprovalSnapshot(connection, row, key, now, cancellationToken);
                    var snapshot = validated.Snapshot; history = snapshot.PublicRequest; completed = snapshot.TurnCompleted;
                    if (validated.Publication is { } publication)
                    {
                        if (publication.State != NativeApprovalState.Pending || publication.Decisions.Count != 0 || publication.AdmittedGeneration is not null || publication.AdmittedRevision is not null) throw new ArgumentException("Consumed pending recovery is unavailable.");
                        if (snapshot.ExpectedBrowserCallIds.Count > 0) recoveryReason = "PendingMixedBrowserResult";
                        else pendingInterrupts = Array.AsReadOnly(publication.Batch.Batch.ProtectedRequests.Select(item => new RecoveryInterrupt(item.RequestId, "tool_call", "Approval required for tool call: " + item.Call.Name,
                            JsonSerializer.SerializeToElement(new { type = "object", properties = new { approved = new { type = "boolean" } }, required = new[] { "approved" } }), ToolCallId: item.Call.Id)).ToArray());
                    }
                }
                catch (Exception exception) when (BadInput(exception)) { return new(503, "Unavailable", row.Generation, row.Revision); }
            }
            return new(row.State == "Retired" ? 410 : 200, row.State, row.Generation, row.Revision, history, row.LeaseUntil, !row.EverSaved, completed, pendingInterrupts, recoveryReason);
        }
        catch (Exception exception) when (exception is NpgsqlException or TimeoutException) { return new(503); }
    }

    /// <inheritdoc />
    public async ValueTask<NativeSessionInspection?> InspectAsync(IReadOnlySet<string> scopes, NativeSessionKey key, int limit = 50, CancellationToken cancellationToken = default)
    {
        if (!scopes.Contains(key.Scope) || limit is < 1 or > 100) return null;
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await RequireSchemaVersion(connection, cancellationToken);
        var row = await Read(connection, key, cancellationToken);
        if (row is null || row.KeyData != KeyData(key)) return null;
        var invocations = new List<NativeInvocationStatus>();
        var audit = new List<NativeSessionAudit>();
        await using (var command = Command(connection, $"SELECT call_id,name,version,state,COALESCE(dispatch_generation,captured_generation) FROM {Calls} WHERE session_id=@id ORDER BY call_id LIMIT @limit", ("id", key.Id), ("limit", limit)))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
            while (await reader.ReadAsync(cancellationToken)) invocations.Add(new(reader.GetString(0), reader.GetString(1), reader.GetInt32(2), reader.GetString(3), reader.GetInt64(4)));
        await using (var command = Command(connection, $"SELECT actor,prior_state,prior_generation,prior_revision,outcome,reason,evidence_reference,recorded_at FROM {Audit} WHERE session_id=@id AND scope=@scope ORDER BY id DESC LIMIT @limit", ("id", key.Id), ("scope", key.Scope), ("limit", limit)))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
            while (await reader.ReadAsync(cancellationToken)) audit.Add(new(reader.GetString(0), reader.GetString(1), reader.GetInt64(2), reader.GetInt64(3), reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetFieldValue<DateTimeOffset>(7)));
        return new(new(200, row.State, row.Generation, row.Revision, null, row.LeaseUntil), invocations.AsReadOnly(), audit.AsReadOnly());
    }

    /// <inheritdoc />
    public ValueTask<int> ReconcileAsync(IReadOnlySet<string> scopes, NativeSessionKey key, string actor, NativeSessionReconciliation request, CancellationToken cancellationToken = default) => OperatorRetire(scopes, key, actor, request, false, cancellationToken);
    /// <inheritdoc />
    public ValueTask<int> RetireAsync(IReadOnlySet<string> scopes, NativeSessionKey key, string actor, NativeSessionReconciliation request, CancellationToken cancellationToken = default) => OperatorRetire(scopes, key, actor, request, true, cancellationToken);

    private async ValueTask<int> OperatorRetire(IReadOnlySet<string> scopes, NativeSessionKey key, string actor, NativeSessionReconciliation request, bool retire, CancellationToken cancellationToken)
    {
        if (!scopes.Contains(key.Scope)) return 404;
        if (!request.ExternalQuiescenceAcknowledged || string.IsNullOrWhiteSpace(actor) || actor.Length > 1024 || string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Length > 2000 || string.IsNullOrWhiteSpace(request.EvidenceReference) || request.EvidenceReference.Length > 2048 || (retire ? request.Outcome != "Retired" : request.Outcome is not ("ConfirmedPerformed" or "ConfirmedNotPerformed" or "Unresolved"))) return 400;
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await RequireSchemaVersion(connection, cancellationToken);
        var row = await Read(connection, key, cancellationToken);
        var now = await Now(connection, cancellationToken);
        if (row is null || row.KeyData != KeyData(key)) return 404;
        if (row.State == "Retired" || row.State != request.ExpectedState || row.Generation != request.ExpectedGeneration || row.Revision != request.ExpectedRevision) return 409;
        await Execute(connection, $"INSERT INTO {Audit}(session_id,scope,actor,prior_state,prior_generation,prior_revision,outcome,reason,evidence_reference,recorded_at) VALUES(@id,@scope,@actor,@state,@generation,@revision,@outcome,@reason,@evidence,@now)", cancellationToken,
            ("id", key.Id), ("scope", key.Scope), ("actor", actor), ("state", row.State), ("generation", row.Generation), ("revision", row.Revision), ("outcome", request.Outcome), ("reason", request.Reason), ("evidence", request.EvidenceReference), ("now", now));
        await RetireRow(connection, row, key, "Retired", cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return 200;
    }
    private static bool Advances(string admitted, string projected)
    {
        var input = JsonNode.Parse(admitted)!.AsObject();
        var output = JsonNode.Parse(projected)!.AsObject();
        var before = input["messages"]!.AsArray();
        var after = output["messages"]!.AsArray();
        if (after.Count < before.Count || before.Where((message, index) => !NativeSessionHistory.EquivalentMessage(message, after[index])).Any()) return false;
        input.Remove("messages"); output.Remove("messages"); input.Remove("state"); output.Remove("state");
        return JsonNode.DeepEquals(input, output);
    }
    private bool ValidPending(NativeSessionSnapshot snapshot)
    {
        if (snapshot.TurnCompleted && (snapshot.PendingCalls.Count != 0 || snapshot.ExpectedBrowserCallIds.Count != 0)) return false;
        var root = JsonNode.Parse(snapshot.PublicRequest)!;
        var calls = root["messages"]!.AsArray().SelectMany(message => message!["toolCalls"] is JsonArray entries ? entries : []).ToDictionary(call => call!["id"]!.GetValue<string>(), call => call!, StringComparer.Ordinal);
        var results = root["messages"]!.AsArray().Where(message => message!["role"]!.GetValue<string>() == "tool").Select(message => message!["toolCallId"]!.GetValue<string>()).ToHashSet(StringComparer.Ordinal);
        var browserNames = root["tools"]?.AsArray().Select(tool => tool!["name"]!.GetValue<string>()).ToHashSet(StringComparer.Ordinal) ?? [];
        var expected = calls.Where(pair => !results.Contains(pair.Key) && !_catalog.Contains(pair.Value["function"]!["name"]!.GetValue<string>())).ToArray();
        if (expected.Any(pair => !browserNames.Contains(pair.Value["function"]!["name"]!.GetValue<string>())) || !expected.Select(pair => pair.Key).ToHashSet(StringComparer.Ordinal).SetEquals(snapshot.ExpectedBrowserCallIds)) return false;
        var pendingServerIds = calls.Where(pair => !results.Contains(pair.Key) && _catalog.Contains(pair.Value["function"]!["name"]!.GetValue<string>())).Select(pair => pair.Key).ToHashSet(StringComparer.Ordinal);
        if (!pendingServerIds.IsSubsetOf(snapshot.PendingCalls.Select(call => call.Id).ToHashSet(StringComparer.Ordinal))) return false;
        var mayHideCaptured = !snapshot.TurnCompleted && snapshot.ExpectedBrowserCallIds.Count != 0;
        return snapshot.PendingCalls.All(call => calls.TryGetValue(call.Id, out var recorded)
            ? !results.Contains(call.Id) && recorded["function"]!["name"]!.GetValue<string>() == call.Name && JsonNode.DeepEquals(JsonNode.Parse(recorded["function"]!["arguments"]!.GetValue<string>()), JsonNode.Parse(call.Arguments.GetRawText()))
            : mayHideCaptured);
    }
}
