using System.Text;
using System.Text.Json;
using Microsoft.Extensions.AI;

namespace Hashbrown.Conformance.Testing;

/// <summary>Authenticated identities captured from the real native request context.</summary>
public sealed record FixtureLiveRecoveryScope(string Scope, string ThreadId, string RunId);

/// <summary>Bounded, memory-only passive witnesses independent of worker-local warm approval state.</summary>
public sealed class FixtureLiveRecoveryEvidence : IDisposable
{
    private readonly object _sync = new();
    private readonly Func<FixtureLiveRecoveryScope> _context;
    private readonly CancellationTokenSource _deadline;
    private readonly List<Call> _calls = [];
    private readonly List<JsonElement> _stages = [];
    private int _bytes;
    private bool _faulted;
    private int _refusedAcquisitions;
    private readonly string _workerId = Guid.NewGuid().ToString("N");
    private sealed class Call(FixtureLiveRecoveryScope scope, JsonElement history)
    {
        internal readonly FixtureLiveRecoveryScope Scope = scope;
        internal readonly JsonElement History = history;
        internal readonly List<JsonElement> Outputs = [];
        internal int Usage;
        internal long Input, Output;
        internal bool Invalid, Completed, Disposed;
        internal string Terminal = "acquiring";
        internal JsonElement? Wire;
    }

    /// <summary>Creates a fixed one-call original or two-call replacement reservation under the parent's remaining deadline.</summary>
    public FixtureLiveRecoveryEvidence(string phase, TimeSpan remaining, Func<FixtureLiveRecoveryScope> context, bool deterministicControl = false)
    {
        if (phase is not ("original" or "replacement" or "preflight") || remaining <= TimeSpan.Zero || remaining > TimeSpan.FromSeconds(60))
            throw new InvalidOperationException("RECOVERY_CONFIGURATION_INVALID");
        DeterministicControl = deterministicControl;
        Phase = phase;
        MaxCalls = phase == "replacement" ? 2 : 1;
        _context = context;
        _deadline = new(remaining);
    }
    /// <summary>The reviewed worker role, never inferred from a reset warm call counter.</summary>
    public string Phase { get; }
    /// <summary>Explicit deterministic control label; never eligible for live provider qualification.</summary>
    public bool DeterministicControl { get; }
    /// <summary>Fixed per-worker native acquisition allowance.</summary>
    public int MaxCalls { get; }
    /// <summary>The parent-linked remaining native deadline.</summary>
    public CancellationToken Token => _deadline.Token;

    /// <summary>Counts before entering the native client or credential acquisition and captures actual input.</summary>
    public int Begin(ChatMessage[] history)
    {
        lock (_sync)
        {
            Token.ThrowIfCancellationRequested();
            if (_calls.Count >= MaxCalls) { _refusedAcquisitions++; _faulted = true; throw new InvalidOperationException("RECOVERY_WORKER_CALL_CAP"); }
            var scope = _context();
            if (string.IsNullOrWhiteSpace(scope.Scope) || string.IsNullOrWhiteSpace(scope.ThreadId) || string.IsNullOrWhiteSpace(scope.RunId))
                throw new InvalidOperationException("RECOVERY_CONTEXT_INVALID");
            var snapshot = History(history);
            Bound(snapshot);
            _calls.Add(new(scope, snapshot));
            return _calls.Count - 1;
        }
    }

    /// <summary>Snapshots only supported plain native data without modifying the genuine update.</summary>
    public void Update(int index, ChatResponseUpdate update)
    {
        lock (_sync)
        {
            try
            {
                var call = _calls[index];
                foreach (var usage in update.Contents.OfType<UsageContent>())
                {
                    call.Usage++;
                    var input = usage.Details.InputTokenCount;
                    var output = usage.Details.OutputTokenCount;
                    if (call.Usage != 1 || input is null or < 0 or > 9007199254740991L || output is null or < 0 or > 384 ||
                        usage.Details.TotalTokenCount is { } total && total != input + output) call.Invalid = true;
                    else { call.Input = input.Value; call.Output = output.Value; }
                }
                var value = JsonSerializer.SerializeToElement(new { text = update.Text, calls = update.Contents.OfType<FunctionCallContent>().Select(CaptureCall).ToArray() });
                if (update.Contents.Any(content => content is not (TextContent or FunctionCallContent or UsageContent))) call.Invalid = true;
                Bound(value);
                call.Outputs.Add(value);
            }
            catch { _faulted = true; }
        }
    }

    /// <summary>Marks real enumeration and disposal independently; incomplete work never receives valid usage credit.</summary>
    public void Finish(int index, bool completed, bool disposed, bool cancelled)
    {
        lock (_sync)
        {
            var call = _calls[index];
            call.Completed = completed;
            call.Disposed = disposed;
            call.Terminal = cancelled ? "cancelled" : completed ? "completed" : "failed";
            if (!completed || !disposed || call.Invalid || call.Usage != 1) _faulted = true;
        }
    }

    /// <summary>Captures a real HTTPS dispatch's validated native input in bounded memory without headers or credentials.</summary>
    public int WireStarted(string method, string path, string authentication, int tokens, JsonElement nativeInput)
    {
        lock (_sync)
        {
            Token.ThrowIfCancellationRequested();
            var index = _calls.Count - 1;
            if (index < 0 || _calls[index].Wire is not null) throw new InvalidOperationException("RECOVERY_WIRE_INVALID");
            var value = JsonSerializer.SerializeToElement(new { method, path, authentication, maxOutputTokens = tokens, store = false, status = 0, input = nativeInput });
            Bound(value);
            _calls[index].Wire = value;
            return index;
        }
    }

