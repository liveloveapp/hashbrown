namespace Hashbrown.Conformance.Testing;

/// <summary>Test-only deterministic native barrier; no database transaction spans this wait.</summary>
public sealed class FixtureNativeGate(string selected)
{
    private readonly TaskCompletionSource _release = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private string _stage = "pending";
    /// <summary>Last observed selected native boundary.</summary>
    public string Stage => Volatile.Read(ref _stage);
    /// <summary>Releases this worker's selected boundary.</summary>
    public void Release() => _release.TrySetResult();
    /// <summary>Records the boundary before asynchronously waiting for fixture release or cancellation.</summary>
    public async ValueTask ReachAsync(string stage, CancellationToken cancellationToken)
    {
        if (selected != stage) return;
        Volatile.Write(ref _stage, stage);
        await _release.Task.WaitAsync(cancellationToken);
    }
}
