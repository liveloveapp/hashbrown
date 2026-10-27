using System.Collections.Frozen;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Hashbrown.Conformance.Integration;

/// <summary>Complete trusted native store key. Browser thread IDs are selectors, never authority.</summary>
public sealed class NativeSessionKey
{
    /// <summary>Creates a key preserving every ordinal partition, rejecting incomplete authority.</summary>
    public NativeSessionKey(string agent, string scope, string selector, IReadOnlyDictionary<string, string> partitions)
    {
        Agent = Required(agent); Scope = Required(scope); Selector = Required(selector);
        if (partitions.Count == 0 || partitions.Count > 32) throw new ArgumentException("Native store partitions are required and bounded.");
        Partitions = partitions.ToFrozenDictionary(pair => Required(pair.Key), pair => Required(pair.Value), StringComparer.Ordinal);
        Id = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new object[] { Agent, Scope, Selector, Partitions.OrderBy(pair => pair.Key, StringComparer.Ordinal).Select(pair => new[] { pair.Key, pair.Value }).ToArray() })));
    }
    /// <summary>Stable server registration name.</summary>
    public string Agent { get; }
    /// <summary>Authenticated server-owned scope.</summary>
    public string Scope { get; }
    /// <summary>Public thread selector.</summary>
    public string Selector { get; }
    /// <summary>Complete immutable native partitions.</summary>
    public IReadOnlyDictionary<string, string> Partitions { get; }
    /// <summary>Secret-free key digest.</summary>
    public string Id { get; }
    internal static string Required(string value) => !string.IsNullOrWhiteSpace(value) && Encoding.UTF8.GetByteCount(value) <= 1024 ? value : throw new ArgumentException("A bounded nonempty native identity is required.");
}

/// <summary>Finite native storage limits, independent of the existing checkpoint schema.</summary>
public sealed record NativeSessionOptions
{
    /// <summary>Maximum live/private payloads per agent and trusted scope.</summary>
    public int PayloadCapacity { get; init; } = 128;
    /// <summary>Maximum selectors, including permanent tombstones, per agent and scope.</summary>
    public int SelectorCapacity { get; init; } = 4096;
    /// <summary>Request authority lifetime.</summary>
    public TimeSpan Lease { get; init; } = TimeSpan.FromSeconds(30);
    /// <summary>Private session retention. Unknown fences are retained without automatic replay.</summary>
    public TimeSpan Retention { get; init; } = TimeSpan.FromHours(1);
    /// <summary>Maximum native session UTF-8 bytes.</summary>
    public int NativeBytes { get; init; } = 1024 * 1024;
    /// <summary>Maximum current public request UTF-8 bytes.</summary>
    public int PublicBytes { get; init; } = 1024 * 1024;
    /// <summary>Maximum transcript message count.</summary>
    public int MaximumMessages { get; init; } = 2048;
    /// <summary>Maximum retained model call descriptors per selector.</summary>
    public int MaximumCalls { get; init; } = 256;
    /// <summary>Maximum canonical arguments bytes per descriptor.</summary>
    public int ArgumentBytes { get; init; } = 64 * 1024;
    /// <summary>Maximum maintenance rows per transaction.</summary>
    public int MaintenanceBatch { get; init; } = 100;
    internal NativeSessionOptions Checked()
    {
        if (PayloadCapacity < 1 || SelectorCapacity < PayloadCapacity || Lease <= TimeSpan.Zero || Lease > TimeSpan.FromDays(1) || Retention <= TimeSpan.Zero || NativeBytes < 1 || PublicBytes < 1 || MaximumMessages < 1 || MaximumCalls < 1 || ArgumentBytes < 1 || MaintenanceBatch is < 1 or > 1000) throw new ArgumentOutOfRangeException(nameof(NativeSessionOptions));
        return this;
    }
}

