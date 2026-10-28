using System.Text.Json;
using System.Text;
using System.Text.Json.Nodes;
using Hashbrown.Conformance.Integration;
using Microsoft.Extensions.AI;
using Npgsql;

namespace Hashbrown.Conformance.Testing;

/// <summary>Passive live-only proof joining successful real journal operations, original model observations and append-only effects.</summary>
public sealed class FixtureLiveApprovalProof(string catalogIdentity)
{
    private readonly object _sync = new();
    private NativeToolCall? _model;
    private NativeToolCall? _captured;
    private NativeApprovalBatch? _batch;
    private NativeSessionLease? _captureLease;
    private NativeApprovalEvidence? _admitted;
    private NativeSessionLease? _admissionLease;
    private NativeSavedReceipt? _saved;
    private NativeSavedReceipt? _authorized;
    private NativeSavedReceipt? _finalized;
    private long _pendingRevision;
    private string? _publicParent;
    private int _captures, _admissions, _dispatches, _completions, _publications, _phase, _results;
    private bool _invalid, _bound, _pendingObserved, _journalMatched;
    private int _effects, _wirePhase;
    private JsonElement[] _wireResultPrefix = [];
    private readonly StringBuilder _modelAnswer = new();

    private void Require(bool valid) { if (!valid) _invalid = true; }
    private static bool Same(NativeToolCall? left, NativeToolCall? right) => left is not null && right is not null && left.Id == right.Id && left.Name == right.Name && left.Version == right.Version && JsonNode.DeepEquals(JsonNode.Parse(left.Arguments.GetRawText()), JsonNode.Parse(right.Arguments.GetRawText()));
    private bool Owns(NativeSessionLease lease) => _captureLease is not null && lease.Key.Id == _captureLease.Key.Id;

    /// <summary>Retains genuine post-result answer text only in memory for the next actual wire transcript comparison.</summary>
    public void ModelText(string? text) { lock (_sync) _modelAnswer.Append(text); }

    /// <summary>Checks actual native Responses request bytes before HTTPS dispatch, without retaining raw bodies in diagnostics.</summary>
    public bool ObserveWire(JsonElement root)
    {
        lock (_sync)
        {
            try
            {
                if (_invalid || _wirePhase != _phase || _wirePhase >= 3 || root.TryGetProperty("previous_response_id", out _) || root.TryGetProperty("conversation", out _)) return false;
                var input = root.GetProperty("input").EnumerateArray().ToArray();
                static string? Kind(JsonElement item) => item.TryGetProperty("type", out var type) ? type.GetString() : null;
                if (input.Any(item => Kind(item) is not (null or "message" or "function_call" or "function_call_output"))) return false;
                var calls = input.Where(item => Kind(item) == "function_call").ToArray();
                var results = input.Where(item => Kind(item) == "function_call_output").ToArray();
                if (_wirePhase == 0)
                {
                    if (calls.Length != 0 || results.Length != 0) return false;
                    var tools = root.GetProperty("tools").EnumerateArray().ToArray();
                    var choice = root.GetProperty("tool_choice");
                    if (tools.Length != 1 || tools[0].GetProperty("type").GetString() != "function" || tools[0].GetProperty("name").GetString() != "lookupAirport" || choice.GetProperty("type").GetString() != "function" || choice.GetProperty("name").GetString() != "lookupAirport" || root.GetProperty("parallel_tool_calls").GetBoolean()) return false;
                }
                else
                {
                    if (root.GetProperty("tool_choice").GetString() != "none" || _model is null || _completions != 1 || calls.Length != 1 || results.Length != 1 || calls[0].GetProperty("call_id").GetString() != _model.Id || calls[0].GetProperty("name").GetString() != _model.Name || results[0].GetProperty("call_id").GetString() != _model.Id || !JsonNode.DeepEquals(JsonNode.Parse(calls[0].GetProperty("arguments").GetString()!), JsonNode.Parse(_model.Arguments.GetRawText()))) return false;
                    var result = JsonNode.Parse(results[0].GetProperty("output").GetString()!);
                    if (!JsonNode.DeepEquals(result, JsonNode.Parse("{\"code\":\"PDX\",\"name\":\"Portland International Airport\"}"))) return false;
                    if (_wirePhase == 1) _wireResultPrefix = input.Select(item => item.Clone()).ToArray();
                    else
                    {
                        if (input.Length != _wireResultPrefix.Length + 2 || input.Take(_wireResultPrefix.Length).Where((item, index) => !JsonNode.DeepEquals(JsonNode.Parse(item.GetRawText()), JsonNode.Parse(_wireResultPrefix[index].GetRawText()))).Any() || input[^2].GetProperty("role").GetString() != "assistant" || input[^1].GetProperty("role").GetString() != "user") return false;
                        var content = input[^2].GetProperty("content");
                        var text = content.ValueKind == JsonValueKind.String ? content.GetString() : string.Concat(content.EnumerateArray().Select(part => part.GetProperty("text").GetString()));
                        if (text != _modelAnswer.ToString() || string.IsNullOrWhiteSpace(text)) return false;
                    }
                }
                _wirePhase++; return true;
            }
            catch (Exception exception) when (exception is JsonException or InvalidOperationException or KeyNotFoundException) { return false; }
        }
    }

