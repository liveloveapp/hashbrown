#pragma warning disable MAAI001, MEAI001 // Uses only pinned public native update/session APIs.
using System.Collections.ObjectModel;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;

namespace Hashbrown.AspNetCore;

/// <summary>Fixed hidden ordinary descriptors and the authenticated request claim; collections own their structure.</summary>
internal sealed class NativeHeldRecoveryManifest
{
  internal NativeHeldRecoveryManifest(IReadOnlyDictionary<string, NativeToolCall> calls, string sessionKeyId, string catalogIdentity, string ownerToken, long generation, long revision)
  {
    Calls = new ReadOnlyDictionary<string, NativeToolCall>(calls.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal));
    SessionKeyId = sessionKeyId; CatalogIdentity = catalogIdentity; OwnerToken = ownerToken; Generation = generation; Revision = revision;
  }
  internal IReadOnlyDictionary<string, NativeToolCall> Calls { get; }
  internal string SessionKeyId { get; }
  internal string CatalogIdentity { get; }
  internal string OwnerToken { get; }
  internal long Generation { get; }
  internal long Revision { get; }
}

/// <summary>One immutable position in a genuinely observed native call group.</summary>
internal sealed record NativeHeldRecoveryObservedCall(int ContentOrdinal, string CallId);

/// <summary>Owned native ordering corroboration; enriched headers do not define provider message expectations.</summary>
internal sealed class NativeHeldRecoveryObservedGroup
{
  internal NativeHeldRecoveryObservedGroup(long updateOrdinal, string? nativeMessageId, IReadOnlyList<NativeHeldRecoveryObservedCall> calls)
  { UpdateOrdinal = updateOrdinal; NativeMessageId = nativeMessageId; Calls = Array.AsReadOnly(calls.ToArray()); }
  internal long UpdateOrdinal { get; }
  internal string? NativeMessageId { get; }
  internal IReadOnlyList<NativeHeldRecoveryObservedCall> Calls { get; }
}

/// <summary>A hidden ordinary return bound to its fixed descriptor and claim, without protected approval identifiers.</summary>
internal sealed record NativeHeldRecoveryResultWitness(NativeHeldRecoveryManifest Manifest, NativeToolCall Call, NativeBrowserRecoveryResultSnapshot Snapshot)
{
  internal string CallId => Call.Id;
  internal string SessionKeyId => Manifest.SessionKeyId;
  internal string CatalogIdentity => Manifest.CatalogIdentity;
  internal string OwnerToken => Manifest.OwnerToken;
  internal long Generation => Manifest.Generation;
  internal long Revision => Manifest.Revision;
}

/// <summary>Immutable complete hidden-call ordering and independent result evidence for one fixed manifest.</summary>
internal sealed class NativeHeldRecoverySeal
{
  internal NativeHeldRecoverySeal(NativeHeldRecoveryManifest manifest, IReadOnlyList<NativeHeldRecoveryObservedGroup> groups, IReadOnlyDictionary<string, NativeHeldRecoveryResultWitness> results)
  {
    Manifest = manifest; Groups = Array.AsReadOnly(groups.ToArray());
    Results = new ReadOnlyDictionary<string, NativeHeldRecoveryResultWitness>(results.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal));
  }
  internal NativeHeldRecoveryManifest Manifest { get; }
  internal IReadOnlyList<NativeHeldRecoveryObservedGroup> Groups { get; }
  internal IReadOnlyDictionary<string, NativeHeldRecoveryResultWitness> Results { get; }
}

/// <summary>Owns a fixed request-local hidden ordinary set; native observations cannot expand membership.</summary>
internal sealed class NativeHeldRecoveryRegistry
{
  private readonly NativeSessionContext _owner;
  private readonly NativeSessionAdmission _admission;
  private readonly string _publicRequest;
  private readonly NativeHeldRecoveryManifest _manifest;
  private NativeHeldRecoverySeal? _seal;
  private readonly Dictionary<string, NativeHeldRecoveryResultWitness> _staged = new(StringComparer.Ordinal);
  private readonly Dictionary<string, NativeHeldRecoveryResultWitness> _completed = new(StringComparer.Ordinal);
  private readonly HashSet<string> _observedResults = new(StringComparer.Ordinal);
  private readonly HashSet<string> _observedCalls = new(StringComparer.Ordinal);
  private readonly List<NativeHeldRecoveryObservedGroup> _groups = [];
  private long _updateOrdinal;