/// <summary>Immutable model-emitted server call; JSON arguments are cloned at capture.</summary>
public sealed class NativeToolCall(string id, string name, int version, JsonElement arguments)
{
    /// <summary>Native model call identity.</summary>
    public string Id { get; } = NativeSessionKey.Required(id);
    /// <summary>Registered operation name.</summary>
    public string Name { get; } = NativeSessionKey.Required(name);
    /// <summary>Server-selected operation version.</summary>
    public int Version { get; } = version > 0 ? version : throw new ArgumentOutOfRangeException(nameof(version));
    /// <summary>Cloned model arguments.</summary>
    public JsonElement Arguments { get; } = arguments.ValueKind == JsonValueKind.Object ? arguments.Clone() : throw new ArgumentException("Tool arguments must be an object.");
}

/// <summary>Opaque server request authority; revision is the immutable acquisition epoch; journal revisions advance separately.</summary>
public sealed record NativeSessionLease(NativeSessionKey Key, string Token, long Generation, long Revision);
/// <summary>Read-only independently materialized durable payload owned by an admitted request.</summary>
public sealed record NativeSessionSnapshot
{
    /// <summary>Clones all collections at the storage boundary.</summary>
    public NativeSessionSnapshot(string? nativeJson, string publicRequest, IReadOnlyList<NativeToolCall> pendingCalls, IReadOnlyList<string> expectedBrowserCallIds, bool turnCompleted)
        : this(nativeJson, publicRequest, pendingCalls, expectedBrowserCallIds, turnCompleted, NativeApprovalSnapshot.Empty) { }
    /// <summary>Requires explicit independently owned approval state when reading serialized payloads.</summary>
    [JsonConstructor]
    public NativeSessionSnapshot(string? nativeJson, string publicRequest, IReadOnlyList<NativeToolCall> pendingCalls, IReadOnlyList<string> expectedBrowserCallIds, bool turnCompleted, NativeApprovalSnapshot approvals)
    {
        Approvals = approvals ?? throw new ArgumentException("Explicit native approval state is required.");
        NativeJson = nativeJson; PublicRequest = publicRequest ?? throw new ArgumentException("Public history is required.");
        PendingCalls = Array.AsReadOnly((pendingCalls ?? throw new ArgumentException("Pending calls are required.")).ToArray());
        ExpectedBrowserCallIds = Array.AsReadOnly((expectedBrowserCallIds ?? throw new ArgumentException("Expected browser calls are required.")).ToArray());
        TurnCompleted = turnCompleted;
    }
    /// <summary>Explicit saved approval state, never inferred from public history.</summary>
    public NativeApprovalSnapshot Approvals { get; }
    /// <summary>Private opaque native JSON; null is allowed only for a known virgin.</summary>
    public string? NativeJson { get; }
    /// <summary>One current canonical AGUI request prefix.</summary>
    public string PublicRequest { get; }
    /// <summary>Still-captured model-emitted server descriptors.</summary>
    public IReadOnlyList<NativeToolCall> PendingCalls { get; }
    /// <summary>Exact visible browser calls awaiting caller results.</summary>
    public IReadOnlyList<string> ExpectedBrowserCallIds { get; }
    /// <summary>Whether one subsequent user message may be admitted.</summary>
    public bool TurnCompleted { get; }
}
/// <summary>Pre-stream admission status: 400 bad input, 409 conflict, 410 retired, 503 unavailable.</summary>
public sealed record NativeSessionAdmission(int Status, NativeSessionLease? Lease = null, NativeSessionSnapshot? Snapshot = null, bool IsNew = false);
/// <summary>Atomic native and public snapshot save, containing no reconstructed server authority.</summary>
public sealed record NativeSessionSave
{
    /// <summary>Clones collections before asynchronous persistence can observe them.</summary>
    public NativeSessionSave(string nativeJson, string publicRequest, IReadOnlyList<NativeToolCall> pendingCalls, IReadOnlyList<string> expectedBrowserCallIds, bool turnCompleted)
        : this(nativeJson, publicRequest, pendingCalls, expectedBrowserCallIds, turnCompleted, NativeApprovalSnapshot.Empty) { }
    /// <summary>Requires explicit independently owned approval state when reading serialized payloads.</summary>
    [JsonConstructor]
    public NativeSessionSave(string nativeJson, string publicRequest, IReadOnlyList<NativeToolCall> pendingCalls, IReadOnlyList<string> expectedBrowserCallIds, bool turnCompleted, NativeApprovalSnapshot approvals)
    {
        Approvals = approvals ?? throw new ArgumentException("Explicit native approval state is required.");
        NativeJson = nativeJson; PublicRequest = publicRequest;
        PendingCalls = Array.AsReadOnly(pendingCalls.ToArray()); ExpectedBrowserCallIds = Array.AsReadOnly(expectedBrowserCallIds.ToArray()); TurnCompleted = turnCompleted;
    }
    /// <summary>Explicit saved approval state, never inferred from public history.</summary>
    public NativeApprovalSnapshot Approvals { get; }
    /// <summary>Private opaque native session serialization.</summary>
    public string NativeJson { get; }
    /// <summary>Genuine-event projection of the admitted public request.</summary>
    public string PublicRequest { get; }
    /// <summary>Still-captured server descriptors.</summary>
    public IReadOnlyList<NativeToolCall> PendingCalls { get; }
    /// <summary>Visible browser calls expecting exact results.</summary>
    public IReadOnlyList<string> ExpectedBrowserCallIds { get; }
    /// <summary>Whether native execution completed its turn.</summary>
    public bool TurnCompleted { get; }
}
/// <summary>Private receipt binding publication to the successfully saved owner and revision.</summary>
public sealed record NativeSavedReceipt(NativeSessionLease Lease, long SavedRevision);
/// <summary>Bounded public status; private native JSON is never exposed.</summary>
public sealed record NativeSessionStatus(int Status, string? State = null, long Generation = 0, long Revision = 0, string? PublicRequest = null, DateTimeOffset? LeaseUntil = null, bool IsNew = false, bool TurnCompleted = false, IReadOnlyList<RecoveryInterrupt>? PendingInterrupts = null, string? RecoveryReason = null);
/// <summary>Scoped operator CAS requiring explicit quiescence and external evidence.</summary>
public sealed record NativeSessionReconciliation(string ExpectedState, long ExpectedGeneration, long ExpectedRevision, string Outcome, string Reason, string EvidenceReference, bool ExternalQuiescenceAcknowledged);
/// <summary>Immutable operator audit entry.</summary>
public sealed record NativeSessionAudit(string Actor, string PriorState, long PriorGeneration, long PriorRevision, string Outcome, string Reason, string EvidenceReference, DateTimeOffset RecordedAt);
/// <summary>Scoped bounded inspection; argument and session payloads stay private.</summary>
public sealed record NativeSessionInspection(NativeSessionStatus Status, IReadOnlyList<NativeInvocationStatus> Invocations, IReadOnlyList<NativeSessionAudit> Audit);
/// <summary>Safe dispatch fence metadata.</summary>
public sealed record NativeInvocationStatus(string Id, string Name, int Version, string State, long Generation);

