namespace Hashbrown.Conformance.Testing;

/// <summary>Test-only deterministic native barrier; no database transaction spans this wait.</summary>
public sealed class FixtureNativeGate(string selected)
{
    private readonly TaskCompletionSource _release = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private int _renewalFailed;
    private int _cleanupCompleted;
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, int> _counts = new(StringComparer.Ordinal);
    /// <summary>Actual journal and passive native-stage observations in this worker.</summary>
    public IReadOnlyDictionary<string, int> Counts => new Dictionary<string, int>(_counts);
    /// <summary>Counts a reached real operation independently of its success.</summary>
    public void Record(string operation) => _counts.AddOrUpdate(operation, 1, (_, count) => count + 1);
    /// <summary>Counts an immutable native observation by stage without retaining raw data.</summary>
    public void Observe(string observation)
    {
        using var value = System.Text.Json.JsonDocument.Parse(observation);
        Record(value.RootElement.GetProperty("stage").GetString()!);
    }
    private string _stage = "pending";
    /// <summary>Last observed selected native boundary.</summary>
    public string Stage => Volatile.Read(ref _stage);
    /// <summary>Count of forwarded renewals that returned false or threw.</summary>
    public int RenewalFailed => Volatile.Read(ref _renewalFailed);
    /// <summary>Count of completed real failure-cleanup operations.</summary>
    public int CleanupCompleted => Volatile.Read(ref _cleanupCompleted);
    /// <summary>Records a real failed renewal without changing its outcome.</summary>
    public void RecordRenewalFailure() => Interlocked.Increment(ref _renewalFailed);
    /// <summary>Records a completed forwarded cleanup operation.</summary>
    public void RecordCleanup() => Interlocked.Increment(ref _cleanupCompleted);
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