    /// <summary>Records only the immutable actual complete initial model call, never a synthetic approval object.</summary>
    public void ModelCall(FunctionCallContent call)
    {
        lock (_sync)
        {
            Require(_model is null && call.Name == "lookupAirport" && !string.IsNullOrEmpty(call.CallId));
            if (_model is null) _model = new(call.CallId, call.Name, 1, JsonSerializer.SerializeToElement(call.Arguments));
        }
    }
    /// <summary>Records a successful real journal capture after its awaited result.</summary>
    public void CapturedModel(NativeSessionLease lease, NativeToolCall call)
    {
        lock (_sync) { Require(_captured is null && call.Name == "lookupAirport" && call.Version == 1); _captured = call; _captureLease = lease; }
    }
    /// <summary>Records a successful validated original-derived native request batch.</summary>
    public void CapturedApproval(NativeSessionLease lease, NativeApprovalBatch batch)
    {
        lock (_sync)
        {
            _captures++;
            Require(_captures == 1 && Owns(lease) && batch.ProtectedRequests.Count == 1 && batch.BrowserBindings.Count == 0 && Same(_captured, batch.ProtectedRequests[0].Call));
            _batch = batch;
        }
    }
    /// <summary>Records successful whole-batch Approved admission without granting execution authority.</summary>
    public void Admitted(NativeSessionLease lease, string batchId, NativeApprovalAdmissionEnvelope admission)
    {
        lock (_sync)
        {
            _admissions++;
            Require(_pendingObserved && Owns(lease) && _batch?.BatchId == batchId && admission.Decisions.Count == 1 && admission.Decisions[0].RequestId == _batch.ProtectedRequests[0].RequestId && admission.Decisions[0].Kind == NativeApprovalDecisionKind.Approved);
            _admissionLease = lease;
        }
    }
    /// <summary>Joins the real post-admission evidence, retaining original admitted epoch independently of later session revisions.</summary>
    public void Evidence(NativeSessionLease lease, NativeApprovalEvidence evidence)
    {
        lock (_sync)
        {
            if (evidence.State != NativeApprovalState.DecisionAdmitted) return;
            Require(_admissions == 1 && _admissionLease == lease && evidence.CurrentOwner == lease && evidence.SessionKeyId == lease.Key.Id && evidence.CatalogIdentity == catalogIdentity && evidence.Batch.Batch.BatchId == _batch?.BatchId && evidence.Decisions.Count == 1 && evidence.Decisions[0].Kind == NativeApprovalDecisionKind.Approved && evidence.Decisions[0].RequestId == _batch?.ProtectedRequests[0].RequestId && evidence.AdmittedGeneration == lease.Generation && evidence.AdmittedRevision == lease.Revision + 1 && evidence.PublishedRevision == _pendingRevision);
            _admitted = evidence;
        }
    }
    /// <summary>Records true dispatch marker and completion results only for the original admitted call and owner.</summary>
    public void Dispatch(NativeSessionLease lease, NativeToolCall call, bool completed)
    {
        lock (_sync)
        {
            Require(_admitted is not null && _admissionLease == lease && Same(_captured, call));
            if (completed) { _completions++; Require(_dispatches == 1 && _completions == 1); }
            else { _dispatches++; Require(_dispatches == 1 && _completions == 0); }
        }
    }
    /// <summary>Checks actual provider invocation order; later phases are admitted only with the original completed result.</summary>
    public void ModelPhase(int phase)
    {
        lock (_sync) { Require(phase == _phase + 1 && phase <= 3 && (phase == 1 || _completions == 1)); _phase = phase; if (phase == 2) _results = 1; }
    }
    /// <summary>Checks the saved genuine public call position against the original request before recording its real save receipt.</summary>
    public void Saved(NativeSessionLease lease, NativeSessionSave save, NativeSavedReceipt receipt)
    {
        lock (_sync)
        {
            Require(Owns(lease) && receipt.Lease == lease && _publications < 3 && _saved is null);
            if (save.Approvals.PendingBatch is { } bound)
            {
                Require(_publications == 0 && bound.Batch.BatchId == _batch?.BatchId && Same(_model, _captured));
                using var document = JsonDocument.Parse(save.PublicRequest);
                var descriptor = _batch!.ProtectedRequests.Single();
                var location = bound.PublicLocations[descriptor.RequestId];
                var message = document.RootElement.GetProperty("messages")[location.MessageIndex];
                var call = message.GetProperty("toolCalls")[location.CallIndex];
                _bound = message.GetProperty("id").GetString() == location.AssistantMessageId && call.GetProperty("id").GetString() == descriptor.Call.Id && call.GetProperty("function").GetProperty("name").GetString() == descriptor.Call.Name && JsonNode.DeepEquals(JsonNode.Parse(call.GetProperty("function").GetProperty("arguments").GetString()!), JsonNode.Parse(descriptor.Call.Arguments.GetRawText()));
                _publicParent = location.AssistantMessageId;
                Require(_bound && location.AssistantMessageId == (descriptor.NativeLocation.MessageId ?? $"assistant-{descriptor.Call.Id}") && !save.TurnCompleted);
                _pendingRevision = receipt.SavedRevision;
            }
            else
            {
                Require(_publications > 0 && save.TurnCompleted && _completions == 1);
                using var document = JsonDocument.Parse(save.PublicRequest);
                var messages = document.RootElement.GetProperty("messages").EnumerateArray().ToArray();
                var calls = messages.SelectMany(message => message.TryGetProperty("toolCalls", out var values) ? values.EnumerateArray().Select(call => (Message: message, Call: call)).ToArray() : []).ToArray();
                var results = messages.Where(message => message.GetProperty("role").GetString() == "tool").ToArray();
                Require(calls.Length == 1 && results.Length == 1 && _captured is not null &&
                    calls[0].Message.GetProperty("role").GetString() == "assistant" && calls[0].Message.GetProperty("id").GetString() == _publicParent &&
                    calls[0].Call.GetProperty("id").GetString() == _captured.Id && calls[0].Call.GetProperty("function").GetProperty("name").GetString() == _captured.Name &&
                    JsonNode.DeepEquals(JsonNode.Parse(calls[0].Call.GetProperty("function").GetProperty("arguments").GetString()!), JsonNode.Parse(_captured.Arguments.GetRawText())) &&
                    results[0].GetProperty("toolCallId").GetString() == _captured.Id && ExpectedPublicResult(results[0].GetProperty("content")));
            }
            _saved = receipt;
        }
    }
    private static bool ExpectedPublicResult(JsonElement content)
    {
        if (content.ValueKind != JsonValueKind.String) return false;
        try { return JsonNode.DeepEquals(JsonNode.Parse(content.GetString()!), JsonNode.Parse("{\"code\":\"PDX\",\"name\":\"Portland International Airport\"}")); }
        catch (JsonException) { return false; }
    }
    /// <summary>Records only actual successful authorization/finalization of the exact save receipt, in order.</summary>
    public void Published(NativeSavedReceipt receipt, bool finalized)
    {
        lock (_sync)
        {
            Require(_saved == receipt);
            if (!finalized) { Require(_authorized is null); _authorized = receipt; }
            else
            {
                Require(_authorized == receipt && _publications == _phase - 1);
                _publications++; _finalized = receipt; _saved = null; _authorized = null;
            }
        }
    }
    /// <summary>Joins real isolated PostgreSQL rows to the captured descriptor and actual admitted epoch; no row or raw ID is persisted.</summary>
    public async Task ObserveDatabaseAsync(NpgsqlDataSource source, string schema, CancellationToken cancellationToken = default)
    {
        NativeApprovalBatch? batch; NativeSessionLease? lease; NativeApprovalEvidence? admitted; NativeSavedReceipt? finalized; int publications;
        lock (_sync) { batch = _batch; lease = _captureLease; admitted = _admitted; finalized = _finalized; publications = _publications; }
        if (batch is null || lease is null || finalized is null) return;
        var descriptor = batch.ProtectedRequests.Single();
        await using var command = source.CreateCommand($"""
          SELECT jsonb_build_object(
            'sessions',(SELECT count(*) FROM "{schema}".native_sessions),
            'calls',(SELECT count(*) FROM "{schema}".native_invocations),
            'batches',(SELECT count(*) FROM "{schema}".native_approval_batches),
            'members',(SELECT count(*) FROM "{schema}".native_approvals),
            'effects',(SELECT count(*) FROM "{schema}".fixture_native_approval_effects),
            'ordinary',(SELECT count(*) FROM "{schema}".fixture_native_effects),
            'application',(SELECT count(*) FROM "{schema}".fixture_effects),
            'pending',EXISTS(SELECT 1 FROM "{schema}".native_sessions s
              JOIN "{schema}".native_invocations i ON i.session_id=s.id
              JOIN "{schema}".native_approvals a ON a.session_id=s.id AND a.call_id=i.call_id
              JOIN "{schema}".native_approval_batches b ON b.session_id=s.id AND b.batch_id=a.batch_id
              WHERE s.id=@id AND s.state='Ready' AND s.generation=@current_generation AND s.revision=@current_revision AND i.call_id=@call AND i.name='lookupAirport' AND i.version=@version AND i.descriptor::jsonb=CAST(@descriptor AS jsonb) AND i.state='Captured'
                AND i.captured_generation=@capture AND i.dispatch_generation IS NULL AND a.request_id=@request AND a.kind='Protected'
                AND a.state='Pending' AND a.decision IS NULL AND a.captured_generation=@capture AND a.private_descriptor IS NOT NULL
                AND b.batch_id=@batch AND b.member_count=1 AND b.state='Pending' AND b.published_revision=@published),
            'settled',EXISTS(SELECT 1 FROM "{schema}".native_sessions s
              JOIN "{schema}".native_invocations i ON i.session_id=s.id
              JOIN "{schema}".native_approvals a ON a.session_id=s.id AND a.call_id=i.call_id
              JOIN "{schema}".native_approval_batches b ON b.session_id=s.id AND b.batch_id=a.batch_id
              JOIN "{schema}".fixture_native_approval_effects e ON e.session_id=s.id AND e.call_id=i.call_id AND e.request_id=a.request_id AND e.batch_id=b.batch_id
              WHERE s.id=@id AND s.state='Ready' AND s.generation=@current_generation AND s.revision=@current_revision AND i.call_id=@call AND i.name='lookupAirport' AND i.version=@version AND i.descriptor::jsonb=CAST(@descriptor AS jsonb) AND i.state='Completed'
                AND i.captured_generation=@capture AND i.dispatch_generation=@generation AND a.request_id=@request AND a.kind='Protected'
                AND a.state='Settled' AND a.decision='Approved' AND a.admitted_generation=@generation AND a.admitted_revision=@revision
                AND b.batch_id=@batch AND b.member_count=1 AND b.state='Settled' AND b.published_revision=@published AND b.admitted_generation=@generation AND b.admitted_revision=@revision
                AND e.admitted_generation=@generation AND e.admitted_revision=@revision AND e.code='PDX'))::text
          """);
        command.Parameters.AddWithValue("current_generation", finalized.Lease.Generation); command.Parameters.AddWithValue("current_revision", finalized.SavedRevision + 2);
        command.Parameters.AddWithValue("id", lease.Key.Id); command.Parameters.AddWithValue("call", descriptor.Call.Id);
        command.Parameters.AddWithValue("descriptor", JsonSerializer.Serialize(descriptor.Call, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        command.Parameters.AddWithValue("version", descriptor.Call.Version); command.Parameters.AddWithValue("capture", lease.Generation);
        command.Parameters.AddWithValue("request", descriptor.RequestId); command.Parameters.AddWithValue("batch", batch.BatchId);
        command.Parameters.AddWithValue("published", _pendingRevision); command.Parameters.AddWithValue("generation", admitted?.AdmittedGeneration ?? 0L);
        command.Parameters.AddWithValue("revision", admitted?.AdmittedRevision ?? 0L);
        using var document = JsonDocument.Parse((string)(await command.ExecuteScalarAsync(cancellationToken))!);
        var row = document.RootElement;
        lock (_sync)
        {
            // A poll concurrent with the next turn may observe an Owned row; it cannot advance or invalidate a terminal proof.
            if (_publications != publications || _finalized != finalized || _saved is not null) return;
            var cardinalities = new[] { "sessions", "calls", "batches", "members" }.All(key => row.GetProperty(key).GetInt32() == 1) && row.GetProperty("ordinary").GetInt32() == 0 && row.GetProperty("application").GetInt32() == 0;
            _effects = row.GetProperty("effects").GetInt32();
            if (publications == 1 && _admissions == 0 && cardinalities && _effects == 0 && row.GetProperty("pending").GetBoolean()) _pendingObserved = true;
            if (publications >= 2) _journalMatched = cardinalities && _effects == 1 && row.GetProperty("settled").GetBoolean();
        }
    }
    /// <summary>Projects only bounded reviewed primitives, with no opaque native, public, credential or database contents.</summary>
    public IReadOnlyDictionary<string, object> Snapshot()
    {
        lock (_sync) return new Dictionary<string, object>
        {
            ["nativeApprovalWirePhase"] = _wirePhase,
            ["nativeApprovalStage"] = _invalid ? "invalid" : _publications == 3 && _journalMatched ? "followup" : _publications == 2 && _journalMatched ? "approved" : _publications == 1 && _pendingObserved ? "pending" : "starting",
            ["nativeApprovalCaptures"] = _captures,
            ["nativeApprovalAdmissions"] = _admissions,
            ["nativeApprovalDispatches"] = _dispatches,
            ["nativeApprovalCompletions"] = _completions,
            ["nativeApprovalPublications"] = _publications,
            ["nativeApprovalModelPhase"] = _phase,
            ["nativeApprovalOriginalResults"] = _results,
            ["nativeApprovalAdmittedGeneration"] = _admitted?.AdmittedGeneration ?? 0L,
            ["nativeApprovalAdmittedRevision"] = _admitted?.AdmittedRevision ?? 0L,
            ["nativeApprovalPendingEffects"] = 0,
            ["nativeApprovalFinalEffects"] = _effects,
            ["nativeApprovalPendingObserved"] = _pendingObserved,
            ["nativeApprovalBindingMatched"] = _bound && Same(_model, _captured),
            ["nativeApprovalJournalMatched"] = _journalMatched
        };
    }
}