  private NativeHeldRecoveryRegistry(NativeSessionContext owner, NativeSessionAdmission admission, NativeHeldRecoveryManifest manifest)
  {
    _owner = owner; _admission = admission; _manifest = manifest; _publicRequest = owner.PublicRequest;
    if (manifest.Calls.Count == 0) _seal = new(manifest, [], new Dictionary<string, NativeHeldRecoveryResultWitness>(StringComparer.Ordinal));
  }

  /// <summary>Classifies only journal-captured descriptors hidden from both saved and admitted public identity graphs.</summary>
  internal static NativeHeldRecoveryRegistry Create(NativeSessionContext context)
  {
    context.RequireHeldRecoveryAccess();
    if (context.Admission is not { Status: 200, Lease: not null, Snapshot: { } saved } admission || context.Recovery is null) throw Refuse();
    var currentProtected = context.ApprovalEvidence?.Batch.Batch.ProtectedRequests.Select(item => item.Call.Id).ToHashSet(StringComparer.Ordinal) ?? [];
    var browsers = context.Recovery.Outcomes.Select(item => item.ToolCallId).ToHashSet(StringComparer.Ordinal);
    var publicIds = new HashSet<string>(StringComparer.Ordinal);
    var publicCalls = new HashSet<string>(StringComparer.Ordinal);
    Collect(saved.PublicRequest); Collect(context.PublicRequest);
    var held = new Dictionary<string, NativeToolCall>(StringComparer.Ordinal);
    var pendingIds = new HashSet<string>(StringComparer.Ordinal);
    long bytes = 0;
    foreach (var call in saved.PendingCalls)
    {
      if (!pendingIds.Add(call.Id)) throw Refuse();
      if (currentProtected.Contains(call.Id)) continue;
      if (browsers.Contains(call.Id)) throw Refuse();
      // Explicitly public ordinary work keeps its existing independent path; it never becomes H.
      if (publicCalls.Contains(call.Id)) continue;
      if (publicIds.Contains(call.Id) || !context.Registration.Catalog.HasVersion(call) || context.Registration.Catalog.RequiresConfirmation(call.Name)) throw Refuse();
      var raw = call.Arguments.GetRawText();
      var argumentBytes = Encoding.UTF8.GetByteCount(raw);
      if (call.Arguments.ValueKind != JsonValueKind.Object || argumentBytes > context.Registration.Options.ArgumentBytes) throw Refuse();
      try { using var checkedArguments = JsonDocument.Parse(raw, new JsonDocumentOptions { MaxDepth = 64 }); }
      catch (JsonException) { throw Refuse(); }
      bytes += argumentBytes + Encoding.UTF8.GetByteCount(call.Id) + Encoding.UTF8.GetByteCount(call.Name) + sizeof(int);
      held.Add(call.Id, call);
    }
    if (held.Count > 0)
    {
      if ((long)held.Count + currentProtected.Count + browsers.Count > context.Registration.Options.MaximumCalls) throw Refuse();
      bytes += Encoding.UTF8.GetByteCount(context.Lease.Key.Id) + Encoding.UTF8.GetByteCount(context.Registration.Catalog.Identity) + Encoding.UTF8.GetByteCount(context.Lease.Token) + sizeof(long) * 2;
      context.ChargeHeldRecoveryEvidence(bytes);
    }
    var manifest = new NativeHeldRecoveryManifest(held, context.Lease.Key.Id, context.Registration.Catalog.Identity, context.Lease.Token, context.Lease.Generation, context.Lease.Revision);
    return new(context, admission, manifest);

    void Collect(string request)
    {
      if (Encoding.UTF8.GetByteCount(request) > context.Registration.Options.PublicBytes) throw Refuse();
      if (JsonNode.Parse(request)?["messages"] is not JsonArray messages) throw Refuse();
      foreach (var item in messages)
      {
        if (item is not JsonObject message) throw Refuse();
        publicIds.Add(Required(message, "id"));
        if (message["toolCalls"] is JsonArray calls)
          foreach (var node in calls)
          {
            if (node is not JsonObject call) throw Refuse();
            var id = Required(call, "id"); publicIds.Add(id); publicCalls.Add(id);
          }
        if (message["role"]?.GetValue<string>() == "tool") publicIds.Add(Required(message, "toolCallId"));
      }
    }
  }

  /// <summary>Returns the same fixed immutable manifest only while the original owning claim is active.</summary>
  internal NativeHeldRecoveryManifest ReadManifest() { RequireOwner(); return _manifest; }

