using System.Data.Common;
using AGUI.Abstractions;
using Hashbrown.Conformance.Integration;

namespace Hashbrown.Conformance.Testing;

/// <summary>Fixture-only failure injection and deterministic post-commit barrier, outside production integration source.</summary>
public sealed class FixtureInterruptStore(IInterruptStore inner, FixtureTools tools) : IInterruptStore
{
    /// <summary>Simulates an unreachable authoritative store without affecting fixture administration.</summary>
    public bool Unavailable { get; set; }
    private void Check() { if (Unavailable) throw new FixtureDatabaseException(); }
    /// <inheritdoc />
    public ValueTask<PendingInterrupt> CreateAsync(string scope, RunAgentInput input, WorkflowCheckpoint checkpoint, CancellationToken cancellationToken = default)
    { Check(); return inner.CreateAsync(scope, input, checkpoint, cancellationToken); }
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
    private sealed class FixtureDatabaseException : DbException;
}
