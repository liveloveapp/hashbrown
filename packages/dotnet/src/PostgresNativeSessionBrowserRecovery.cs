using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Npgsql;

namespace Hashbrown.AspNetCore;

public sealed partial class PostgresNativeSessionJournal
{
  private const string LegacyBrowserBypassResult = "Tool call invocation rejected. No approval response was provided for this approval required tool call.";

  /// <inheritdoc />
  async ValueTask<NativeSessionAdmission> INativeSessionBrowserRecoveryJournal.TryAcquireBrowserRecoveryAsync(
      NativeSessionKey key, string originalRawRequestJson, NativeBrowserRecoveryRequest recovery, CancellationToken cancellationToken)
  {
    NativeBrowserRecoveryRequest parsed;
    try
    {
      if (originalRawRequestJson is null || recovery is null || new UTF8Encoding(false, true).GetByteCount(originalRawRequestJson) > _options.PublicBytes) return new(400);
      parsed = NativeBrowserRecoveryAdmission.Parse(originalRawRequestJson, _options) ?? throw new ArgumentException("Explicit recovery evidence is required.");
      if (parsed.ProtocolVersion != recovery.ProtocolVersion || parsed.ServerRevision != recovery.ServerRevision ||
          !parsed.Outcomes.Select(item => (item.ToolCallId, item.Status)).SequenceEqual(recovery.Outcomes.Select(item => (item.ToolCallId, item.Status)))) return new(400);
      var sanitized = NativeBrowserRecoveryAdmission.Sanitize(originalRawRequestJson);
      ValidateRecoveryCallBounds(sanitized.ToJsonString());
      using var original = JsonDocument.Parse(originalRawRequestJson);
      if (original.RootElement.TryGetProperty("resume", out var rawResume))
      {
        if (rawResume.ValueKind != JsonValueKind.Array) return new(400);
        if (rawResume.GetArrayLength() > 0) _ = NativeApprovalAdmission.Parse(NativeBrowserRecoveryAdmission.Sanitize(originalRawRequestJson, removeResume: false).ToJsonString(), key, _catalog, _options);
      }
      var normalized = NativeSessionHistory.Normalize(sanitized.ToJsonString(), key, _catalog, _options);
      ValidateRecoveryCallBounds(normalized);
    }
    catch (Exception exception) when (BadInput(exception)) { return new(400); }
    try
    {
      await using var connection = await _source.OpenConnectionAsync(cancellationToken);
      await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
      await RequireSchemaVersion(connection, cancellationToken);
      var row = await Read(connection, key, cancellationToken);
      var now = await Now(connection, cancellationToken);
      if (row is null || row.KeyData != KeyData(key)) return new(410);
      if (row.Compatibility != _compatibility) return new(409);
      if (row.State == "Retired" || row.Expires <= now) return new(410);
      if (row.State != "Ready" || row.Revision != parsed.ServerRevision || !row.EverSaved) return new(409);
      var token = Guid.NewGuid().ToString("N");
      var lease = new NativeSessionLease(key, token, row.Generation + 1, row.Revision + 1);
      NativeSessionSnapshot snapshot;
      NativeApprovalEvidence? approval;
      string canonical;
      try
      {
        (snapshot, approval) = await ReadApprovalSnapshot(connection, row, lease, now, cancellationToken);
        if (snapshot.NativeJson is null || snapshot.TurnCompleted || snapshot.ExpectedBrowserCallIds.Count == 0) return new(409);
        var sanitized = NativeBrowserRecoveryAdmission.Sanitize(originalRawRequestJson, snapshot.PublicRequest);
        canonical = NativeSessionHistory.Normalize(sanitized.ToJsonString(), key, _catalog, _options);
        ValidateRecoveryCallBounds(canonical);
        if (!AdmitsBrowserRecoverySuffix(canonical, snapshot, parsed.Outcomes.Select(item => item.ToolCallId).ToArray())) return new(400);
        using var document = JsonDocument.Parse(originalRawRequestJson);
        var hasDecisions = document.RootElement.TryGetProperty("resume", out var resume) && resume.ValueKind == JsonValueKind.Array && resume.GetArrayLength() > 0;
        if (approval is null)
        {
          if (hasDecisions) return new(400);
        }
        else
        {
          var decisionInput = NativeBrowserRecoveryAdmission.Sanitize(originalRawRequestJson, snapshot.PublicRequest, removeResume: false);
          var admission = NativeApprovalAdmission.Parse(decisionInput.ToJsonString(), key, _catalog, _options);
          if (!NativeApprovalAdmission.MatchesPublishedBatch(admission, approval) ||
              !snapshot.ExpectedBrowserCallIds.ToHashSet(StringComparer.Ordinal).SetEquals(approval.Batch.Batch.BrowserBindings.Select(item => item.CallId))) return new(400);
        }
      }
      catch (Exception exception) when (BadInput(exception)) { return new(400); }
      await RemoveUncommittedCalls(connection, key, snapshot, cancellationToken);
      await Execute(connection, $"UPDATE {Sessions} SET state='Owned',token=@token,generation=generation+1,revision=revision+1,claim_revision=revision+1,lease_until=@lease,admitted_request=@incoming WHERE id=@id", cancellationToken,
          ("id", key.Id), ("token", token), ("lease", now + _options.Lease), ("incoming", canonical));
      await transaction.CommitAsync(cancellationToken);
      return new(200, lease, snapshot, false);
    }
    catch (Exception exception) when (exception is NpgsqlException or TimeoutException) { return new(503); }
  }