  /// <summary>Snapshots only a fixed held actual invocation return before durable completion.</summary>
  internal NativeHeldRecoveryResultWitness? Snapshot(NativeToolCall call, object? value)
  {
    RequireOwner();
    if (!_manifest.Calls.TryGetValue(call.Id, out var fixedCall)) return null;
    RequireCall(call, fixedCall);
    var snapshot = NativeBrowserRecoveryResultSnapshot.Create(value, _owner.Registration.Options.PublicBytes);
    lock (_owner.RecoveryEvidenceSync)
    {
      if (_staged.ContainsKey(call.Id) || _completed.ContainsKey(call.Id)) throw Refuse();
      _owner.ReserveHeldRecoveryResult(snapshot.Bytes);
      var witness = new NativeHeldRecoveryResultWitness(_manifest, fixedCall, snapshot);
      _staged.Add(call.Id, witness);
      return witness;
    }
  }

  /// <summary>Publishes the same staged value only after independent same-claim durable completion.</summary>
  internal void Publish(NativeToolCall call, NativeHeldRecoveryResultWitness? witness)
  {
    if (witness is null) return;
    RequireOwner();
    lock (_owner.RecoveryEvidenceSync)
    {
      if (!ReferenceEquals(witness.Manifest, _manifest) || !_manifest.Calls.TryGetValue(call.Id, out var descriptor) || !ReferenceEquals(witness.Call, descriptor) || !_staged.TryGetValue(call.Id, out var staged) || !ReferenceEquals(staged, witness) || !_owner.MatchesCompletedCapturedCall(call.Id, call.Name, JsonNode.Parse(call.Arguments.GetRawText()))) throw Refuse();
      _staged.Remove(call.Id); _completed.Add(call.Id, witness);
    }
  }

  /// <summary>Authenticates a held outward result once against its independent completed actual return.</summary>
  internal bool ObserveResult(FunctionResultContent result)
  {
    RequireOwner();
    if (!_manifest.Calls.ContainsKey(result.CallId)) return false;
    NativeBrowserRecoveryResultSnapshot.RequirePlain(result);
    lock (_owner.RecoveryEvidenceSync)
    {
      if (!_completed.TryGetValue(result.CallId, out var witness) || !witness.Snapshot.Matches(result.Result) || !_observedResults.Add(result.CallId)) throw Refuse();
      return true;
    }
  }

  /// <summary>Records complete genuine P/H call groups before public filtering, without deriving membership from outputs.</summary>
  internal void ObserveCalls(AgentResponseUpdate update)
  {
    RequireOwner();
    if (_manifest.Calls.Count == 0) return;
    lock (_owner.RecoveryEvidenceSync)
    {
      var ordinal = _updateOrdinal++;
      var protectedCalls = _owner.ApprovalEvidence?.Batch.Batch.ProtectedRequests.ToDictionary(item => item.Call.Id, item => item.Call, StringComparer.Ordinal) ?? [];
      var targets = update.Contents.OfType<FunctionCallContent>().Where(call => _manifest.Calls.ContainsKey(call.CallId) || protectedCalls.ContainsKey(call.CallId)).ToArray();
      if (targets.Length == 0) return;
      if (update.RawRepresentation is ChatResponseUpdate { ConversationId: not null }) throw Refuse();
      if (_seal is not null || update.Role != ChatRole.Assistant || update.Contents.Count != targets.Length || update.AdditionalProperties?.Count > 0 || update.ContinuationToken is not null || update.FinishReason is not null && update.FinishReason != ChatFinishReason.ToolCalls || update.MessageId?.Length > 1024 || update.ResponseId?.Length > 1024 || update.AuthorName?.Length > 1024 || update.AgentId?.Length > 1024) throw Refuse();
      var positions = new List<NativeHeldRecoveryObservedCall>();
      for (var index = 0; index < update.Contents.Count; index++)
      {
        if (update.Contents[index] is not FunctionCallContent call || !call.InformationalOnly || call.RawRepresentation is not null || call.Exception is not null || call.AdditionalProperties?.Count > 0 || call.Annotations?.Count > 0 || !_observedCalls.Add(call.CallId)) throw Refuse();
        var descriptor = _manifest.Calls.TryGetValue(call.CallId, out var held) ? held : protectedCalls.GetValueOrDefault(call.CallId) ?? throw Refuse();
        if (call.Name != descriptor.Name || !ArgumentsAgree(call.Arguments, descriptor.Arguments)) throw Refuse();
        positions.Add(new(index, call.CallId));
      }
      var bytes = sizeof(long) + Encoding.UTF8.GetByteCount(update.MessageId ?? "") + positions.Sum(item => (long)sizeof(int) + Encoding.UTF8.GetByteCount(item.CallId));
      _owner.ChargeHeldRecoveryEvidence(bytes);
      _groups.Add(new(ordinal, update.MessageId, positions));
      _owner.Observe("Recovery.Held.CallsObserved", positions.Count.ToString(System.Globalization.CultureInfo.InvariantCulture));
    }
  }