    /// <summary>Records the actual response status without retaining headers or privileged bodies.</summary>
    public void WireFinished(int index, int status)
    {
        lock (_sync)
        {
            var wire = _calls[index].Wire!.Value;
            var value = wire.EnumerateObject().ToDictionary(property => property.Name, property => (object)property.Value.Clone());
            value["status"] = status;
            _calls[index].Wire = JsonSerializer.SerializeToElement(value);
        }
    }

    /// <summary>Receives genuine immutable native stage diagnostics and never changes native behavior on observation failure.</summary>
    public void Observe(string observation)
    {
        try
        {
            using var parsed = JsonDocument.Parse(observation);
            var stage = parsed.RootElement.GetProperty("stage").GetString()!;
            var scope = _context();
            if (stage is "Original.Raw.Before" or "Original.Typed.Before")
            {
                using var input = JsonDocument.Parse(parsed.RootElement.GetProperty("value").GetString()!);
                scope = scope with { ThreadId = input.RootElement.GetProperty("threadId").GetString()!, RunId = input.RootElement.GetProperty("runId").GetString()! };
            }
            var record = JsonSerializer.SerializeToElement(new { scope = scope.Scope, threadId = scope.ThreadId, runId = scope.RunId, stage });
            lock (_sync) { Bound(record); _stages.Add(record); }
        }
        catch { lock (_sync) _faulted = true; }
    }

    /// <summary>Maps authenticated read-only evidence. No caller can submit or clear observations.</summary>
    public void Map(WebApplication app)
    {
        app.MapGet("/__test/live-recovery-evidence", (HttpContext context, string threadId) =>
        {
            var scope = context.User.FindFirst("scope")?.Value;
            if (scope is null) return Results.Unauthorized();
            if (threadId.Length is 0 or > 1024) return Results.BadRequest();
            return Results.Json(Snapshot(scope, threadId));
        }).RequireAuthorization("recovery");
    }

    /// <summary>Returns independent copies for one authenticated scope and thread, excluding all provider credentials.</summary>
    public object Snapshot(string scope, string threadId)
    {
        lock (_sync)
            return new
            {
                workerId = _workerId,
                pid = Environment.ProcessId,
                phase = Phase,
                kind = DeterministicControl ? "deterministic-control" : "genuine-provider",
                healthy = !_faulted,
                refusedAcquisitions = _refusedAcquisitions,
                calls = _calls.Where(call => call.Scope.Scope == scope && call.Scope.ThreadId == threadId).Select(call => new
                {
                    runId = call.Scope.RunId,
                    history = call.History.Clone(),
                    outputs = call.Outputs.Select(value => value.Clone()).ToArray(),
                    usageCount = call.Usage,
                    inputTokens = call.Input,
                    outputTokens = call.Output,
                    completed = call.Completed,
                    disposed = call.Disposed,
                    terminal = call.Terminal,
                    validUsage = !call.Invalid && call.Usage == 1,
                    wire = call.Wire?.Clone()
                }).ToArray(),
                stages = _stages.Where(value => value.GetProperty("scope").GetString() == scope && value.GetProperty("threadId").GetString() == threadId).Select(value => value.Clone()).ToArray()
            };
    }

    /// <summary>Copies supported native history without rebuilding the actual messages passed to the provider.</summary>
    public static JsonElement History(ChatMessage[] messages) => JsonSerializer.SerializeToElement(messages.Select(message => new
    {
        role = message.Role.Value,
        text = message.Text,
        calls = message.Contents.OfType<FunctionCallContent>().Select(CaptureCall).ToArray(),
        results = message.Contents.OfType<FunctionResultContent>().Select(result => new { id = result.CallId, result = Plain(result.Result) }).ToArray(),
        unsupported = message.Contents.Count(content => content is not (TextContent or FunctionCallContent or FunctionResultContent))
    }).ToArray());

    private static object CaptureCall(FunctionCallContent call) => new { id = call.CallId, name = call.Name, arguments = Plain(call.Arguments) };
    private static JsonElement Plain(object? value)
    {
        object? Copy(object? current, int depth)
        {
            if (depth > 32) throw new InvalidOperationException("RECOVERY_NATIVE_CONTENT_INVALID");
            if (current is null or bool or string or byte or sbyte or short or ushort or int or uint or long or ulong or decimal) return current;
            if (current is float f && float.IsFinite(f)) return f;
            if (current is double d && double.IsFinite(d)) return d;
            if (current is JsonElement element && element.ValueKind != JsonValueKind.Undefined) return element.Clone();
            if (current is IDictionary<string, object?> dictionary) return dictionary.ToDictionary(pair => pair.Key, pair => Copy(pair.Value, depth + 1));
            if (current is IReadOnlyDictionary<string, object?> readOnly) return readOnly.ToDictionary(pair => pair.Key, pair => Copy(pair.Value, depth + 1));
            if (current is IEnumerable<object?> array) return array.Select(item => Copy(item, depth + 1)).ToArray();
            throw new InvalidOperationException("RECOVERY_NATIVE_CONTENT_INVALID");
        }
        if (value is string text && (text.StartsWith('{') || text.StartsWith('[')))
        {
            using var parsed = JsonDocument.Parse(text);
            return parsed.RootElement.Clone();
        }
        return JsonSerializer.SerializeToElement(Copy(value, 0));
    }
    private void Bound(JsonElement value)
    {
        var bytes = Encoding.UTF8.GetByteCount(value.GetRawText());
        if (bytes > 1024 * 1024 || _bytes > 8 * 1024 * 1024 - bytes || _stages.Count > 4096) { _faulted = true; throw new InvalidOperationException("RECOVERY_EVIDENCE_LIMIT"); }
        _bytes += bytes;
    }
    /// <inheritdoc />
    public void Dispose() => _deadline.Dispose();
}