  /// <summary>Bounds every canonical call and argument before recovery can acquire a session owner.</summary>
  private void ValidateRecoveryCallBounds(string canonical)
  {
    using var document = JsonDocument.Parse(canonical);
    var count = 0;
    foreach (var message in document.RootElement.GetProperty("messages").EnumerateArray())
    {
      if (message.ValueKind != JsonValueKind.Object) throw new ArgumentException("Recovery messages must be objects.");
      if (!message.TryGetProperty("toolCalls", out var calls) || calls.ValueKind == JsonValueKind.Null) continue;
      if (calls.ValueKind != JsonValueKind.Array) throw new ArgumentException("Recovery calls must be arrays.");
      foreach (var call in calls.EnumerateArray())
      {
        if (++count > _options.MaximumCalls || call.ValueKind != JsonValueKind.Object ||
            !call.TryGetProperty("function", out var function) || function.ValueKind != JsonValueKind.Object ||
            !function.TryGetProperty("arguments", out var arguments) || arguments.ValueKind != JsonValueKind.String ||
            Encoding.UTF8.GetByteCount(arguments.GetString()!) > _options.ArgumentBytes)
          throw new ArgumentException("Browser recovery call shape or argument limit exceeded.");
      }
    }
  }

  /// <summary>Requires a complete unchanged prefix and exact ordered fresh browser result suffix.</summary>
  private bool AdmitsBrowserRecoverySuffix(string canonical, NativeSessionSnapshot snapshot, IReadOnlyList<string>? outcomeIds = null)
  {
    var original = JsonNode.Parse(snapshot.PublicRequest)!.AsObject();
    var incoming = JsonNode.Parse(canonical)!.AsObject();
    var prefix = original["messages"]!.AsArray();
    var messages = incoming["messages"]!.AsArray();
    var expected = snapshot.ExpectedBrowserCallIds.ToHashSet(StringComparer.Ordinal);
    var ordered = prefix.SelectMany(message => message!["toolCalls"] is JsonArray entries ? entries : [])
        .Where(call => expected.Contains(call!["id"]!.GetValue<string>())).Select(call => call!["id"]!.GetValue<string>()).ToArray();
    if (ordered.Length == 0 || ordered.Length != expected.Count || outcomeIds is not null && !ordered.SequenceEqual(outcomeIds) || messages.Count != prefix.Count + ordered.Length) return false;
    for (var index = 0; index < prefix.Count; index++) if (!JsonNode.DeepEquals(prefix[index], messages[index])) return false;
    var occupiedIds = prefix.Select(message => message!["id"]!.GetValue<string>())
        .Concat(prefix.SelectMany(message => message!["toolCalls"] is JsonArray entries ? entries : []).Select(call => call!["id"]!.GetValue<string>()))
        .ToHashSet(StringComparer.Ordinal);
    for (var index = 0; index < ordered.Length; index++)
    {
      if (messages[prefix.Count + index] is not JsonObject result || result.Count != 4 || result["role"]?.GetValue<string>() != "tool" ||
          result["toolCallId"]?.GetValue<string>() != ordered[index] || result["content"] is not JsonValue content || !content.TryGetValue<string>(out _) ||
          result["id"] is not JsonValue id || !id.TryGetValue<string>(out var identity) || string.IsNullOrWhiteSpace(identity) || !occupiedIds.Add(identity)) return false;
    }
    incoming.Remove("messages"); original.Remove("messages");
    return JsonNode.DeepEquals(incoming, original);
  }