  private static void RequireCall(NativeToolCall call, NativeToolCall descriptor)
  {
    if (call.Id != descriptor.Id || call.Name != descriptor.Name || call.Version != descriptor.Version || !JsonElement.DeepEquals(call.Arguments, descriptor.Arguments)) throw Refuse();
  }

  private static bool ArgumentsAgree(IDictionary<string, object?>? actual, JsonElement expected)
  {
    // Reject application containers/comparers before invoking interface properties or lookup callbacks.
    if (actual is null || actual.GetType() != typeof(Dictionary<string, object?>)) throw Refuse();
    var dictionary = (Dictionary<string, object?>)actual;
    if (!ReferenceEquals(dictionary.Comparer, EqualityComparer<string>.Default) && !ReferenceEquals(dictionary.Comparer, StringComparer.Ordinal)) throw Refuse();
    if (expected.ValueKind != JsonValueKind.Object || dictionary.Count != expected.EnumerateObject().Count()) return false;
    foreach (var property in expected.EnumerateObject())
    {
      if (!dictionary.TryGetValue(property.Name, out var value)) return false;
      JsonNode? node = value switch
      {
        null => null,
        JsonElement json when json.ValueKind != JsonValueKind.Undefined => JsonNode.Parse(json.GetRawText()),
        string text => JsonValue.Create(text),
        bool boolean => JsonValue.Create(boolean),
        byte number => JsonValue.Create(number),
        sbyte number => JsonValue.Create(number),
        short number => JsonValue.Create(number),
        ushort number => JsonValue.Create(number),
        int number => JsonValue.Create(number),
        uint number => JsonValue.Create(number),
        long number => JsonValue.Create(number),
        ulong number => JsonValue.Create(number),
        decimal number => JsonValue.Create(number),
        float number when float.IsFinite(number) => JsonValue.Create(number),
        double number when double.IsFinite(number) => JsonValue.Create(number),
        _ => throw Refuse()
      };
      if (!JsonNode.DeepEquals(node, JsonNode.Parse(property.Value.GetRawText()))) return false;
    }
    return true;
  }

  /// <summary>Requires a complete sealed observation; provider input can never supply missing registry evidence.</summary>
  internal NativeHeldRecoverySeal ReadSeal(NativeHeldRecoveryManifest manifest)
  {
    RequireOwner();
    lock (_owner.RecoveryEvidenceSync)
    {
      if (!ReferenceEquals(manifest, _manifest)) throw Refuse();
      if (_seal is null)
      {
        var expectedCalls = _manifest.Calls.Keys.Concat(_owner.ApprovalEvidence?.Batch.Batch.ProtectedRequests.Select(item => item.Call.Id) ?? []).ToHashSet(StringComparer.Ordinal);
        if (_staged.Count != 0 || _completed.Count != _manifest.Calls.Count || !_observedResults.SetEquals(_manifest.Calls.Keys) || !_observedCalls.SetEquals(expectedCalls)) throw Refuse();
        _owner.ReadObservedRecoveryResults();
        _seal = new(_manifest, _groups, _completed);
        _owner.Observe("Recovery.Held.Sealed", _manifest.Calls.Count.ToString(System.Globalization.CultureInfo.InvariantCulture));
      }
      if (!ReferenceEquals(_seal.Manifest, _manifest)) throw Refuse();
      return _seal;
    }
  }

  private void RequireOwner()
  {
    _owner.RequireHeldRecoveryAccess();
    if (!ReferenceEquals(_owner.Admission, _admission) || _owner.PublicRequest != _publicRequest || _owner.Lease.Key.Id != _manifest.SessionKeyId || _owner.Registration.Catalog.Identity != _manifest.CatalogIdentity || _owner.Lease.Token != _manifest.OwnerToken || _owner.Lease.Generation != _manifest.Generation || _owner.Lease.Revision != _manifest.Revision) throw Refuse();
  }
  private static string Required(JsonObject value, string name) => value[name] is JsonValue text && text.TryGetValue<string>(out var result) && !string.IsNullOrWhiteSpace(result) ? result : throw Refuse();
  private static NativeSessionRequestException Refuse() => new(409);
}
