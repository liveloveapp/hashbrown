using System.Data.Common;
using AGUI.Abstractions;
using Hashbrown.Conformance.Integration;

namespace Hashbrown.Conformance.Testing;

/// <summary>Fixture-only failure injection and deterministic post-commit barrier, outside production integration source.</summary>
public sealed class FixtureInterruptStore(IInterruptStore inner, FixtureTools tools, FixtureCaptureGate captureGate) : IInterruptStore
{
    /// <summary>Simulates an unreachable authoritative store without affecting fixture administration.</summary>
    public bool Unavailable { get; set; }
    private void Check() { if (Unavailable) throw new FixtureDatabaseException(); }
    /// <inheritdoc />
    public ValueTask<PendingInterrupt> CreateAsync(string scope, RunAgentInput input, WorkflowCheckpoint checkpoint, CancellationToken cancellationToken = default)
    { Check(); return inner.CreateAsync(scope, input, checkpoint, cancellationToken); }
    /// <inheritdoc />
    public ValueTask<CheckpointRecoveryResult> RecoverAsync(string scope, string threadId, ConversationRecoveryConfiguration configuration, CancellationToken cancellationToken = default)
    { Check(); return inner.RecoverAsync(scope, threadId, configuration, cancellationToken); }
    /// <inheritdoc />
    public ValueTask<InterruptClaimResult> TryClaimAsync(string scope, RunAgentInput input, CancellationToken cancellationToken = default)
    { Check(); return inner.TryClaimAsync(scope, input, cancellationToken); }
    /// <inheritdoc />
    public async ValueTask<bool> TryStartEffectAsync(InterruptClaim claim, CancellationToken cancellationToken = default)
    {
        Check();
        var started = await inner.TryStartEffectAsync(claim, cancellationToken);
        if (started) await tools.AfterMarkerAsync(cancellationToken);
        return started;
    }
    /// <inheritdoc />
    public ValueTask FinishAsync(InterruptClaim claim, InterruptFinish finish, CancellationToken cancellationToken = default)
    { Check(); return inner.FinishAsync(claim, finish, cancellationToken); }
    /// <inheritdoc />
    public async ValueTask<CheckpointCaptureHandle?> StartCaptureAsync(InterruptClaim claim, CancellationToken cancellationToken = default)
    { Check(); await captureGate.WaitAsync("start"); return await inner.StartCaptureAsync(claim, cancellationToken); }
    /// <inheritdoc />
    public async ValueTask<bool> CompleteCaptureAsync(CheckpointCaptureHandle handle, string outcome, string? snapshot, CancellationToken cancellationToken = default)
    { Check(); await captureGate.WaitAsync(outcome == "Finished" ? "terminal" : outcome == "Failed" ? "failure" : "finally"); return await inner.CompleteCaptureAsync(handle, outcome, snapshot, cancellationToken); }
    /// <inheritdoc />
    public ValueTask<CheckpointPage> ListAsync(IReadOnlySet<string> scopes, int limit = 50, string? cursor = null, string? state = null, CancellationToken cancellationToken = default)
    { Check(); return inner.ListAsync(scopes, limit, cursor, state, cancellationToken); }
    /// <inheritdoc />
    public ValueTask<CheckpointInspection?> InspectAsync(IReadOnlySet<string> scopes, string batchId, int limit = 50, string? cursor = null, CancellationToken cancellationToken = default)
    { Check(); return inner.InspectAsync(scopes, batchId, limit, cursor, cancellationToken); }
    /// <inheritdoc />
    public ValueTask<int> ReconcileAsync(IReadOnlySet<string> scopes, string batchId, string actor, CheckpointReconciliation request, CancellationToken cancellationToken = default)
    { Check(); return inner.ReconcileAsync(scopes, batchId, actor, request, cancellationToken); }
    private sealed class FixtureDatabaseException : DbException;
}