/// <summary>Plain persistence boundary; no transaction spans native callbacks, model requests, streaming or waits.</summary>
public interface INativeSessionJournal
{
    /// <summary>Initializes the separately versioned native schema.</summary>
    ValueTask InitializeAsync(CancellationToken cancellationToken = default);
    /// <summary>Admits a bounded exact owned prefix and acquires request authority.</summary>
    ValueTask<NativeSessionAdmission> TryAcquireAsync(NativeSessionKey key, string publicRequestJson, CancellationToken cancellationToken = default);
    /// <summary>Persists an actual model descriptor before native bypass sees it.</summary>
    ValueTask<bool> CaptureModelCallAsync(NativeSessionLease lease, NativeToolCall call, CancellationToken cancellationToken = default);
    /// <summary>Persists only genuine native request capture under the current owner.</summary>
    ValueTask<bool> CaptureApprovalBatchAsync(NativeSessionLease lease, NativeApprovalBatch capture, CancellationToken cancellationToken = default);
    /// <summary>Materializes bound approval evidence only under current request authority.</summary>
    ValueTask<NativeApprovalEvidence?> GetOwnedApprovalEvidenceAsync(NativeSessionLease lease, CancellationToken cancellationToken = default);
    /// <summary>Atomically reserves the exact complete published decision set or consumes none.</summary>
    ValueTask<bool> TryAdmitApprovalBatchAsync(NativeSessionLease lease, string batchId, NativeApprovalAdmissionEnvelope admission, CancellationToken cancellationToken = default);
    /// <summary>Settles only a genuine admitted decline or cancellation without dispatch.</summary>
    ValueTask<bool> SettleApprovalRejectionAsync(NativeSessionLease lease, NativeApprovalRejection rejection, CancellationToken cancellationToken = default);
    /// <summary>Settles the exact genuine interrupted browser rejection without granting a decision or dispatch.</summary>
    ValueTask<bool> SettleBrowserBypassResultAsync(NativeSessionLease lease, string batchId, string requestId, string callId, JsonElement result, CancellationToken cancellationToken = default);
    /// <summary>Reads only a captured descriptor under the current owner.</summary>
    ValueTask<NativeToolCall?> GetOwnedCallAsync(NativeSessionLease lease, string callId, CancellationToken cancellationToken = default);
    /// <summary>Commits a permanent dispatch marker before executing.</summary>
    ValueTask<bool> TryStartDispatchAsync(NativeSessionLease lease, NativeToolCall call, CancellationToken cancellationToken = default);
    /// <summary>Records a completed dispatch under the same unexpired owner.</summary>
    ValueTask<bool> CompleteDispatchAsync(NativeSessionLease lease, NativeToolCall call, CancellationToken cancellationToken = default);
    /// <summary>Renews current authority without invalidating a saved receipt.</summary>
    ValueTask<bool> RenewAsync(NativeSessionLease lease, CancellationToken cancellationToken = default);
    /// <summary>Atomically saves private native JSON and canonical public state, retaining ownership.</summary>
    ValueTask<NativeSavedReceipt?> SaveAsync(NativeSessionLease lease, NativeSessionSave save, CancellationToken cancellationToken = default);
    /// <summary>Reserves publication only for the exact saved receipt.</summary>
    ValueTask<bool> AuthorizePublicationAsync(NativeSavedReceipt receipt, CancellationToken cancellationToken = default);
    /// <summary>Releases a publication reservation after the bounded write succeeds.</summary>
    ValueTask<bool> FinalizePublicationAsync(NativeSavedReceipt receipt, CancellationToken cancellationToken = default);
    /// <summary>Releases pre-dispatch work or retains an ambiguous effect/publication fence.</summary>
    ValueTask<bool> FailureCleanupAsync(NativeSessionLease lease, CancellationToken cancellationToken = default);
    /// <summary>Reads bounded public disposition without acquiring execution authority.</summary>
    ValueTask<NativeSessionStatus> ReadStatusAsync(NativeSessionKey key, CancellationToken cancellationToken = default);
    /// <summary>Inspects safe metadata within server-permitted scopes.</summary>
    ValueTask<NativeSessionInspection?> InspectAsync(IReadOnlySet<string> scopes, NativeSessionKey key, int limit = 50, CancellationToken cancellationToken = default);
    /// <summary>Terminally reconciles exact current state with immutable evidence and quiescence.</summary>
    ValueTask<int> ReconcileAsync(IReadOnlySet<string> scopes, NativeSessionKey key, string actor, NativeSessionReconciliation request, CancellationToken cancellationToken = default);
    /// <summary>Terminally retires a selector with the same scoped operator CAS.</summary>
    ValueTask<int> RetireAsync(IReadOnlySet<string> scopes, NativeSessionKey key, string actor, NativeSessionReconciliation request, CancellationToken cancellationToken = default);
    /// <summary>Purges expired private bytes while retaining all selector tombstones and unknown fences.</summary>
    ValueTask<int> MaintainAsync(CancellationToken cancellationToken = default);
}
