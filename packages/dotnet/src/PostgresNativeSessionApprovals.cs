using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Npgsql;

namespace Hashbrown.AspNetCore;

public sealed partial class PostgresNativeSessionJournal
{
  /// <inheritdoc />
  public async ValueTask<bool> CaptureApprovalBatchAsync(NativeSessionLease lease, NativeApprovalBatch capture, CancellationToken cancellationToken = default)
  {
    // Own bounded caller data before opening a transaction; validators never run while a row is locked.
    if (capture.ProtectedRequests.Count + capture.BrowserBindings.Count > _options.MaximumCalls || capture.ProtectedRequests.Any(item => !_catalog.Matches(item.Call) || !_catalog.RequiresConfirmation(item.Call.Name) || Encoding.UTF8.GetByteCount(item.Call.Arguments.GetRawText()) > _options.ArgumentBytes) || capture.BrowserBindings.Any(item => _catalog.Contains(item.Name) || Encoding.UTF8.GetByteCount(item.Arguments.GetRawText()) > _options.ArgumentBytes)) return false;
    // Count exact serialized bytes without materializing descriptor strings or their aggregate first.
    long bytes;
    try { bytes = CountApprovalDescriptors(capture); }
    catch (ApprovalBudgetExceededException) { return false; }
    var requestIds = capture.ProtectedRequests.Select(item => item.RequestId).Concat(capture.BrowserBindings.Select(item => item.RequestId)).ToArray();
    var callIds = capture.ProtectedRequests.Select(item => item.Call.Id).Concat(capture.BrowserBindings.Select(item => item.CallId)).ToArray();
    await using var connection = await _source.OpenConnectionAsync(cancellationToken);
    await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
    await RequireSchemaVersion(connection, cancellationToken);
    var row = await Read(connection, lease.Key, cancellationToken);
    var now = await Now(connection, cancellationToken);
    if (!Owns(row, lease, now) || row!.State != "Owned" || row.AdmittedRequest is null) return false;
    foreach (var item in capture.ProtectedRequests)
    {
      var call = await ReadCall(connection, lease.Key, item.Call.Id, cancellationToken);
      if (call is not { State: "Captured" } || call.CapturedGeneration != lease.Generation || !Same(call.Call, item.Call)) return false;
    }
    var original = System.Text.Json.Nodes.JsonNode.Parse(row.AdmittedRequest)!;
    var browserNames = original["tools"]?.AsArray().Select(item => item!["name"]!.GetValue<string>()).ToHashSet(StringComparer.Ordinal) ?? [];
    if (capture.BrowserBindings.Any(item => !browserNames.Contains(item.Name))) return false;
    await using (var exists = Command(connection, $"SELECT EXISTS(SELECT 1 FROM {ApprovalBatches} WHERE session_id=@id AND (batch_id=@batch OR state IN ('Pending','DecisionAdmitted'))) OR EXISTS(SELECT 1 FROM {Approvals} WHERE session_id=@id AND (request_id=ANY(@requests) OR call_id=ANY(@calls))) OR EXISTS(SELECT 1 FROM {Calls} WHERE session_id=@id AND call_id=ANY(@browser))", ("id", lease.Key.Id), ("batch", capture.BatchId), ("requests", requestIds), ("calls", callIds), ("browser", capture.BrowserBindings.Select(item => item.CallId).ToArray())))
      if ((bool)(await exists.ExecuteScalarAsync(cancellationToken))!) return false;
    if (!await HasApprovalCapacity(connection, lease.Key, requestIds.Length, bytes, cancellationToken, capture.ProtectedRequests.Select(item => item.Call.Id).ToArray())) return false;
    await using (var count = Command(connection, $"SELECT count(*) FROM (SELECT call_id FROM {Calls} WHERE session_id=@id UNION SELECT call_id FROM {Approvals} WHERE session_id=@id UNION SELECT unnest(@calls::text[])) retained", ("id", lease.Key.Id), ("calls", callIds)))
      if ((long)(await count.ExecuteScalarAsync(cancellationToken))! > _options.MaximumCalls) return false;
    var members = capture.ProtectedRequests.Select(item => new ApprovalMember(item.RequestId, item.Call.Id, "Protected", Serialize(new { formatVersion = 1, protectedRequest = item })))
        .Concat(capture.BrowserBindings.Select(item => new ApprovalMember(item.RequestId, item.CallId, "BrowserBypass", Serialize(new { formatVersion = 1, browserBinding = item })))).ToArray();
    await Execute(connection, $"INSERT INTO {ApprovalBatches}(session_id,batch_id,member_digest,member_count,state,expires_at) VALUES(@id,@batch,@digest,@count,'Pending',@expires)", cancellationToken,
        ("id", lease.Key.Id), ("batch", capture.BatchId), ("digest", ApprovalDigest(capture)), ("count", members.Length), ("expires", row.Expires));
    foreach (var member in members)
      await Execute(connection, $"INSERT INTO {Approvals}(session_id,request_id,call_id,batch_id,kind,private_descriptor,state,captured_generation,expires_at) VALUES(@id,@request,@call,@batch,@kind,@descriptor,'Pending',@generation,@expires)", cancellationToken,
          ("id", lease.Key.Id), ("request", member.RequestId), ("call", member.CallId), ("batch", capture.BatchId), ("kind", member.Kind), ("descriptor", member.Descriptor), ("generation", lease.Generation), ("expires", row.Expires));
    await Execute(connection, $"UPDATE {Sessions} SET revision=revision+1 WHERE id=@id", cancellationToken, ("id", lease.Key.Id));
    await transaction.CommitAsync(cancellationToken);
    return true;
  }

  /// <inheritdoc />
  public async ValueTask<NativeApprovalEvidence?> GetOwnedApprovalEvidenceAsync(NativeSessionLease lease, CancellationToken cancellationToken = default)
  {
    await using var connection = await _source.OpenConnectionAsync(cancellationToken);
    await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
    await RequireSchemaVersion(connection, cancellationToken);
    var row = await Read(connection, lease.Key, cancellationToken);
    var now = await Now(connection, cancellationToken);
    if (!Owns(row, lease, now) || row!.State != "Owned") return null;
    try { return (await ReadApprovalSnapshot(connection, row, lease, now, cancellationToken)).Evidence; }
    catch (Exception exception) when (BadInput(exception)) { return null; }
  }

  /// <inheritdoc />
  public async ValueTask<bool> TryAdmitApprovalBatchAsync(NativeSessionLease lease, string batchId, NativeApprovalAdmissionEnvelope admission, CancellationToken cancellationToken = default)
  {
    if (Encoding.UTF8.GetByteCount(admission.CanonicalPublicRequest) > _options.PublicBytes) return false;
    await using var connection = await _source.OpenConnectionAsync(cancellationToken);
    await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
    await RequireSchemaVersion(connection, cancellationToken);
    var row = await Read(connection, lease.Key, cancellationToken);
    var now = await Now(connection, cancellationToken);
    if (!Owns(row, lease, now) || row!.State != "Owned") return false;
    NativeSessionSnapshot snapshot; NativeApprovalEvidence? evidence;
    try { (snapshot, evidence) = await ReadApprovalSnapshot(connection, row, lease, now, cancellationToken); }
    catch (Exception exception) when (BadInput(exception)) { return false; }
    if (evidence is null || evidence.Batch.Batch.BatchId != batchId || !NativeApprovalAdmission.MatchesPublishedBatch(admission, evidence) || !NativeApprovalAdmission.AdmitsOwnedPrefix(admission.CanonicalPublicRequest, snapshot, evidence) || row.AdmittedRequest != admission.CanonicalPublicRequest) return false;
    var revision = row.Revision + 1;
    foreach (var decision in admission.Decisions)
      await Execute(connection, $"UPDATE {Approvals} SET state='DecisionAdmitted',decision=@decision,admitted_generation=@generation,admitted_revision=@revision WHERE session_id=@id AND batch_id=@batch AND request_id=@request AND kind='Protected' AND state='Pending'", cancellationToken,
          ("id", lease.Key.Id), ("batch", batchId), ("request", decision.RequestId), ("decision", decision.Kind.ToString()), ("generation", lease.Generation), ("revision", revision));
    await Execute(connection, $"UPDATE {ApprovalBatches} SET state='DecisionAdmitted',admitted_generation=@generation,admitted_revision=@revision WHERE session_id=@id AND batch_id=@batch; UPDATE {Sessions} SET revision=revision+1 WHERE id=@id", cancellationToken,
        ("id", lease.Key.Id), ("batch", batchId), ("generation", lease.Generation), ("revision", revision));
    await transaction.CommitAsync(cancellationToken);
    return true;
  }