  /// <summary>Reads only a unique canonical string result; absence cannot manufacture a recovery value.</summary>
  private static string? BrowserResult(string canonical, string callId)
  {
    var result = JsonNode.Parse(canonical)!["messages"]!.AsArray().SingleOrDefault(message => message?["role"]?.GetValue<string>() == "tool" && message["toolCallId"]?.GetValue<string>() == callId);
    return result?["content"] is JsonValue content && content.TryGetValue<string>(out var text) ? text : null;
  }

  /// <summary>Separates accepted cold values from the published legacy warm fixed-result codec in the existing hash field.</summary>
  private static string BrowserRecoveryResultDigest(string callId, string content) => ApprovalResultDigest(JsonSerializer.SerializeToElement(
      new { formatVersion = 1, kind = "browser-recovery-result", callId, content }, JsonOptions));

  /// <summary>Accepts only exact saved cold content or the one fixed string the legacy warm setter can produce.</summary>
  private static bool MatchesSavedBrowserResult(string callId, string content, string digest) =>
      digest == BrowserRecoveryResultDigest(callId, content) || content == LegacyBrowserBypassResult && digest == ApprovalResultDigest(JsonSerializer.SerializeToElement(LegacyBrowserBypassResult));

  /// <summary>Binds results to exact saved history, or the actual current bound batch and its admitted cold or characterized warm prefix.</summary>
  private bool BrowserResultDigestMatches(Row row, NativeSessionSnapshot snapshot, string batchId, string callId, string digest, long? admittedGeneration, long? admittedRevision)
  {
    var saved = BrowserResult(snapshot.PublicRequest, callId);
    if (saved is not null) return MatchesSavedBrowserResult(callId, saved, digest);
    if (row.State != "Owned" || row.AdmittedRequest is null || admittedGeneration != row.Generation || admittedRevision != row.ClaimRevision + 1 ||
        snapshot.Approvals.PendingBatch is not { } current || current.Batch.BatchId != batchId || !current.Batch.BrowserBindings.Any(item => item.CallId == callId)) return false;
    if (AdmitsBrowserRecoverySuffix(row.AdmittedRequest, snapshot))
    {
      var result = BrowserResult(row.AdmittedRequest, callId);
      return result is not null && digest == BrowserRecoveryResultDigest(callId, result);
    }
    return digest == ApprovalResultDigest(JsonSerializer.SerializeToElement(LegacyBrowserBypassResult)) && NativeApprovalAdmission.MatchesBoundPrefix(row.AdmittedRequest, snapshot, current);
  }

