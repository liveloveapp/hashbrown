using Hashbrown.Conformance.Integration;

namespace Hashbrown.Conformance.Testing;

/// <summary>Test-only barrier decorator delegating every authority decision to the real journal.</summary>
public sealed class FixtureNativeJournal(INativeSessionJournal inner, FixtureNativeGate gate, bool failSave = false) : INativeSessionJournal
{
    /// <inheritdoc />
    public ValueTask InitializeAsync(CancellationToken cancellationToken = default) => inner.InitializeAsync(cancellationToken);
    /// <inheritdoc />
    public ValueTask<NativeSessionAdmission> TryAcquireAsync(NativeSessionKey key, string publicRequestJson, CancellationToken cancellationToken = default) => inner.TryAcquireAsync(key, publicRequestJson, cancellationToken);
    /// <inheritdoc />
    public ValueTask<bool> CaptureModelCallAsync(NativeSessionLease lease, NativeToolCall call, CancellationToken cancellationToken = default) => inner.CaptureModelCallAsync(lease, call, cancellationToken);
    /// <inheritdoc />
    public ValueTask<bool> CaptureApprovalBatchAsync(NativeSessionLease lease, NativeApprovalBatch capture, CancellationToken cancellationToken = default) => inner.CaptureApprovalBatchAsync(lease, capture, cancellationToken);
    /// <inheritdoc />
    public ValueTask<NativeApprovalEvidence?> GetOwnedApprovalEvidenceAsync(NativeSessionLease lease, CancellationToken cancellationToken = default) => inner.GetOwnedApprovalEvidenceAsync(lease, cancellationToken);
    /// <inheritdoc />
    public ValueTask<bool> TryAdmitApprovalBatchAsync(NativeSessionLease lease, string batchId, NativeApprovalAdmissionEnvelope admission, CancellationToken cancellationToken = default) => inner.TryAdmitApprovalBatchAsync(lease, batchId, admission, cancellationToken);
    /// <inheritdoc />
    public ValueTask<bool> SettleApprovalRejectionAsync(NativeSessionLease lease, NativeApprovalRejection rejection, CancellationToken cancellationToken = default) => inner.SettleApprovalRejectionAsync(lease, rejection, cancellationToken);
    /// <inheritdoc />
    public ValueTask<NativeToolCall?> GetOwnedCallAsync(NativeSessionLease lease, string callId, CancellationToken cancellationToken = default) => inner.GetOwnedCallAsync(lease, callId, cancellationToken);
    /// <inheritdoc />
    public async ValueTask<bool> TryStartDispatchAsync(NativeSessionLease lease, NativeToolCall call, CancellationToken cancellationToken = default)
    {
        await gate.ReachAsync("before-dispatch-marker", cancellationToken);
        var started = await inner.TryStartDispatchAsync(lease, call, cancellationToken);
        if (started) await gate.ReachAsync("dispatch-marker-committed", cancellationToken);
        return started;
    }
    /// <inheritdoc />
    public ValueTask<bool> CompleteDispatchAsync(NativeSessionLease lease, NativeToolCall call, CancellationToken cancellationToken = default) => inner.CompleteDispatchAsync(lease, call, cancellationToken);
    /// <inheritdoc />
    public ValueTask<bool> RenewAsync(NativeSessionLease lease, CancellationToken cancellationToken = default) => inner.RenewAsync(lease, cancellationToken);
    /// <inheritdoc />
    public async ValueTask<NativeSavedReceipt?> SaveAsync(NativeSessionLease lease, NativeSessionSave save, CancellationToken cancellationToken = default)
    {
        if (save.ExpectedBrowserCallIds.Count > 0) await gate.ReachAsync("before-pending-save", cancellationToken);
        if (failSave) return null;
        var receipt = await inner.SaveAsync(lease, save, cancellationToken);
        if (receipt is not null) await gate.ReachAsync("after-save-before-publication", cancellationToken);
        return receipt;
    }
    /// <inheritdoc />
    public async ValueTask<bool> AuthorizePublicationAsync(NativeSavedReceipt receipt, CancellationToken cancellationToken = default)
    {
        var authorized = await inner.AuthorizePublicationAsync(receipt, cancellationToken);
        if (authorized) await gate.ReachAsync("publication-authorized", cancellationToken);
        return authorized;
    }
    /// <inheritdoc />
    public ValueTask<bool> FinalizePublicationAsync(NativeSavedReceipt receipt, CancellationToken cancellationToken = default) => inner.FinalizePublicationAsync(receipt, cancellationToken);
    /// <inheritdoc />
    public ValueTask<bool> FailureCleanupAsync(NativeSessionLease lease, CancellationToken cancellationToken = default) => inner.FailureCleanupAsync(lease, cancellationToken);
    /// <inheritdoc />
    public ValueTask<NativeSessionStatus> ReadStatusAsync(NativeSessionKey key, CancellationToken cancellationToken = default) => inner.ReadStatusAsync(key, cancellationToken);
    /// <inheritdoc />
    public ValueTask<NativeSessionInspection?> InspectAsync(IReadOnlySet<string> scopes, NativeSessionKey key, int limit = 50, CancellationToken cancellationToken = default) => inner.InspectAsync(scopes, key, limit, cancellationToken);
    /// <inheritdoc />
    public ValueTask<int> ReconcileAsync(IReadOnlySet<string> scopes, NativeSessionKey key, string actor, NativeSessionReconciliation request, CancellationToken cancellationToken = default) => inner.ReconcileAsync(scopes, key, actor, request, cancellationToken);
    /// <inheritdoc />
    public ValueTask<int> RetireAsync(IReadOnlySet<string> scopes, NativeSessionKey key, string actor, NativeSessionReconciliation request, CancellationToken cancellationToken = default) => inner.RetireAsync(scopes, key, actor, request, cancellationToken);
    /// <inheritdoc />
    public ValueTask<int> MaintainAsync(CancellationToken cancellationToken = default) => inner.MaintainAsync(cancellationToken);
}
