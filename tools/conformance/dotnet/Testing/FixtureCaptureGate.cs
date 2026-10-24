namespace Hashbrown.Conformance.Testing;

/// <summary>Independent response-capture barriers; never shares the workflow preparation/dispatch latch.</summary>
public sealed class FixtureCaptureGate(string stage)
{
    private readonly TaskCompletionSource _release = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private int _entered;
    /// <summary>Observed capture stage, separate from workflow stage.</summary>
    public string Stage { get; private set; } = "idle";
    /// <summary>Releases only this response-capture barrier.</summary>
    public void Release() => _release.TrySetResult();
    /// <summary>Pauses a selected first observation until an explicit test release.</summary>
    public async ValueTask WaitAsync(string candidate)
    {
        if (candidate != stage || Interlocked.Exchange(ref _entered, 1) != 0) return;
        Stage = candidate;
        await _release.Task;
    }
}