  /// <inheritdoc />
  public async ValueTask<bool> SettleApprovalRejectionAsync(NativeSessionLease lease, NativeApprovalRejection rejection, CancellationToken cancellationToken = default)
  {
    if (!GenuineRejection(rejection.Decision, rejection.Result) || Encoding.UTF8.GetByteCount(rejection.Result.GetRawText()) > _options.ArgumentBytes) return false;
    await using var connection = await _source.OpenConnectionAsync(cancellationToken);
    await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
    await RequireSchemaVersion(connection, cancellationToken);
    var row = await Read(connection, lease.Key, cancellationToken);
    var now = await Now(connection, cancellationToken);
    if (!Owns(row, lease, now) || row!.State != "Owned") return false;
    NativeApprovalEvidence? evidence;
    try { evidence = (await ReadApprovalSnapshot(connection, row, lease, now, cancellationToken)).Evidence; }
    catch (Exception exception) when (BadInput(exception)) { return false; }
    if (evidence is not { State: NativeApprovalState.DecisionAdmitted } || evidence.Batch.Batch.BatchId != rejection.BatchId || evidence.AdmittedGeneration != lease.Generation || !evidence.Decisions.Any(item => item.RequestId == rejection.RequestId && item.Kind == rejection.Decision)) return false;
    var descriptor = evidence.Batch.Batch.ProtectedRequests.SingleOrDefault(item => item.RequestId == rejection.RequestId && item.Call.Id == rejection.CallId);
    var call = await ReadCall(connection, lease.Key, rejection.CallId, cancellationToken);
    if (descriptor is null || call is not { State: "Captured", Generation: 0 } || !Same(call.Call, descriptor.Call)) return false;
    var changed = await Execute(connection, $"UPDATE {Approvals} SET state='Settled',result_digest=@digest WHERE session_id=@id AND batch_id=@batch AND request_id=@request AND call_id=@call AND kind='Protected' AND state='DecisionAdmitted' AND decision=@decision AND admitted_generation=@generation", cancellationToken,
        ("id", lease.Key.Id), ("batch", rejection.BatchId), ("request", rejection.RequestId), ("call", rejection.CallId), ("decision", rejection.Decision.ToString()), ("generation", lease.Generation), ("digest", ApprovalResultDigest(rejection.Result)));
    if (changed != 1) return false;
    await Execute(connection, $"UPDATE {Calls} SET state=@state WHERE session_id=@id AND call_id=@call; UPDATE {Sessions} SET revision=revision+1 WHERE id=@id", cancellationToken,
        ("id", lease.Key.Id), ("call", rejection.CallId), ("state", rejection.Decision.ToString()));
    await SettleApprovalBatch(connection, lease.Key, rejection.BatchId, cancellationToken);
    await transaction.CommitAsync(cancellationToken);
    return true;
  }

  /// <inheritdoc />
  public async ValueTask<bool> SettleBrowserBypassResultAsync(NativeSessionLease lease, string batchId, string requestId, string callId, JsonElement result, CancellationToken cancellationToken = default)
  {
    if (result.ValueKind != JsonValueKind.String || result.GetString() != "Tool call invocation rejected. No approval response was provided for this approval required tool call." || Encoding.UTF8.GetByteCount(result.GetRawText()) > _options.ArgumentBytes) return false;
    var digest = ApprovalResultDigest(result.Clone());
    await using var connection = await _source.OpenConnectionAsync(cancellationToken);
    await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
    await RequireSchemaVersion(connection, cancellationToken);
    var row = await Read(connection, lease.Key, cancellationToken); var now = await Now(connection, cancellationToken);
    if (!Owns(row, lease, now) || row!.State != "Owned") return false;
    NativeApprovalEvidence? evidence;
    try { evidence = (await ReadApprovalSnapshot(connection, row, lease, now, cancellationToken)).Evidence; }
    catch (Exception exception) when (BadInput(exception)) { return false; }
    if (evidence is null || evidence.State is not (NativeApprovalState.DecisionAdmitted or NativeApprovalState.Settled) || evidence.AdmittedGeneration != lease.Generation || evidence.Batch.Batch.BatchId != batchId || !evidence.Batch.Batch.BrowserBindings.Any(item => item.RequestId == requestId && item.CallId == callId) || await ReadCall(connection, lease.Key, callId, cancellationToken) is not null) return false;
    var changed = await Execute(connection, $"UPDATE {Approvals} SET state='Settled',result_digest=@digest WHERE session_id=@id AND batch_id=@batch AND request_id=@request AND call_id=@call AND kind='BrowserBypass' AND state='Pending' AND decision IS NULL AND admitted_generation IS NULL AND admitted_revision IS NULL AND result_digest IS NULL", cancellationToken,
        ("id", lease.Key.Id), ("batch", batchId), ("request", requestId), ("call", callId), ("digest", digest));
    if (changed != 1) return false;
    await Execute(connection, $"UPDATE {Sessions} SET revision=revision+1 WHERE id=@id", cancellationToken, ("id", lease.Key.Id));
    await transaction.CommitAsync(cancellationToken);
    return true;
  }