  /// <summary>Rechecks retained settled browser bindings against canonical history, including after admitted_request is cleared.</summary>
  private async ValueTask ValidateSettledBrowserResults(NpgsqlConnection connection, Row row, NativeSessionKey key, NativeSessionSnapshot snapshot, CancellationToken cancellationToken)
  {
    var messages = JsonNode.Parse(snapshot.PublicRequest)!["messages"]!.AsArray();
    var calls = messages.SelectMany(message => message!["toolCalls"] is JsonArray entries ? entries : []).ToDictionary(call => call!["id"]!.GetValue<string>(), StringComparer.Ordinal);
    await using var command = Command(connection, $"SELECT a.call_id,a.private_descriptor,a.result_digest,b.state,b.admitted_generation,b.admitted_revision,b.published_revision,b.expires_at,a.expires_at,a.captured_generation,a.state,a.batch_id FROM {Approvals} a JOIN {ApprovalBatches} b USING(session_id,batch_id) WHERE a.session_id=@id AND a.kind='BrowserBypass' AND (a.state='Settled' OR a.batch_id<>@current)", ("id", key.Id), ("current", snapshot.Approvals.PendingBatch?.Batch.BatchId ?? ""));
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    while (await reader.ReadAsync(cancellationToken))
    {
      if (reader.GetString(10) != "Settled" || reader.IsDBNull(1) || reader.IsDBNull(2) || reader.IsDBNull(4) || reader.IsDBNull(5) || reader.GetString(3) is not ("DecisionAdmitted" or "Settled")) throw new ArgumentException("Unbound settled browser lifecycle.");
      if (reader.IsDBNull(6) || row.Revision < 3 || reader.GetInt64(6) < 1 || reader.GetInt64(6) > row.Revision - 2 ||
          reader.GetInt64(4) < 1 || reader.GetInt64(4) > row.Generation || reader.GetInt64(5) <= reader.GetInt64(6) + 2 || reader.GetInt64(5) > row.Revision ||
          reader.GetInt64(9) < 1 || reader.GetInt64(9) > reader.GetInt64(4) || reader.GetFieldValue<DateTimeOffset>(7) != reader.GetFieldValue<DateTimeOffset>(8) ||
          reader.GetFieldValue<DateTimeOffset>(7) > row.Expires) throw new ArgumentException("Invalid retained browser epoch or retention bounds.");
      var descriptorJson = reader.GetString(1);
      NativeSessionRawRequest.Validate(descriptorJson);
      using var descriptor = JsonDocument.Parse(descriptorJson);
      var root = descriptor.RootElement;
      if (!root.TryGetProperty("formatVersion", out var format) || format.ValueKind != JsonValueKind.Number || !format.TryGetInt32(out var version) || version != 1 ||
          !root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).SequenceEqual(new[] { "browserBinding", "formatVersion" })) throw new ArgumentException("Unsupported retained browser descriptor codec.");
      var binding = JsonSerializer.Deserialize<NativeBrowserRequestBinding>(root.GetProperty("browserBinding"), JsonOptions);
      var callId = reader.GetString(0);
      if (binding is null || NativeSessionHistory.Canonical(root) != NativeSessionHistory.Canonical(JsonSerializer.SerializeToElement(new { formatVersion = 1, browserBinding = binding }, JsonOptions)) || binding.CallId != callId || !calls.TryGetValue(callId, out var call) || call!["function"]!["name"]!.GetValue<string>() != binding.Name ||
          !JsonNode.DeepEquals(JsonNode.Parse(call["function"]!["arguments"]!.GetValue<string>()), JsonNode.Parse(binding.Arguments.GetRawText())) ||
          !BrowserResultDigestMatches(row, snapshot, reader.GetString(11), callId, reader.GetString(2), reader.GetInt64(4), reader.GetInt64(5))) throw new ArgumentException("Settled browser result differs from authoritative canonical evidence.");
    }
  }

}
