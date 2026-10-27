using Microsoft.Extensions.AI;

namespace Hashbrown.Conformance.Testing;

/// <summary>Owns one fixed live scenario's native dispatch ceiling, deadline, and one-shot text gate.</summary>
public sealed class FixtureLiveGate : IDisposable
{
    private readonly object _sync = new();
    private readonly CancellationTokenSource _deadline;
    private readonly TaskCompletionSource _release = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly List<FixtureLiveWireFact> _wire = [];
    private int _calls;
    private int _cancelledCalls;
    private bool _entered;
    private bool _nativeCoEmission;
    private bool _nativeExactHistory;
    private long _inputTokens;
    private long _outputTokens;
    private string _stage = "ready";
    /// <summary>Creates the immutable ceiling from the reviewed fixed scenario manifest.</summary>
    public FixtureLiveGate(string group, TimeSpan? timeout = null)
    {
        Group = group;
        MaxCalls = group switch
        {
            "streaming-plain" or "structured-schema" or "preflight" => 1,
            "trusted-ui-action" or "browser-tool" or "server-tool" or "mixed-native-tools" => 2,
            "approval-resume-decline" or "cancellation-recovery" => 3,
            _ => throw new InvalidOperationException("LIVE_GROUP_INVALID")
        };
        var duration = timeout ?? TimeSpan.FromSeconds(60);
        if (duration <= TimeSpan.Zero || duration > TimeSpan.FromSeconds(60)) throw new InvalidOperationException("LIVE_DEADLINE_INVALID");
        _deadline = new CancellationTokenSource(duration);
    }
    /// <summary>The trusted fixed scenario identifier.</summary>
    public string Group { get; }
    /// <summary>The scenario's independent immutable native call limit.</summary>
    public int MaxCalls { get; }
    /// <summary>Cancellation linked into credential acquisition, HTTP, and enumeration.</summary>
    public CancellationToken Token => _deadline.Token;
    /// <summary>Every attempted native invocation, including failed acquisition.</summary>
    public int Calls { get { lock (_sync) return _calls; } }
    /// <summary>Actual native HTTP dispatches after wire validation.</summary>
    public int HttpCalls { get { lock (_sync) return _wire.Count; } }
    /// <summary>Iterators unwound under actual request cancellation.</summary>
    public int CancelledCalls { get { lock (_sync) return _cancelledCalls; } }
    /// <summary>Only an allowlisted lifecycle stage.</summary>
    public string Stage { get { lock (_sync) return _stage; } }
    /// <summary>Counts before entering the native client or acquiring credentials.</summary>
    public void Dispatch()
    {
        lock (_sync)
        {
            if (Token.IsCancellationRequested) throw new InvalidOperationException("LIVE_CANCELLED");
            if (_calls >= MaxCalls) throw new InvalidOperationException("LIVE_CALL_CAP");
            _calls++;
            _stage = "acquiring";
        }
    }
    /// <summary>Checks the deadline at the last boundary before HTTPS dispatch.</summary>
    public int WireStarted(string method, string path, string authentication, int maxOutputTokens, bool store)
    {
        lock (_sync)
        {
            if (Token.IsCancellationRequested) throw new InvalidOperationException("LIVE_CANCELLED");
            if (_wire.Count >= MaxCalls) throw new InvalidOperationException("LIVE_CALL_CAP");
            _wire.Add(new(method, path, authentication, maxOutputTokens, store, 0));
            return _wire.Count - 1;
        }
    }
    /// <summary>Records only an HTTP status number.</summary>
    public void WireFinished(int index, int status) { lock (_sync) _wire[index] = _wire[index] with { Status = status }; }
    /// <summary>Records validated genuine native co-emission, without retaining model arguments.</summary>
    public void NativeCoEmission() { lock (_sync) _nativeCoEmission = true; }
    /// <summary>Records an exact owned call/result match in the next actual native model invocation.</summary>
    public void NativeExactHistory() { lock (_sync) _nativeExactHistory = true; }
    /// <summary>Records numeric usage without retaining native update contents.</summary>
    public void Observe(ChatResponseUpdate update)
    {
        lock (_sync)
        {
            _stage = "streaming";
            foreach (var usage in update.Contents.OfType<UsageContent>())
            {
                _inputTokens += Math.Max(0, usage.Details.InputTokenCount ?? 0);
                _outputTokens += Math.Max(0, usage.Details.OutputTokenCount ?? 0);
            }
        }
    }
    /// <summary>Pauses after the actual first text update has already reached the caller.</summary>
    public async Task AfterYieldAsync(ChatResponseUpdate update, CancellationToken cancellationToken)
    {
        lock (_sync)
        {
            if (_entered || Group is not ("streaming-plain" or "cancellation-recovery") || string.IsNullOrEmpty(update.Text)) return;
            _entered = true;
            _stage = "paused";
        }
        await _release.Task.WaitAsync(cancellationToken);
    }
    /// <summary>Releases the one-shot real text gate.</summary>
    public void Release() => _release.TrySetResult();
    /// <summary>Records terminal enumeration without any model or exception text.</summary>
    public void Finished(bool cancelled, bool failed)
    {
        lock (_sync)
        {
            if (cancelled) _cancelledCalls++;
            _stage = cancelled ? "cancelled" : failed ? "failed" : "completed";
        }
    }
    /// <summary>Projects only approved numeric and fixed-enum statistics.</summary>
    public object Snapshot()
    {
        lock (_sync) return new { calls = _calls, httpCalls = _wire.Count, cancelledCalls = _cancelledCalls, stage = _stage, wire = _wire.ToArray(), inputTokens = _inputTokens, outputTokens = _outputTokens, nativeCoEmission = _nativeCoEmission, nativeExactHistory = _nativeExactHistory };
    }
    /// <summary>Cancels and releases owned scenario work.</summary>
    public void Dispose() { _deadline.Cancel(); _release.TrySetResult(); _deadline.Dispose(); }
}

/// <summary>Safe native wire metadata; headers, bodies, and exception text are deliberately absent.</summary>
public sealed record FixtureLiveWireFact(string Method, string Path, string Authentication, int MaxOutputTokens, bool Store, int Status);
