#pragma warning disable MAAI001 // Fixture delegates all public pinned native store methods beneath actual isolation.
using Microsoft.Agents.AI;
using System.Text.Json;
using Hashbrown.Conformance.Integration;

namespace Hashbrown.Conformance.Testing;

/// <summary>Test-only barrier decorator delegating every authority decision to the real journal.</summary>
public sealed class FixtureNativeJournal(INativeSessionJournal inner, FixtureNativeGate gate, bool failSave = false, FixtureLiveApprovalProof? liveApproval = null) : INativeSessionJournal
{
    /// <inheritdoc />
    public ValueTask InitializeAsync(CancellationToken cancellationToken = default) => inner.InitializeAsync(cancellationToken);
    /// <inheritdoc />
    public ValueTask<NativeSessionAdmission> TryAcquireAsync(NativeSessionKey key, string publicRequestJson, CancellationToken cancellationToken = default) => inner.TryAcquireAsync(key, publicRequestJson, cancellationToken);
    /// <inheritdoc />
    public async ValueTask<bool> CaptureModelCallAsync(NativeSessionLease lease, NativeToolCall call, CancellationToken cancellationToken = default)
    {
        var captured = await inner.CaptureModelCallAsync(lease, call, cancellationToken);
        if (captured) liveApproval?.CapturedModel(lease, call);
        return captured;
    }
    /// <inheritdoc />
    public async ValueTask<bool> CaptureApprovalBatchAsync(NativeSessionLease lease, NativeApprovalBatch capture, CancellationToken cancellationToken = default)
    {
        var captured = await inner.CaptureApprovalBatchAsync(lease, capture, cancellationToken);
        if (captured) liveApproval?.CapturedApproval(lease, capture);
        return captured;
    }
    /// <inheritdoc />
    public async ValueTask<NativeApprovalEvidence?> GetOwnedApprovalEvidenceAsync(NativeSessionLease lease, CancellationToken cancellationToken = default)
    {
        var evidence = await inner.GetOwnedApprovalEvidenceAsync(lease, cancellationToken);
        if (evidence is not null) liveApproval?.Evidence(lease, evidence);
        return evidence;
    }
    /// <inheritdoc />
    public async ValueTask<bool> TryAdmitApprovalBatchAsync(NativeSessionLease lease, string batchId, NativeApprovalAdmissionEnvelope admission, CancellationToken cancellationToken = default)
    {
        await gate.ReachAsync("before-decision-reservation", cancellationToken);
        var admitted = await inner.TryAdmitApprovalBatchAsync(lease, batchId, admission, cancellationToken);
        if (admitted) { liveApproval?.Admitted(lease, batchId, admission); await gate.ReachAsync("decision-admitted", cancellationToken); }
        return admitted;
    }
    /// <inheritdoc />
    public ValueTask<bool> SettleApprovalRejectionAsync(NativeSessionLease lease, NativeApprovalRejection rejection, CancellationToken cancellationToken = default) => inner.SettleApprovalRejectionAsync(lease, rejection, cancellationToken);
    /// <inheritdoc />
    public ValueTask<bool> SettleBrowserBypassResultAsync(NativeSessionLease lease, string batchId, string requestId, string callId, JsonElement result, CancellationToken cancellationToken = default) => inner.SettleBrowserBypassResultAsync(lease, batchId, requestId, callId, result, cancellationToken);
    /// <inheritdoc />
    public ValueTask<NativeToolCall?> GetOwnedCallAsync(NativeSessionLease lease, string callId, CancellationToken cancellationToken = default) => inner.GetOwnedCallAsync(lease, callId, cancellationToken);
    /// <inheritdoc />
    public async ValueTask<bool> TryStartDispatchAsync(NativeSessionLease lease, NativeToolCall call, CancellationToken cancellationToken = default)
    {
        await gate.ReachAsync("before-dispatch-marker", cancellationToken);
        var started = await inner.TryStartDispatchAsync(lease, call, cancellationToken);
        if (started) { liveApproval?.Dispatch(lease, call, false); await gate.ReachAsync("dispatch-marker-committed", cancellationToken); }
        return started;
    }
    /// <inheritdoc />
    public async ValueTask<bool> CompleteDispatchAsync(NativeSessionLease lease, NativeToolCall call, CancellationToken cancellationToken = default)
    {
        var completed = await inner.CompleteDispatchAsync(lease, call, cancellationToken);
        if (completed) liveApproval?.Dispatch(lease, call, true);
        return completed;
    }
    /// <inheritdoc />
    public async ValueTask<bool> RenewAsync(NativeSessionLease lease, CancellationToken cancellationToken = default)
    {
        try
        {
            var renewed = await inner.RenewAsync(lease, cancellationToken);
            if (!renewed) gate.RecordRenewalFailure();
            return renewed;
        }
        catch { gate.RecordRenewalFailure(); throw; }
    }
    /// <inheritdoc />
    public async ValueTask<NativeSavedReceipt?> SaveAsync(NativeSessionLease lease, NativeSessionSave save, CancellationToken cancellationToken = default)
    {
        await gate.ReachAsync("before-session-save", cancellationToken);
        if (save.Approvals.PendingBatch is not null || save.ExpectedBrowserCallIds.Count > 0) await gate.ReachAsync("before-pending-save", cancellationToken);
        if (failSave) return null;
        var receipt = await inner.SaveAsync(lease, save, cancellationToken);
        if (receipt is not null) { liveApproval?.Saved(lease, save, receipt); await gate.ReachAsync("after-save-before-publication", cancellationToken); }
        return receipt;
    }
    /// <inheritdoc />
    public async ValueTask<bool> AuthorizePublicationAsync(NativeSavedReceipt receipt, CancellationToken cancellationToken = default)
    {
        var authorized = await inner.AuthorizePublicationAsync(receipt, cancellationToken);
        if (authorized) { liveApproval?.Published(receipt, false); await gate.ReachAsync("publication-authorized", cancellationToken); }
        return authorized;
    }
    /// <inheritdoc />
    public async ValueTask<bool> FinalizePublicationAsync(NativeSavedReceipt receipt, CancellationToken cancellationToken = default)
    {
        await gate.ReachAsync("before-publication-finalization", cancellationToken);
        var finalized = await inner.FinalizePublicationAsync(receipt, cancellationToken);
        if (finalized) liveApproval?.Published(receipt, true);
        return finalized;
    }
    /// <inheritdoc />
    public async ValueTask<bool> FailureCleanupAsync(NativeSessionLease lease, CancellationToken cancellationToken = default)
    {
        var cleaned = await inner.FailureCleanupAsync(lease, cancellationToken);
        gate.RecordCleanup();
        return cleaned;
    }
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

/// <summary>Adds only trusted fixture deployment partitions and forwards all native store operations to the real store.</summary>
public sealed class FixtureNativePartitionStore(AgentSessionStore inner, string? tenant, string? region) : AgentSessionStore
{
    private AgentSessionStoreKey Partition(AgentSessionStoreKey key)
    {
        var actual = tenant is null ? key : key.WithPartition("tenant", tenant);
        return region is null ? actual : actual.WithPartition("region", region);
    }
    /// <inheritdoc />
    public override ValueTask<AgentSession?> GetSessionAsync(AIAgent agent, AgentSessionStoreKey key, CancellationToken cancellationToken = default) => inner.GetSessionAsync(agent, Partition(key), cancellationToken);
    /// <inheritdoc />
    public override ValueTask<AgentSession> GetOrCreateSessionAsync(AIAgent agent, AgentSessionStoreKey key, CancellationToken cancellationToken = default) => inner.GetOrCreateSessionAsync(agent, Partition(key), cancellationToken);
    /// <inheritdoc />
    public override ValueTask SaveSessionAsync(AIAgent agent, AgentSessionStoreKey key, AgentSession session, CancellationToken cancellationToken = default) => inner.SaveSessionAsync(agent, Partition(key), session, cancellationToken);
    /// <inheritdoc />
    public override ValueTask DeleteSessionAsync(AIAgent agent, AgentSessionStoreKey key, CancellationToken cancellationToken = default) => inner.DeleteSessionAsync(agent, Partition(key), cancellationToken);
}
