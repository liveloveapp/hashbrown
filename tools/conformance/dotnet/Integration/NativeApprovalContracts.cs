using System.Collections.Frozen;
using System.Text.Json;

namespace Hashbrown.Conformance.Integration;

/// <summary>Exact caller decision for an owned protected request.</summary>
public enum NativeApprovalDecisionKind { Approved, Declined, Cancelled }
/// <summary>Durable lifecycle of one immutable protected batch.</summary>
public enum NativeApprovalState { Pending, DecisionAdmitted, Settled, Retired }

/// <summary>Immutable decision; identity alone never grants dispatch.</summary>
public sealed record NativeApprovalDecision
{
    /// <summary>Validates a bounded identity and known decision.</summary>
    public NativeApprovalDecision(string requestId, NativeApprovalDecisionKind kind)
    { RequestId = NativeSessionKey.Required(requestId); Kind = Enum.IsDefined(kind) ? kind : throw new ArgumentException("Unknown native decision."); }
    /// <summary>Original genuine native request identity.</summary>
    public string RequestId { get; }
    /// <summary>Explicit approved, declined or cancelled decision.</summary>
    public NativeApprovalDecisionKind Kind { get; }
}
/// <summary>Original native message/content position observed before public rewriting.</summary>
public sealed record NativeRequestLocation
{
    /// <summary>Validates the native parent and nonnegative positions.</summary>
    public NativeRequestLocation(string? messageId, int? messageIndex, int contentIndex)
    { MessageId = messageId is null ? null : NativeSessionKey.Required(messageId); MessageIndex = messageIndex is null ? null : NativeApprovalValues.Index(messageIndex.Value); ContentIndex = NativeApprovalValues.Index(contentIndex); }
    /// <summary>Original native parent identity.</summary>
    public string? MessageId { get; }
    /// <summary>Original native message index.</summary>
    public int? MessageIndex { get; }
    /// <summary>Original native content index.</summary>
    public int ContentIndex { get; }
}
/// <summary>Public call position bound by genuine projection at save time.</summary>
public sealed record NativePublicCallLocation
{
    /// <summary>Validates the public parent and nonnegative positions.</summary>
    public NativePublicCallLocation(string assistantMessageId, int messageIndex, int callIndex)
    { AssistantMessageId = NativeSessionKey.Required(assistantMessageId); MessageIndex = NativeApprovalValues.Index(messageIndex); CallIndex = NativeApprovalValues.Index(callIndex); }
    /// <summary>Original public assistant parent, including the characterized fallback.</summary>
    public string AssistantMessageId { get; }
    /// <summary>Public message index.</summary>
    public int MessageIndex { get; }
    /// <summary>Public call index within the assistant message.</summary>
    public int CallIndex { get; }
}
/// <summary>Protected genuine request paired with its captured registered server call.</summary>
public sealed class NativeApprovalDescriptor
{
    /// <summary>Clones the actual model call before asynchronous capture.</summary>
    public NativeApprovalDescriptor(string requestId, NativeToolCall call, NativeRequestLocation nativeLocation)
    { RequestId = NativeSessionKey.Required(requestId); ArgumentNullException.ThrowIfNull(call); Call = new(call.Id, call.Name, call.Version, call.Arguments); NativeLocation = nativeLocation ?? throw new ArgumentNullException(nameof(nativeLocation)); }
    /// <summary>Genuine native approval request identity.</summary>
    public string RequestId { get; }
    /// <summary>Independently owned protected model descriptor.</summary>
    public NativeToolCall Call { get; }
    /// <summary>Original native position captured before projection.</summary>
    public NativeRequestLocation NativeLocation { get; }
    /// <summary>Protected requests always require explicit confirmation.</summary>
    public bool RequiresConfirmation => true;
}
/// <summary>Informational native browser bypass binding without protected decision authority.</summary>
public sealed class NativeBrowserRequestBinding
{
    /// <summary>Clones genuine browser request arguments before asynchronous capture.</summary>
    public NativeBrowserRequestBinding(string requestId, string callId, string name, JsonElement arguments, NativeRequestLocation nativeLocation)
    { RequestId = NativeSessionKey.Required(requestId); CallId = NativeSessionKey.Required(callId); Name = NativeSessionKey.Required(name); Arguments = arguments.ValueKind == JsonValueKind.Object ? arguments.Clone() : throw new ArgumentException("Browser arguments must be an object."); NativeLocation = nativeLocation ?? throw new ArgumentNullException(nameof(nativeLocation)); }
    /// <summary>Genuine nonconfirmation native request identity.</summary>
    public string RequestId { get; }
    /// <summary>Original registered browser call identity.</summary>
    public string CallId { get; }
    /// <summary>Registered browser function name.</summary>
    public string Name { get; }
    /// <summary>Cloned original browser arguments.</summary>
    public JsonElement Arguments { get; }
    /// <summary>Original native position captured before projection.</summary>
    public NativeRequestLocation NativeLocation { get; }
    /// <summary>Browser bindings never require protected confirmation.</summary>
    public bool RequiresConfirmation => false;
}
/// <summary>Complete genuine native capture, distinct from a published bound batch.</summary>
public sealed class NativeApprovalBatch
{
    /// <summary>Copies bounded collections and rejects ambiguous native identities.</summary>
    public NativeApprovalBatch(string batchId, IReadOnlyList<NativeApprovalDescriptor> protectedRequests, IReadOnlyList<NativeBrowserRequestBinding> browserBindings)
    {
        BatchId = NativeSessionKey.Required(batchId);
        ProtectedRequests = NativeApprovalValues.Copy(protectedRequests); BrowserBindings = NativeApprovalValues.Copy(browserBindings);
        if (ProtectedRequests.Count == 0 || ProtectedRequests.Count + BrowserBindings.Count > 256) throw new ArgumentException("A bounded protected batch is required.");
        var requestIds = ProtectedRequests.Select(item => item.RequestId).Concat(BrowserBindings.Select(item => item.RequestId)).ToArray();
        var callIds = ProtectedRequests.Select(item => item.Call.Id).Concat(BrowserBindings.Select(item => item.CallId)).ToArray();
        if (requestIds.Distinct(StringComparer.Ordinal).Count() != requestIds.Length || callIds.Distinct(StringComparer.Ordinal).Count() != callIds.Length) throw new ArgumentException("Native requests and calls must be unique.");
    }
    /// <summary>Server-created immutable batch identity.</summary>
    public string BatchId { get; }
    /// <summary>Every protected request in this complete native observation.</summary>
    public IReadOnlyList<NativeApprovalDescriptor> ProtectedRequests { get; }
    /// <summary>Associated genuine nonconfirmation browser requests.</summary>
    public IReadOnlyList<NativeBrowserRequestBinding> BrowserBindings { get; }
}
/// <summary>Complete capture with exact public positions bound by genuine projection.</summary>
public sealed class NativeBoundApprovalBatch
{
    /// <summary>Copies locations and requires exactly one distinct public call per native request.</summary>
    public NativeBoundApprovalBatch(NativeApprovalBatch batch, IReadOnlyDictionary<string, NativePublicCallLocation> publicLocations)
    {
        Batch = batch ?? throw new ArgumentNullException(nameof(batch)); ArgumentNullException.ThrowIfNull(publicLocations);
        if (publicLocations.Count != batch.ProtectedRequests.Count + batch.BrowserBindings.Count) throw new ArgumentException("A bounded complete public position map is required.");
        PublicLocations = publicLocations.ToFrozenDictionary(pair => NativeSessionKey.Required(pair.Key), pair => pair.Value ?? throw new ArgumentException("A public location is required."), StringComparer.Ordinal);
        var ids = batch.ProtectedRequests.Select(item => item.RequestId).Concat(batch.BrowserBindings.Select(item => item.RequestId));
        if (!ids.ToHashSet(StringComparer.Ordinal).SetEquals(PublicLocations.Keys) || PublicLocations.Values.Select(item => (item.MessageIndex, item.CallIndex)).Distinct().Count() != PublicLocations.Count) throw new ArgumentException("Every genuine native request needs one distinct public position.");
    }
    /// <summary>Original immutable native observation.</summary>
    public NativeApprovalBatch Batch { get; }
    /// <summary>Request identity to exact genuine public call position.</summary>
    public IReadOnlyDictionary<string, NativePublicCallLocation> PublicLocations { get; }
}
/// <summary>Explicit saved approval state; absence is never inferred from public history.</summary>
public sealed class NativeApprovalSnapshot
{
    /// <summary>Creates explicit empty or pending genuine approval state.</summary>
    public NativeApprovalSnapshot(NativeBoundApprovalBatch? pendingBatch) { PendingBatch = pendingBatch; }
    /// <summary>Explicit ordinary nonapproval state for source-compatible constructors.</summary>
    public static NativeApprovalSnapshot Empty { get; } = new(null);
    /// <summary>Current complete pending publication, if any.</summary>
    public NativeBoundApprovalBatch? PendingBatch { get; }
}
/// <summary>Request-local validated raw decisions, never a durable reservation.</summary>
public sealed class NativeApprovalAdmissionEnvelope
{
    /// <summary>Copies decisions separately from canonical public history.</summary>
    public NativeApprovalAdmissionEnvelope(string canonicalPublicRequest, IReadOnlyList<NativeApprovalDecision> decisions)
    { CanonicalPublicRequest = canonicalPublicRequest ?? throw new ArgumentNullException(nameof(canonicalPublicRequest)); Decisions = NativeApprovalValues.Copy(decisions); if (Decisions.Count is < 1 or > 256 || Decisions.Select(item => item.RequestId).Distinct(StringComparer.Ordinal).Count() != Decisions.Count) throw new ArgumentException("A complete unique bounded decision set is required."); }
    /// <summary>Canonical original public configuration and history without resume.</summary>
    public string CanonicalPublicRequest { get; }
    /// <summary>Validated decisions awaiting atomic durable admission.</summary>
    public IReadOnlyList<NativeApprovalDecision> Decisions { get; }
}
/// <summary>Current journal-owned approval authority materialized under a current lease.</summary>
public sealed class NativeApprovalEvidence
{
    /// <summary>Copies immutable owned evidence; persistence rechecks every authority field.</summary>
    public NativeApprovalEvidence(string sessionKeyId, string compatibilityId, string catalogIdentity, NativeSessionLease currentOwner, NativeBoundApprovalBatch batch, long publishedRevision, NativeApprovalState state, IReadOnlyList<NativeApprovalDecision> decisions, long? admittedGeneration, long? admittedRevision, DateTimeOffset expiresAt)
    {
        SessionKeyId = NativeSessionKey.Required(sessionKeyId); CompatibilityId = NativeSessionKey.Required(compatibilityId); CatalogIdentity = NativeSessionKey.Required(catalogIdentity);
        CurrentOwner = currentOwner ?? throw new ArgumentNullException(nameof(currentOwner)); Batch = batch ?? throw new ArgumentNullException(nameof(batch));
        if (SessionKeyId != currentOwner.Key.Id || publishedRevision < 1 || !Enum.IsDefined(state) || admittedGeneration is < 1 || admittedRevision is < 1) throw new ArgumentException("Invalid owned approval provenance.");
        PublishedRevision = publishedRevision; State = state; Decisions = NativeApprovalValues.Copy(decisions); AdmittedGeneration = admittedGeneration; AdmittedRevision = admittedRevision; ExpiresAt = expiresAt;
    }
    /// <summary>Complete trusted native key digest.</summary>
    public string SessionKeyId { get; }
    /// <summary>Journal-bound immutable compatibility identity.</summary>
    public string CompatibilityId { get; }
    /// <summary>Registered server catalog identity.</summary>
    public string CatalogIdentity { get; }
    /// <summary>Current acquired owner; capture-owner provenance remains in durable rows.</summary>
    public NativeSessionLease CurrentOwner { get; }
    /// <summary>Original published native batch and public positions.</summary>
    public NativeBoundApprovalBatch Batch { get; }
    /// <summary>Pending save revision associated with original publication.</summary>
    public long PublishedRevision { get; }
    /// <summary>Journal-owned batch lifecycle state.</summary>
    public NativeApprovalState State { get; }
    /// <summary>Durably consumed decisions, if any.</summary>
    public IReadOnlyList<NativeApprovalDecision> Decisions { get; }
    /// <summary>Generation consuming the complete batch.</summary>
    public long? AdmittedGeneration { get; }
    /// <summary>Revision consuming the complete batch.</summary>
    public long? AdmittedRevision { get; }
    /// <summary>DB-clock expiry, never a client timestamp.</summary>
    public DateTimeOffset ExpiresAt { get; }
}
/// <summary>Genuine native rejection observed for an admitted zero-dispatch decision.</summary>
public sealed class NativeApprovalRejection
{
    /// <summary>Clones the actual result and refuses an approved rejection.</summary>
    public NativeApprovalRejection(string batchId, string requestId, string callId, NativeApprovalDecisionKind decision, JsonElement result)
    { BatchId = NativeSessionKey.Required(batchId); RequestId = NativeSessionKey.Required(requestId); CallId = NativeSessionKey.Required(callId); Decision = decision is NativeApprovalDecisionKind.Declined or NativeApprovalDecisionKind.Cancelled ? decision : throw new ArgumentException("Only native rejection can settle without dispatch."); Result = result.ValueKind != JsonValueKind.Undefined ? result.Clone() : throw new ArgumentException("A genuine rejection result is required."); }
    /// <summary>Original server batch identity.</summary>
    public string BatchId { get; }
    /// <summary>Original protected native request identity.</summary>
    public string RequestId { get; }
    /// <summary>Original protected model call identity.</summary>
    public string CallId { get; }
    /// <summary>Admitted declined or cancelled decision.</summary>
    public NativeApprovalDecisionKind Decision { get; }
    /// <summary>Independently owned genuine native result.</summary>
    public JsonElement Result { get; }
}
/// <summary>Shared checked immutable approval value construction.</summary>
internal static class NativeApprovalValues
{
    /// <summary>Bounds a native/public position before materialization.</summary>
    internal static int Index(int value) => value is >= 0 and <= 1048576 ? value : throw new ArgumentOutOfRangeException(nameof(value));
    /// <summary>Copies nonnull bounded collections before asynchronous use.</summary>
    internal static IReadOnlyList<T> Copy<T>(IReadOnlyList<T> values)
    { ArgumentNullException.ThrowIfNull(values); if (values.Count > 256 || values.Any(value => value is null)) throw new ArgumentException("Approval values must be nonnull and bounded."); return Array.AsReadOnly(values.ToArray()); }
}