  // Codec v1 holds exactly one original typed native descriptor. Membership is SHA256 of canonical complete batch JSON.
  private sealed record ApprovalMember(string RequestId, string CallId, string Kind, string Descriptor);
  private static string ApprovalDigest(NativeApprovalBatch batch) => ApprovalResultDigest(JsonSerializer.SerializeToElement(batch, JsonOptions));
  private static string ApprovalResultDigest(JsonElement result) => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(NativeSessionHistory.Canonical(result))));
  private static bool GenuineRejection(NativeApprovalDecisionKind decision, JsonElement result) => result.ValueKind == JsonValueKind.String && result.GetString() == (decision == NativeApprovalDecisionKind.Declined ? "Tool call invocation rejected." : decision == NativeApprovalDecisionKind.Cancelled ? "Tool call invocation rejected. Cancelled by caller." : null);

  private async ValueTask SettleApprovalBatch(NpgsqlConnection connection, NativeSessionKey key, string batchId, CancellationToken cancellationToken) =>
      await Execute(connection, $"UPDATE {ApprovalBatches} SET state='Settled' WHERE session_id=@id AND batch_id=@batch AND state='DecisionAdmitted' AND NOT EXISTS(SELECT 1 FROM {Approvals} WHERE session_id=@id AND batch_id=@batch AND kind='Protected' AND state<>'Settled')", cancellationToken, ("id", key.Id), ("batch", batchId));

  // The only reader allowed to materialize pending JSON. Callers hold the selector row lock and validate authority separately.
  private sealed record ApprovalPublication(NativeBoundApprovalBatch Batch, long PublishedRevision, NativeApprovalState State, IReadOnlyList<NativeApprovalDecision> Decisions, long? AdmittedGeneration, long? AdmittedRevision, DateTimeOffset ExpiresAt);
  /// <summary>Creates execution evidence only for the caller's actual current lease after durable validation.</summary>
  private async ValueTask<(NativeSessionSnapshot Snapshot, NativeApprovalEvidence? Evidence)> ReadApprovalSnapshot(NpgsqlConnection connection, Row row, NativeSessionLease lease, DateTimeOffset now, CancellationToken cancellationToken)
  {
    var validated = await ReadValidatedApprovalSnapshot(connection, row, lease.Key, now, cancellationToken);
    var publication = validated.Publication;
    return (validated.Snapshot, publication is null ? null : new NativeApprovalEvidence(lease.Key.Id, _compatibility, _catalog.Identity, lease, publication.Batch, publication.PublishedRevision, publication.State, publication.Decisions, publication.AdmittedGeneration, publication.AdmittedRevision, publication.ExpiresAt));
  }
  /// <summary>Validates durable publication data read-only without creating a request lease or execution capability.</summary>
  private async ValueTask<(NativeSessionSnapshot Snapshot, ApprovalPublication? Publication)> ReadValidatedApprovalSnapshot(NpgsqlConnection connection, Row row, NativeSessionKey key, DateTimeOffset now, CancellationToken cancellationToken)
  {
    if (!await HasApprovalCapacity(connection, key, 0, 0, cancellationToken)) throw new ArgumentException("Aggregate approval descriptor budget exceeded.");
    var snapshot = ValidatePayload(row.Payload, key, true);
    if (snapshot.Approvals.PendingBatch is not { } bound) return (snapshot, null);
    var batch = bound.Batch;
    if (snapshot.TurnCompleted || !row.EverSaved || batch.ProtectedRequests.Count + batch.BrowserBindings.Count > _options.MaximumCalls) throw new ArgumentException("Invalid pending approval snapshot.");
    long published; string state; long? admittedGeneration; long? admittedRevision; DateTimeOffset expiry;
    await using (var command = Command(connection, $"SELECT published_revision,member_digest,member_count,state,admitted_generation,admitted_revision,expires_at FROM {ApprovalBatches} WHERE session_id=@id AND batch_id=@batch", ("id", key.Id), ("batch", batch.BatchId)))
    await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
    {
      if (!await reader.ReadAsync(cancellationToken) || reader.IsDBNull(0) || reader.GetString(1) != ApprovalDigest(batch) || reader.GetInt32(2) != batch.ProtectedRequests.Count + batch.BrowserBindings.Count) throw new ArgumentException("Unpublished or inconsistent approval batch.");
      published = reader.GetInt64(0); state = reader.GetString(3); admittedGeneration = reader.IsDBNull(4) ? null : reader.GetInt64(4); admittedRevision = reader.IsDBNull(5) ? null : reader.GetInt64(5); expiry = reader.GetFieldValue<DateTimeOffset>(6);
    }
    if (row.Revision < 3 || published > row.Revision - 2 || expiry <= now || expiry > row.Expires || state is not ("Pending" or "DecisionAdmitted" or "Settled") || (state == "Pending" ? admittedGeneration is not null || admittedRevision is not null : admittedGeneration is null || admittedRevision is null)) throw new ArgumentException("Unavailable approval publication.");
    if (state != "Pending" && (admittedGeneration!.Value > row.Generation || admittedRevision!.Value > row.Revision || admittedRevision.Value <= published + 2)) throw new ArgumentException("Invalid admitted publication epoch.");
    var expected = batch.ProtectedRequests.Select(item => new ApprovalMember(item.RequestId, item.Call.Id, "Protected", Serialize(new { formatVersion = 1, protectedRequest = item })))
        .Concat(batch.BrowserBindings.Select(item => new ApprovalMember(item.RequestId, item.CallId, "BrowserBypass", Serialize(new { formatVersion = 1, browserBinding = item })))).ToDictionary(item => item.RequestId, StringComparer.Ordinal);
    var decisions = new List<NativeApprovalDecision>(); var captures = new Dictionary<string, long>(StringComparer.Ordinal); var memberStates = new Dictionary<string, string>(StringComparer.Ordinal); long privateBytes = 0; var count = 0;
    await using (var command = Command(connection, $"SELECT request_id,call_id,kind,private_descriptor,state,decision,captured_generation,admitted_generation,admitted_revision,expires_at,result_digest FROM {Approvals} WHERE session_id=@id AND batch_id=@batch ORDER BY request_id LIMIT @limit", ("id", key.Id), ("batch", batch.BatchId), ("limit", Math.Min(256, _options.MaximumCalls) + 1)))
    await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
      while (await reader.ReadAsync(cancellationToken))
      {
        count++;
        if (!expected.TryGetValue(reader.GetString(0), out var member) || reader.IsDBNull(3)) throw new ArgumentException("Missing durable approval descriptor.");
        var descriptor = reader.GetString(3); privateBytes += Encoding.UTF8.GetByteCount(descriptor);
        if (privateBytes > _options.NativeBytes || member.CallId != reader.GetString(1) || member.Kind != reader.GetString(2) || NativeSessionHistory.Canonical(JsonSerializer.Deserialize<JsonElement>(descriptor)) != NativeSessionHistory.Canonical(JsonSerializer.Deserialize<JsonElement>(member.Descriptor)) || reader.GetFieldValue<DateTimeOffset>(9) != expiry || reader.GetInt64(6) > row.Generation) throw new ArgumentException("Inconsistent durable approval member.");
        captures.Add(member.CallId, reader.GetInt64(6));
        memberStates.Add(member.CallId, reader.GetString(4));
        if (member.Kind == "Protected")
        {
          if (state == "Pending") { if (reader.GetString(4) != "Pending" || !reader.IsDBNull(5) || !reader.IsDBNull(7) || !reader.IsDBNull(8) || !reader.IsDBNull(10)) throw new ArgumentException("Consumed pending member."); }
          else
          {
            if (reader.GetString(4) is not ("DecisionAdmitted" or "Settled") || reader.IsDBNull(5) || reader.IsDBNull(7) || reader.IsDBNull(8) || reader.GetInt64(7) != admittedGeneration || reader.GetInt64(8) != admittedRevision || !Enum.TryParse<NativeApprovalDecisionKind>(reader.GetString(5), out var decision)) throw new ArgumentException("Inconsistent consumed member.");
            if (reader.GetInt64(6) > admittedGeneration!.Value || state == "Settled" && reader.GetString(4) != "Settled") throw new ArgumentException("Inconsistent consumed lifecycle.");
            var expectedResult = decision == NativeApprovalDecisionKind.Declined ? "Tool call invocation rejected." : "Tool call invocation rejected. Cancelled by caller.";
            if (reader.GetString(4) == "Settled" && decision != NativeApprovalDecisionKind.Approved
                ? reader.IsDBNull(10) || reader.GetString(10) != ApprovalResultDigest(JsonSerializer.SerializeToElement(expectedResult))
                : !reader.IsDBNull(10)) throw new ArgumentException("Inconsistent protected result settlement.");
            decisions.Add(new(member.RequestId, decision));
          }
        }
        else if (reader.GetString(4) is not ("Pending" or "Settled") || state == "Pending" && reader.GetString(4) != "Pending" || !reader.IsDBNull(5) || !reader.IsDBNull(7) || !reader.IsDBNull(8) || (reader.GetString(4) == "Pending" ? !reader.IsDBNull(10) : reader.IsDBNull(10) || reader.GetString(10) != ApprovalResultDigest(JsonSerializer.SerializeToElement("Tool call invocation rejected. No approval response was provided for this approval required tool call.")))) throw new ArgumentException("Invalid browser bypass authority.");
      }
    if (count != expected.Count) throw new ArgumentException("Incomplete approval membership.");
    foreach (var item in batch.ProtectedRequests)
    {
      var call = await ReadCall(connection, key, item.Call.Id, cancellationToken);
      if (!_catalog.HasVersion(item.Call) || !_catalog.RequiresConfirmation(item.Call.Name) || call is null || !Same(call.Call, item.Call) || call.CapturedGeneration != captures[item.Call.Id] || state == "Pending" && (call.State != "Captured" || call.Generation != 0) || !snapshot.PendingCalls.Any(pending => Same(pending, item.Call))) throw new ArgumentException("Unbound protected model call.");
      if (state != "Pending")
      {
        var decision = decisions.Single(value => value.RequestId == item.RequestId).Kind;
        var settled = memberStates[item.Call.Id] == "Settled";
        var valid = decision == NativeApprovalDecisionKind.Approved
            ? settled ? call.State == "Completed" && call.Generation == admittedGeneration : call.State == "Captured" && call.Generation == 0 || call.State == "Started" && call.Generation == admittedGeneration
            : call.Generation == 0 && call.State == (settled ? decision.ToString() : "Captured");
        if (!valid) throw new ArgumentException("Consumed decision and invocation state disagree.");
      }
    }
    if (state == "DecisionAdmitted" && batch.ProtectedRequests.All(item => memberStates[item.Call.Id] == "Settled")) throw new ArgumentException("Unsettled batch with all protected members settled.");
    if (batch.BrowserBindings.Any(item => _catalog.Contains(item.Name) || !snapshot.ExpectedBrowserCallIds.Contains(item.CallId, StringComparer.Ordinal))) throw new ArgumentException("Unbound browser request.");
    if (!NativeApprovalAdmission.BoundCallsMatch(System.Text.Json.Nodes.JsonNode.Parse(snapshot.PublicRequest)!["messages"]!.AsArray(), bound)) throw new ArgumentException("Unbound public approval positions.");
    return (snapshot, new ApprovalPublication(bound, published, Enum.Parse<NativeApprovalState>(state), decisions.AsReadOnly(), admittedGeneration, admittedRevision, expiry));
  }
  private string Approvals => $"{_schema}.native_approvals";
  private string ApprovalBatches => $"{_schema}.native_approval_batches";

  private async ValueTask RequireSchemaVersion(NpgsqlConnection connection, CancellationToken cancellationToken, bool exclusive = false)
  {
    await using var command = new NpgsqlCommand($"SELECT version FROM {Metadata} WHERE id=1 FOR {(exclusive ? "UPDATE" : "SHARE")}", connection);
    if (await command.ExecuteScalarAsync(cancellationToken) is not int version || version != 2) throw new InvalidOperationException("Unsupported native session schema version.");
  }

  private static string SerializePayload(NativeSessionSnapshot snapshot) => JsonSerializer.Serialize(new
  {
    formatVersion = 2,
    snapshot.NativeJson,
    snapshot.PublicRequest,
    snapshot.PendingCalls,
    snapshot.ExpectedBrowserCallIds,
    snapshot.TurnCompleted,
    snapshot.Approvals
  }, JsonOptions);

  private string ApprovalExpiryBody => $"""
        BEGIN
            IF NEW.expires_at>(SELECT expires_at FROM {Sessions} WHERE id=NEW.session_id FOR UPDATE) THEN
                RAISE EXCEPTION 'Native approval expiry exceeds session retention' USING ERRCODE='23514';
            END IF;
            RETURN NEW;
        END
        """;

  private string SessionApprovalExpiryBody => $"""
        BEGIN
            IF EXISTS(SELECT 1 FROM {Approvals} WHERE session_id=NEW.id AND expires_at>NEW.expires_at)
                OR EXISTS(SELECT 1 FROM {ApprovalBatches} WHERE session_id=NEW.id AND expires_at>NEW.expires_at) THEN
                RAISE EXCEPTION 'Native session retention cannot strand approval expiry' USING ERRCODE='23514';
            END IF;
            RETURN NEW;
        END
        """;

  private async ValueTask CreateApprovalSchema(NpgsqlConnection connection, CancellationToken cancellationToken)
  {
    await Execute(connection, $"""
            CREATE TABLE {ApprovalBatches}(
                session_id text NOT NULL REFERENCES {Sessions}(id),batch_id text NOT NULL CHECK(octet_length(batch_id) BETWEEN 1 AND 1024),
                published_revision bigint CHECK(published_revision>=1),member_digest text NOT NULL CHECK(length(member_digest)=64 AND member_digest ~ '^[A-F0-9]+$'),
                member_count integer NOT NULL CHECK(member_count BETWEEN 1 AND 256),
                state text NOT NULL CHECK(state IN ('Pending','DecisionAdmitted','Settled','Retired')),
                admitted_generation bigint CHECK(admitted_generation>=1),admitted_revision bigint CHECK(admitted_revision>=1),expires_at timestamptz NOT NULL,
                CHECK((admitted_generation IS NULL)=(admitted_revision IS NULL)),
                CHECK(state NOT IN ('DecisionAdmitted','Settled') OR (published_revision IS NOT NULL AND admitted_generation IS NOT NULL)),
                PRIMARY KEY(session_id,batch_id));
            CREATE TABLE {Approvals}(
                session_id text NOT NULL,request_id text NOT NULL CHECK(octet_length(request_id) BETWEEN 1 AND 1024),
                call_id text NOT NULL CHECK(octet_length(call_id) BETWEEN 1 AND 1024),batch_id text NOT NULL,
                kind text NOT NULL CHECK(kind IN ('Protected','BrowserBypass')),
                private_descriptor text CHECK(private_descriptor IS NULL OR (octet_length(private_descriptor)<=1048576 AND jsonb_typeof(private_descriptor::jsonb)='object')),
                state text NOT NULL CHECK(state IN ('Pending','DecisionAdmitted','Settled','Retired')),
                decision text CHECK(decision IN ('Approved','Declined','Cancelled')),
                captured_generation bigint NOT NULL CHECK(captured_generation>=1),
                admitted_generation bigint CHECK(admitted_generation>=1),admitted_revision bigint CHECK(admitted_revision>=1),expires_at timestamptz NOT NULL,
                result_digest text CHECK(length(result_digest)=64 AND result_digest ~ '^[A-F0-9]+$'),
                CHECK(kind='Protected' OR (decision IS NULL AND admitted_generation IS NULL AND admitted_revision IS NULL AND state<>'DecisionAdmitted')),
                CHECK((admitted_generation IS NULL)=(admitted_revision IS NULL)),
                CHECK(kind<>'Protected' OR state NOT IN ('DecisionAdmitted','Settled') OR (decision IS NOT NULL AND admitted_generation IS NOT NULL)),
                PRIMARY KEY(session_id,request_id),UNIQUE(session_id,call_id),
                FOREIGN KEY(session_id,batch_id) REFERENCES {ApprovalBatches}(session_id,batch_id));
            CREATE FUNCTION {_schema}.native_approval_expiry() RETURNS trigger LANGUAGE plpgsql AS $expiry$
            {ApprovalExpiryBody}
            $expiry$;
            CREATE FUNCTION {_schema}.native_session_approval_expiry() RETURNS trigger LANGUAGE plpgsql AS $expiry$
            {SessionApprovalExpiryBody}
            $expiry$;
            CREATE TRIGGER native_session_approval_expiry BEFORE UPDATE OF expires_at ON {Sessions} FOR EACH ROW EXECUTE FUNCTION {_schema}.native_session_approval_expiry();
            CREATE TRIGGER native_approval_expiry BEFORE INSERT OR UPDATE ON {Approvals} FOR EACH ROW EXECUTE FUNCTION {_schema}.native_approval_expiry();
            CREATE TRIGGER native_batch_expiry BEFORE INSERT OR UPDATE ON {ApprovalBatches} FOR EACH ROW EXECUTE FUNCTION {_schema}.native_approval_expiry();
            """, cancellationToken);
  }

  // Count the union: protected requests share an invocation, while browser-only and purged fences still consume capacity.
  private async ValueTask<bool> HasCallCapacity(NpgsqlConnection connection, NativeSessionKey key, string callId, CancellationToken cancellationToken)
  {
    await using var command = Command(connection, $"SELECT count(*) FROM (SELECT call_id FROM {Calls} WHERE session_id=@id UNION SELECT call_id FROM {Approvals} WHERE session_id=@id UNION SELECT @call::text) retained", ("id", key.Id), ("call", callId));
    if ((long)(await command.ExecuteScalarAsync(cancellationToken))! > _options.MaximumCalls) return false;
    return await HasApprovalCapacity(connection, key, 0, 0, cancellationToken);
  }

  // Count all retained request fences and every approval-associated private copy under the selector lock.
  private async ValueTask<bool> HasApprovalCapacity(NpgsqlConnection connection, NativeSessionKey key, int additionalBindings, long additionalPrivateBytes, CancellationToken cancellationToken, string[]? additionalProtectedCalls = null, long? prospectivePayloadBytes = null)
  {
    if (prospectivePayloadBytes is < 0) return false;
    if (additionalBindings < 0 || additionalPrivateBytes < 0 || additionalPrivateBytes > _options.NativeBytes) return false;
    long bindings; long storedBytes; string? payload;
    await using (var command = Command(connection, $"SELECT count(*),COALESCE(sum(octet_length(private_descriptor)),0)::bigint FROM {Approvals} WHERE session_id=@id", ("id", key.Id)))
    await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
    {
      await reader.ReadAsync(cancellationToken);
      bindings = reader.GetInt64(0); storedBytes = reader.GetInt64(1);
    }
    if (bindings + additionalBindings > _options.MaximumCalls || storedBytes + additionalPrivateBytes > _options.NativeBytes) return false;
    await using (var command = Command(connection, $"SELECT COALESCE(sum(octet_length(c.descriptor)),0)::bigint FROM {Calls} c WHERE c.session_id=@id AND (c.call_id=ANY(@newcalls) OR EXISTS(SELECT 1 FROM {Approvals} a WHERE a.session_id=@id AND a.call_id=c.call_id AND a.kind='Protected'))", ("id", key.Id), ("newcalls", additionalProtectedCalls ?? [])))
      storedBytes += (long)(await command.ExecuteScalarAsync(cancellationToken))!;
    if (storedBytes + additionalPrivateBytes > _options.NativeBytes) return false;
    if (prospectivePayloadBytes is long replacementBytes) return storedBytes + additionalPrivateBytes + replacementBytes <= _options.NativeBytes;
    await using (var command = Command(connection, $"SELECT payload FROM {Sessions} WHERE id=@id", ("id", key.Id)))
      payload = await command.ExecuteScalarAsync(cancellationToken) as string;
    try { return storedBytes + additionalPrivateBytes + ApprovalPayloadBytes(payload) <= _options.NativeBytes; }
    catch (Exception exception) when (BadInput(exception)) { return false; }
  }

  // Opaque NativeJson and ordinary calls retain their separate M1 budgets. Only approval-associated copies count here.
  private long ApprovalPayloadBytes(string? payload)
  {
    if (payload is null) return 0;
    if (Encoding.UTF8.GetByteCount(payload) > _options.NativeBytes * 6L + _options.PublicBytes * 6L + (long)_options.MaximumCalls * _options.ArgumentBytes * 6L) throw new ArgumentException("Oversized native payload.");
    using var document = JsonDocument.Parse(payload);
    var root = document.RootElement;
    var approvals = root.GetProperty("approvals");
    var pending = approvals.GetProperty("pendingBatch");
    if (pending.ValueKind == JsonValueKind.Null) return 0;
    var batch = pending.GetProperty("batch");
    var protectedRequests = batch.GetProperty("protectedRequests");
    var browserBindings = batch.GetProperty("browserBindings");
    if (protectedRequests.ValueKind != JsonValueKind.Array || browserBindings.ValueKind != JsonValueKind.Array || protectedRequests.GetArrayLength() + browserBindings.GetArrayLength() > Math.Min(256, _options.MaximumCalls)) throw new ArgumentException("Oversized approval bindings.");
    long bytes = Encoding.UTF8.GetByteCount(approvals.GetRawText());
    if (bytes > _options.NativeBytes) return bytes;
    var protectedCalls = protectedRequests.EnumerateArray().Select(item => item.GetProperty("call").GetProperty("id").GetString()).ToHashSet(StringComparer.Ordinal);
    var calls = root.GetProperty("pendingCalls");
    if (calls.ValueKind != JsonValueKind.Array || calls.GetArrayLength() > _options.MaximumCalls) throw new ArgumentException("Oversized pending descriptors.");
    foreach (var call in calls.EnumerateArray())
      if (protectedCalls.Contains(call.GetProperty("id").GetString())) bytes += Encoding.UTF8.GetByteCount(call.GetRawText());
    return bytes;
  }

  private long CountApprovalDescriptors(NativeApprovalBatch capture)
  {
    using var counter = new ApprovalByteCounter(_options.NativeBytes);
    foreach (var item in capture.ProtectedRequests)
    {
      var before = counter.Length;
      JsonSerializer.Serialize(counter, new { formatVersion = 1, protectedRequest = item }, JsonOptions);
      if (counter.Length - before > 1048576) throw new ApprovalBudgetExceededException();
    }
    foreach (var item in capture.BrowserBindings)
    {
      var before = counter.Length;
      JsonSerializer.Serialize(counter, new { formatVersion = 1, browserBinding = item }, JsonOptions);
      if (counter.Length - before > 1048576) throw new ApprovalBudgetExceededException();
    }
    return counter.Length;
  }
  /// <summary>Counts exact prospective approval payload copies before aggregate serialization.</summary>
  private long CountApprovalPayload(NativeApprovalSnapshot approvals, IReadOnlyList<NativeToolCall> pendingCalls)
  {
    if (approvals.PendingBatch is not { } pending) return 0;
    using var counter = new ApprovalByteCounter(_options.NativeBytes);
    JsonSerializer.Serialize(counter, approvals, JsonOptions);
    var protectedIds = pending.Batch.ProtectedRequests.Select(item => item.Call.Id).ToHashSet(StringComparer.Ordinal);
    foreach (var call in pendingCalls.Where(item => protectedIds.Contains(item.Id))) JsonSerializer.Serialize(counter, call, JsonOptions);
    return counter.Length;
  }
  /// <summary>Validates an unpublished genuine capture without manufacturing published or acquired evidence.</summary>
  private async ValueTask<bool> CanPublishApprovalBatch(NpgsqlConnection connection, Row row, NativeSessionLease lease, NativeSessionSnapshot snapshot, DateTimeOffset now, CancellationToken cancellationToken)
  {
    if (snapshot.Approvals.PendingBatch is not { } bound) return true;
    var batch = bound.Batch;
    if (snapshot.TurnCompleted || batch.ProtectedRequests.Count + batch.BrowserBindings.Count > _options.MaximumCalls || !NativeApprovalAdmission.BoundCallsMatch(System.Text.Json.Nodes.JsonNode.Parse(snapshot.PublicRequest)!["messages"]!.AsArray(), bound)) return false;
    await using (var command = Command(connection, $"SELECT member_digest,member_count,state,published_revision,admitted_generation,admitted_revision,expires_at FROM {ApprovalBatches} WHERE session_id=@id AND batch_id=@batch", ("id", lease.Key.Id), ("batch", batch.BatchId)))
    await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
    {
      if (!await reader.ReadAsync(cancellationToken) || reader.GetString(0) != ApprovalDigest(batch) || reader.GetInt32(1) != batch.ProtectedRequests.Count + batch.BrowserBindings.Count || reader.GetString(2) != "Pending" || !reader.IsDBNull(3) || !reader.IsDBNull(4) || !reader.IsDBNull(5) || reader.GetFieldValue<DateTimeOffset>(6) != row.Expires || reader.GetFieldValue<DateTimeOffset>(6) <= now) return false;
    }
    var expected = batch.ProtectedRequests.Select(item => new ApprovalMember(item.RequestId, item.Call.Id, "Protected", Serialize(new { formatVersion = 1, protectedRequest = item })))
        .Concat(batch.BrowserBindings.Select(item => new ApprovalMember(item.RequestId, item.CallId, "BrowserBypass", Serialize(new { formatVersion = 1, browserBinding = item })))).ToDictionary(item => item.RequestId, StringComparer.Ordinal);
    var count = 0;
    await using (var command = Command(connection, $"SELECT request_id,call_id,kind,private_descriptor,state,captured_generation,decision,admitted_generation,admitted_revision,result_digest,expires_at FROM {Approvals} WHERE session_id=@id AND batch_id=@batch LIMIT @limit", ("id", lease.Key.Id), ("batch", batch.BatchId), ("limit", _options.MaximumCalls + 1)))
    await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
      while (await reader.ReadAsync(cancellationToken))
      {
        count++;
        if (!expected.TryGetValue(reader.GetString(0), out var item) || item.CallId != reader.GetString(1) || item.Kind != reader.GetString(2) || reader.IsDBNull(3) || NativeSessionHistory.Canonical(JsonSerializer.Deserialize<JsonElement>(reader.GetString(3))) != NativeSessionHistory.Canonical(JsonSerializer.Deserialize<JsonElement>(item.Descriptor)) || reader.GetString(4) != "Pending" || reader.GetInt64(5) != lease.Generation || !reader.IsDBNull(6) || !reader.IsDBNull(7) || !reader.IsDBNull(8) || !reader.IsDBNull(9) || reader.GetFieldValue<DateTimeOffset>(10) != row.Expires) return false;
      }
    if (count != expected.Count) return false;
    foreach (var item in batch.ProtectedRequests)
    {
      var call = await ReadCall(connection, lease.Key, item.Call.Id, cancellationToken);
      if (!_catalog.HasVersion(item.Call) || !_catalog.RequiresConfirmation(item.Call.Name) || call is not { State: "Captured", Generation: 0 } || call.CapturedGeneration != lease.Generation || !Same(call.Call, item.Call) || !snapshot.PendingCalls.Any(pending => Same(pending, item.Call))) return false;
    }
    var browserNames = System.Text.Json.Nodes.JsonNode.Parse(row.AdmittedRequest!)!["tools"]!.AsArray().Select(item => item!["name"]!.GetValue<string>()).ToHashSet(StringComparer.Ordinal);
    foreach (var item in batch.BrowserBindings)
      if (_catalog.Contains(item.Name) || !browserNames.Contains(item.Name) || !snapshot.ExpectedBrowserCallIds.Contains(item.CallId, StringComparer.Ordinal) || await ReadCall(connection, lease.Key, item.CallId, cancellationToken) is not null) return false;
    return true;
  }
  private sealed class ApprovalBudgetExceededException : InvalidOperationException;
  private sealed class ApprovalByteCounter(long limit) : Stream
  {
    private long _length;
    public override bool CanRead => false;
    public override bool CanSeek => false;
    public override bool CanWrite => true;
    public override long Length => _length;
    public override long Position { get => _length; set => throw new NotSupportedException(); }
    public override void Flush() { }
    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => Write(buffer.AsSpan(offset, count));
    public override void Write(ReadOnlySpan<byte> buffer)
    {
      if (buffer.Length > limit - _length) throw new ApprovalBudgetExceededException();
      _length += buffer.Length;
    }
  }

  private async ValueTask MigrateNativePayloads(NpgsqlConnection connection, CancellationToken cancellationToken)
  {
    // Bounded row materialization, with no opaque native-StateBag interpretation or current catalog rewrite.
    var after = "";
    while (true)
    {
      var rows = new List<(string Id, string Agent, string Scope, string Selector, string Key, string Compatibility, string? Payload, bool Saved)>();
      await using (var command = Command(connection, $"SELECT id,agent,scope,selector,key_data,compatibility,payload,ever_saved FROM {Sessions} WHERE id>@after ORDER BY id LIMIT @limit FOR UPDATE", ("after", after), ("limit", 1)))
      await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        while (await reader.ReadAsync(cancellationToken)) rows.Add((reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetString(5), reader.IsDBNull(6) ? null : reader.GetString(6), reader.GetBoolean(7)));
      if (rows.Count == 0) break;
      foreach (var row in rows)
      {
        var key = JsonSerializer.Deserialize<NativeSessionKey>(row.Key, JsonOptions) ?? throw new JsonException();
        if (key.Id != row.Id || key.Agent != row.Agent || key.Scope != row.Scope || key.Selector != row.Selector || KeyData(key) != row.Key) throw new InvalidOperationException("Invalid persisted native session key.");
        using var compatibility = JsonDocument.Parse(row.Compatibility);
        var identity = compatibility.RootElement;
        if (identity.ValueKind != JsonValueKind.Array || identity.GetArrayLength() != 3 || identity[0].GetString() != "hashbrown-native-v1" || identity.EnumerateArray().Any(value => value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(value.GetString()) || Encoding.UTF8.GetByteCount(value.GetString()!) > 4096)) throw new InvalidOperationException("Invalid persisted native compatibility.");
        if (row.Payload is not null)
        {
          var snapshot = ReadLegacyPayload(row.Payload, key, row.Saved);
          await Execute(connection, $"UPDATE {Sessions} SET payload=@payload WHERE id=@id", cancellationToken, ("payload", SerializePayload(snapshot)), ("id", row.Id));
        }
      }
      after = rows[^1].Id;
    }
  }

  private NativeSessionSnapshot ReadLegacyPayload(string payload, NativeSessionKey key, bool saved)
  {
    if (Encoding.UTF8.GetByteCount(payload) > _options.NativeBytes * 6L + _options.PublicBytes * 6L + (long)_options.MaximumCalls * _options.ArgumentBytes * 6L) throw new ArgumentException("Oversized legacy native payload.");
    using var document = JsonDocument.Parse(payload);
    var root = document.RootElement;
    string[] fields = ["nativeJson", "publicRequest", "pendingCalls", "expectedBrowserCallIds", "turnCompleted"];
    if (root.ValueKind != JsonValueKind.Object || !root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).SequenceEqual(fields.Order(StringComparer.Ordinal))) throw new JsonException("Unknown or incomplete legacy native payload.");
    var native = root.GetProperty("nativeJson");
    if (native.ValueKind is not (JsonValueKind.Null or JsonValueKind.String) || saved && native.ValueKind != JsonValueKind.String) throw new JsonException("Missing saved native state.");
    if (native.ValueKind == JsonValueKind.String) ValidateNative(native.GetString()!);
    var publicRequest = root.GetProperty("publicRequest").GetString() ?? throw new JsonException();
    // Structural validation must preserve incompatible old catalog identities rather than adopt the initializer's catalog.
    if (NativeSessionHistory.Normalize(publicRequest, key, new NativeToolCatalog([]), _options) != publicRequest) throw new JsonException("Invalid legacy public history.");
    var calls = JsonSerializer.Deserialize<NativeToolCall[]>(root.GetProperty("pendingCalls"), JsonOptions) ?? throw new JsonException();
    var browser = JsonSerializer.Deserialize<string[]>(root.GetProperty("expectedBrowserCallIds"), JsonOptions) ?? throw new JsonException();
    if (calls.Length > _options.MaximumCalls || browser.Length > _options.MaximumCalls || calls.Any(call => call is null || Encoding.UTF8.GetByteCount(call.Arguments.GetRawText()) > _options.ArgumentBytes) || calls.Select(call => call.Id).Distinct(StringComparer.Ordinal).Count() != calls.Length || browser.Any(id => string.IsNullOrWhiteSpace(id) || Encoding.UTF8.GetByteCount(id) > 1024) || browser.Distinct(StringComparer.Ordinal).Count() != browser.Length) throw new JsonException("Invalid legacy pending descriptors.");
    var completed = root.GetProperty("turnCompleted").GetBoolean();
    if (completed && (calls.Length != 0 || browser.Length != 0)) throw new JsonException("Invalid completed legacy pending state.");
    var publicRoot = System.Text.Json.Nodes.JsonNode.Parse(publicRequest)!;
    var messages = publicRoot["messages"]!.AsArray();
    var publicCalls = messages.SelectMany(message => message!["toolCalls"] is System.Text.Json.Nodes.JsonArray entries ? entries : []).ToDictionary(call => call!["id"]!.GetValue<string>(), call => call!, StringComparer.Ordinal);
    var results = messages.Where(message => message!["role"]!.GetValue<string>() == "tool").Select(message => message!["toolCallId"]!.GetValue<string>()).ToHashSet(StringComparer.Ordinal);
    var browserNames = publicRoot["tools"]?.AsArray().Select(tool => tool!["name"]!.GetValue<string>()).ToHashSet(StringComparer.Ordinal) ?? [];
    var expectedBrowser = publicCalls.Where(pair => !results.Contains(pair.Key) && browserNames.Contains(pair.Value["function"]!["name"]!.GetValue<string>())).Select(pair => pair.Key).ToHashSet(StringComparer.Ordinal);
    if (!expectedBrowser.SetEquals(browser) || publicCalls.Any(pair => !results.Contains(pair.Key) && !expectedBrowser.Contains(pair.Key) && !calls.Any(call => call.Id == pair.Key))) throw new JsonException("Inconsistent legacy pending call identities.");
    foreach (var call in calls)
    {
      if (publicCalls.TryGetValue(call.Id, out var recorded))
      {
        if (results.Contains(call.Id) || expectedBrowser.Contains(call.Id) || recorded["function"]!["name"]!.GetValue<string>() != call.Name || !System.Text.Json.Nodes.JsonNode.DeepEquals(System.Text.Json.Nodes.JsonNode.Parse(recorded["function"]!["arguments"]!.GetValue<string>()), System.Text.Json.Nodes.JsonNode.Parse(call.Arguments.GetRawText()))) throw new JsonException("Inconsistent legacy server descriptor.");
      }
      else if (browser.Length == 0 || completed) throw new JsonException("Unbound legacy private server descriptor.");
    }
    if (native.ValueKind == JsonValueKind.Null && (calls.Length != 0 || browser.Length != 0 || completed || !NativeSessionHistory.Admits(publicRequest, null))) throw new JsonException("Invalid legacy virgin state.");
    return new(native.ValueKind == JsonValueKind.String ? native.GetString() : null, publicRequest, calls, browser, completed, NativeApprovalSnapshot.Empty);
  }

  private async ValueTask ValidateSchema(NpgsqlConnection connection, int version, CancellationToken cancellationToken)
  {
    // Required structures only: harmless operational indexes and unrelated workflow schema are outside this manifest.
    var columns = new Dictionary<string, string>
    {
      ["native_metadata"] = "id:integer version:integer",
      ["native_sessions"] = "id:text agent:text scope:text selector:text key_data:text compatibility:text state:text token:text? generation:bigint revision:bigint claim_revision:bigint ever_saved:boolean lease_until:timestamp with time zone? expires_at:timestamp with time zone payload:text? admitted_request:text?",
      ["native_invocations"] = "session_id:text call_id:text name:text version:integer descriptor:text? state:text captured_generation:bigint dispatch_generation:bigint?",
      ["native_audit"] = "id:bigint session_id:text scope:text actor:text prior_state:text prior_generation:bigint prior_revision:bigint outcome:text reason:text evidence_reference:text recorded_at:timestamp with time zone"
    };
    if (version == 2)
    {
      columns["native_approval_batches"] = "session_id:text batch_id:text published_revision:bigint? member_digest:text member_count:integer state:text admitted_generation:bigint? admitted_revision:bigint? expires_at:timestamp with time zone";
      columns["native_approvals"] = "session_id:text request_id:text call_id:text batch_id:text kind:text private_descriptor:text? state:text decision:text? captured_generation:bigint admitted_generation:bigint? admitted_revision:bigint? expires_at:timestamp with time zone result_digest:text?";
    }
    var actual = new Dictionary<string, (string Type, bool Nullable)>(StringComparer.Ordinal);
    await using (var command = Command(connection, "SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod),NOT a.attnotnull FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.relnamespace=@schema::regnamespace AND a.attnum>0 AND NOT a.attisdropped", ("schema", _schema)))
    await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
      while (await reader.ReadAsync(cancellationToken)) actual.Add(reader.GetString(0) + "." + reader.GetString(1), (reader.GetString(2), reader.GetBoolean(3)));
    foreach (var (table, manifest) in columns)
      foreach (Match column in Regex.Matches(manifest, @"(\w+):(timestamp with time zone|\w+)(\?)?"))
        if (!actual.TryGetValue(table + "." + column.Groups[1].Value, out var found) || found.Type != column.Groups[2].Value || found.Nullable != column.Groups[3].Success) throw new InvalidOperationException("Missing or incompatible required native schema column.");
    var constraints = new Dictionary<string, string>(StringComparer.Ordinal);
    await using (var command = Command(connection, "SELECT c.relname,k.conname,pg_get_constraintdef(k.oid) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE c.relnamespace=@schema::regnamespace AND k.convalidated", ("schema", _schema)))
    await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
      while (await reader.ReadAsync(cancellationToken)) constraints[reader.GetString(0) + "." + reader.GetString(1)] = reader.GetString(2);
    var required = new Dictionary<string, string>
    {
      ["native_metadata.native_metadata_pkey"] = "PRIMARY KEY (id)",
      ["native_metadata.native_metadata_id_check"] = "CHECK ((id = 1))",
      ["native_sessions.native_sessions_pkey"] = "PRIMARY KEY (id)",
      ["native_sessions.native_sessions_state_check"] = States("Ready", "Owned", "Saved", "Publishing", "PublicationUnknown", "Blocked", "Retired"),
      ["native_sessions.native_sessions_generation_check"] = "CHECK ((generation >= 1))",
      ["native_sessions.native_sessions_revision_check"] = "CHECK ((revision >= 1))",
      ["native_sessions.native_sessions_claim_revision_check"] = "CHECK ((claim_revision >= 1))",
      ["native_sessions.native_sessions_check"] = "CHECK (((state <> ALL (ARRAY['Owned'::text, 'Saved'::text, 'Publishing'::text])) OR ((token IS NOT NULL) AND (lease_until IS NOT NULL))))",
      ["native_invocations.native_invocations_pkey"] = "PRIMARY KEY (session_id, call_id)",
      ["native_invocations.native_invocations_session_id_fkey"] = $"FOREIGN KEY (session_id) REFERENCES {Sessions}(id)",
      ["native_invocations.native_invocations_version_check"] = "CHECK ((version > 0))",
      ["native_invocations.native_invocations_state_check"] = version == 1 ? States("Captured", "Started", "Completed") : States("Captured", "Started", "Completed", "Declined", "Cancelled"),
      ["native_audit.native_audit_pkey"] = "PRIMARY KEY (id)",
      ["native_audit.native_audit_session_id_fkey"] = $"FOREIGN KEY (session_id) REFERENCES {Sessions}(id)"
    };
    if (version == 2)
    {
      required["native_approval_batches.native_approval_batches_pkey"] = "PRIMARY KEY (session_id, batch_id)";
      required["native_approval_batches.native_approval_batches_session_id_fkey"] = $"FOREIGN KEY (session_id) REFERENCES {Sessions}(id)";
      required["native_approvals.native_approvals_pkey"] = "PRIMARY KEY (session_id, request_id)";
      required["native_approvals.native_approvals_session_id_call_id_key"] = "UNIQUE (session_id, call_id)";
      required["native_approvals.native_approvals_session_id_batch_id_fkey"] = $"FOREIGN KEY (session_id, batch_id) REFERENCES {ApprovalBatches}(session_id, batch_id)";
      required["native_approval_batches.native_approval_batches_admitted_generation_check"] = "CHECK ((admitted_generation >= 1))";
      required["native_approval_batches.native_approval_batches_admitted_revision_check"] = "CHECK ((admitted_revision >= 1))";
      required["native_approval_batches.native_approval_batches_batch_id_check"] = "CHECK (((octet_length(batch_id) >= 1) AND (octet_length(batch_id) <= 1024)))";
      required["native_approval_batches.native_approval_batches_check"] = "CHECK (((admitted_generation IS NULL) = (admitted_revision IS NULL)))";
      required["native_approval_batches.native_approval_batches_check1"] = "CHECK (((state <> ALL (ARRAY['DecisionAdmitted'::text, 'Settled'::text])) OR ((published_revision IS NOT NULL) AND (admitted_generation IS NOT NULL))))";
      required["native_approval_batches.native_approval_batches_member_count_check"] = "CHECK (((member_count >= 1) AND (member_count <= 256)))";
      required["native_approval_batches.native_approval_batches_member_digest_check"] = "CHECK (((length(member_digest) = 64) AND (member_digest ~ '^[A-F0-9]+$'::text)))";
      required["native_approval_batches.native_approval_batches_published_revision_check"] = "CHECK ((published_revision >= 1))";
      required["native_approval_batches.native_approval_batches_state_check"] = "CHECK ((state = ANY (ARRAY['Pending'::text, 'DecisionAdmitted'::text, 'Settled'::text, 'Retired'::text])))";
      required["native_approvals.native_approvals_admitted_generation_check"] = "CHECK ((admitted_generation >= 1))";
      required["native_approvals.native_approvals_admitted_revision_check"] = "CHECK ((admitted_revision >= 1))";
      required["native_approvals.native_approvals_captured_generation_check"] = "CHECK ((captured_generation >= 1))";
      required["native_approvals.native_approvals_call_id_check"] = "CHECK (((octet_length(call_id) >= 1) AND (octet_length(call_id) <= 1024)))";
      required["native_approvals.native_approvals_check"] = "CHECK (((kind = 'Protected'::text) OR ((decision IS NULL) AND (admitted_generation IS NULL) AND (admitted_revision IS NULL) AND (state <> 'DecisionAdmitted'::text))))";
      required["native_approvals.native_approvals_check1"] = "CHECK (((admitted_generation IS NULL) = (admitted_revision IS NULL)))";
      required["native_approvals.native_approvals_check2"] = "CHECK (((kind <> 'Protected'::text) OR (state <> ALL (ARRAY['DecisionAdmitted'::text, 'Settled'::text])) OR ((decision IS NOT NULL) AND (admitted_generation IS NOT NULL))))";
      required["native_approvals.native_approvals_decision_check"] = "CHECK ((decision = ANY (ARRAY['Approved'::text, 'Declined'::text, 'Cancelled'::text])))";
      required["native_approvals.native_approvals_kind_check"] = "CHECK ((kind = ANY (ARRAY['Protected'::text, 'BrowserBypass'::text])))";
      required["native_approvals.native_approvals_private_descriptor_check"] = "CHECK (((private_descriptor IS NULL) OR ((octet_length(private_descriptor) <= 1048576) AND (jsonb_typeof((private_descriptor)::jsonb) = 'object'::text))))";
      required["native_approvals.native_approvals_request_id_check"] = "CHECK (((octet_length(request_id) >= 1) AND (octet_length(request_id) <= 1024)))";
      required["native_approvals.native_approvals_result_digest_check"] = "CHECK (((length(result_digest) = 64) AND (result_digest ~ '^[A-F0-9]+$'::text)))";
      required["native_approvals.native_approvals_state_check"] = "CHECK ((state = ANY (ARRAY['Pending'::text, 'DecisionAdmitted'::text, 'Settled'::text, 'Retired'::text])))";
      await using var trigger = Command(connection, "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid WHERE c.relnamespace=@schema::regnamespace AND ((c.relname='native_approvals' AND t.tgname='native_approval_expiry') OR (c.relname='native_approval_batches' AND t.tgname='native_batch_expiry')) AND t.tgenabled IN ('O','A') AND t.tgtype=23 AND t.tgqual IS NULL AND t.tgattr::text='' AND t.tgnargs=0 AND p.pronamespace=c.relnamespace AND p.proname='native_approval_expiry' AND regexp_replace(p.prosrc,'[[:space:]]','','g')=regexp_replace(@body,'[[:space:]]','','g')", ("schema", _schema), ("body", ApprovalExpiryBody));
      if ((long)(await trigger.ExecuteScalarAsync(cancellationToken))! != 2) throw new InvalidOperationException("Missing required native approval expiry guards.");
      await using var parentTrigger = Command(connection, "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='expires_at' WHERE c.relnamespace=@schema::regnamespace AND c.relname='native_sessions' AND t.tgname='native_session_approval_expiry' AND t.tgenabled IN ('O','A') AND t.tgtype=19 AND t.tgqual IS NULL AND t.tgattr::text=a.attnum::text AND t.tgnargs=0 AND p.pronamespace=c.relnamespace AND p.proname='native_session_approval_expiry' AND regexp_replace(p.prosrc,'[[:space:]]','','g')=regexp_replace(@body,'[[:space:]]','','g')", ("schema", _schema), ("body", SessionApprovalExpiryBody));
      if ((long)(await parentTrigger.ExecuteScalarAsync(cancellationToken))! != 1) throw new InvalidOperationException("Missing required native session approval expiry guard.");
    }
    foreach (var (name, definition) in required)
      if (!constraints.TryGetValue(name, out var found) || Compact(found) != Compact(definition)) throw new InvalidOperationException("Missing or incompatible required native safety constraint: " + name);
  }

  private static string States(params string[] states) => StatesFor("state", states);
  private static string StatesFor(string column, params string[] states) => $"CHECK (({column} = ANY (ARRAY[{string.Join(", ", states.Select(state => "'" + state + "'::text"))}])))";
  private static string Compact(string sql) => Regex.Replace(sql.Replace("\"", "", StringComparison.Ordinal), @"\s+", "");
}
