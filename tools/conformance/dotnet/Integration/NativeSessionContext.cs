#pragma warning disable MAAI001 // Pinned MAF 1.26.0 public native-session boundary is experimental.
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using AGUI.Abstractions;
using Microsoft.Agents.AI;

namespace Hashbrown.Conformance.Integration;

/// <summary>Request-local native capability. Only the authenticated composition can create or admit one.</summary>
internal sealed class NativeSessionContext : IAsyncDisposable
{
    /// <summary>Maximum pre-work grace period for a current publisher to finish its reserved write.</summary>
    private static readonly TimeSpan PublicationAdmissionWait = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan PublicationAdmissionPoll = TimeSpan.FromMilliseconds(25);
    private readonly CancellationTokenSource _work;
    private readonly CancellationTokenSource _heartbeatStop = new();
    private readonly ConcurrentDictionary<string, NativeToolCall> _pending = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, NativeToolCall> _witnesses = new(StringComparer.Ordinal);
    private Task? _heartbeat;
    private AgentSession? _session;
    private bool _closed;
    private bool _disposed;
    private bool? _cleanupResult;
    internal NativeSessionContext(NativeSessionRegistration registration, HttpContext http, RunAgentInput input, string scope, string isolation)
    {
        Registration = registration; Http = http; Input = input; Scope = scope; Isolation = isolation;
        PublicRequest = JsonSerializer.Serialize(input, AGUIJsonSerializerContext.Default.RunAgentInput);
        _work = CancellationTokenSource.CreateLinkedTokenSource(http.RequestAborted);
    }
    internal NativeSessionRegistration Registration { get; }
    internal HttpContext Http { get; }
    internal RunAgentInput Input { get; }
    internal string Scope { get; }
    internal string Isolation { get; }
    internal string PublicRequest { get; }
    internal NativeSessionAdmission? Admission { get; private set; }
    internal NativeSessionLease Lease => Admission?.Lease ?? throw new NativeSessionRequestException(409);
    internal NativeSavedReceipt? Receipt { get; set; }
    internal NativeSessionProjection? Projection { get; set; }
    internal CancellationToken Cancellation => _work.Token;
    internal bool Bound => !_closed && _session is not null && !_work.IsCancellationRequested;
    internal static NativeSessionContext? Get(HttpContext? context) => context?.Items[typeof(NativeSessionContext)] as NativeSessionContext;
    internal async ValueTask AdmitAsync(AIAgent agent, AgentSessionStoreKey key, CancellationToken cancellationToken)
    {
        if (_closed || Admission is not null || agent.Name != Registration.AgentName || key.SessionId != Input.ThreadId ||
            key.Partitions is null || !key.Partitions.TryGetValue("isolation", out var isolation) || isolation != Isolation) throw new NativeSessionRequestException(409);
        var ownedKey = new NativeSessionKey(Registration.AgentName, Scope, key.SessionId, key.Partitions);
        Admission = await AcquireAsync(ownedKey, cancellationToken);
        if (Admission.Status != 200 || Admission.Lease is null) throw new NativeSessionRequestException(Admission.Status);
        foreach (var call in Admission.Snapshot?.PendingCalls ?? []) { _pending[call.Id] = call; _witnesses[call.Id] = call; }
        _heartbeat = HeartbeatAsync();
    }
    /// <summary>Resolves finalization races with authoritative retries, waiting briefly only on a live Publishing observation.</summary>
    private async ValueTask<NativeSessionAdmission> AcquireAsync(NativeSessionKey key, CancellationToken cancellationToken)
    {
        var admission = await Registration.Journal.TryAcquireAsync(key, PublicRequest, cancellationToken);
        if (admission.Status != 409) return admission;
        var started = Stopwatch.GetTimestamp();
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, Cancellation);
        budget.CancelAfter(PublicationAdmissionWait);
        try
        {
            while (admission.Status == 409)
            {
                if (Stopwatch.GetElapsedTime(started) >= PublicationAdmissionWait) return admission;
                var status = await Registration.Journal.ReadStatusAsync(key, budget.Token);
                if (status.Status != 200) return new NativeSessionAdmission(status.Status);
                if (status.State == "Ready") return await Registration.Journal.TryAcquireAsync(key, PublicRequest, budget.Token);
                // Expiry can only refuse this wait. Actual ownership always comes from the journal's database-clock acquisition.
                if (status.State != "Publishing" || status.LeaseUntil is null || status.LeaseUntil <= DateTimeOffset.UtcNow) return admission;
                var remaining = PublicationAdmissionWait - Stopwatch.GetElapsedTime(started);
                if (remaining <= TimeSpan.Zero) return admission;
                await Task.Delay(remaining < PublicationAdmissionPoll ? remaining : PublicationAdmissionPoll, budget.Token);
                admission = await Registration.Journal.TryAcquireAsync(key, PublicRequest, budget.Token);
            }
            return admission;
        }
        catch (OperationCanceledException) when (budget.IsCancellationRequested && !cancellationToken.IsCancellationRequested && !Cancellation.IsCancellationRequested)
        { return admission; }
    }
    internal void Bind(AgentSession session)
    {
        Cancellation.ThrowIfCancellationRequested();
        if (_closed || Admission?.Lease is null || _session is not null) throw new NativeSessionRequestException(409);
        _session = session;
    }
    internal void Require(AIAgent agent, AgentSessionStoreKey key, AgentSession session)
    {
        RequireSession(session);
        if (agent.Name != Registration.AgentName || new NativeSessionKey(Registration.AgentName, Scope, key.SessionId, key.Partitions ?? throw new NativeSessionRequestException(409)).Id != Lease.Key.Id) throw new NativeSessionRequestException(409);
    }
    internal void RequireSession(AgentSession? session)
    {
        Cancellation.ThrowIfCancellationRequested();
        if (!Bound || !ReferenceEquals(session, _session)) throw new NativeSessionRequestException(409);
    }
    internal async ValueTask CaptureAsync(Microsoft.Extensions.AI.FunctionCallContent content, CancellationToken cancellationToken)
    {
        try
        {
            if (!Bound) throw new NativeSessionRequestException(409);
            var call = Registration.Catalog.CreateCall(content.CallId, content.Name, JsonSerializer.SerializeToElement(content.Arguments ?? new Dictionary<string, object?>()));
            if (!await Registration.Journal.CaptureModelCallAsync(Lease, call, cancellationToken)) throw new NativeSessionRequestException(409);
            if (!_pending.TryAdd(call.Id, call)) throw new NativeSessionRequestException(409);
            _witnesses[call.Id] = call;
        }
        catch { await CancelWorkAsync(); throw; }
    }
    internal async ValueTask<NativeToolCall> StartAsync(string callId, string name, JsonElement arguments, AgentSession? session, CancellationToken cancellationToken)
    {
        RequireSession(session);
        var call = await Registration.Journal.GetOwnedCallAsync(Lease, callId, cancellationToken);
        if (call is null || name != call.Name || !Registration.Catalog.Matches(call) || !System.Text.Json.Nodes.JsonNode.DeepEquals(System.Text.Json.Nodes.JsonNode.Parse(call.Arguments.GetRawText()), System.Text.Json.Nodes.JsonNode.Parse(arguments.GetRawText())) ||
            !await Registration.Journal.TryStartDispatchAsync(Lease, call, cancellationToken)) throw new NativeSessionRequestException(409);
        Cancellation.ThrowIfCancellationRequested();
        return call;
    }
    internal async ValueTask CompleteAsync(NativeToolCall call, CancellationToken cancellationToken)
    {
        if (!await Registration.Journal.CompleteDispatchAsync(Lease, call, cancellationToken)) throw new NativeSessionRequestException(409);
        _pending.TryRemove(call.Id, out _);
    }
    internal async ValueTask CancelWorkAsync()
    {
        try { await _work.CancelAsync(); }
        catch (Exception exception) { Http.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("NativeSessionCancellation").LogWarning(exception, "Native work cancellation callback failed; authority remains fenced."); }
    }
    internal IReadOnlyList<NativeToolCall> PendingCalls() => _pending.Values.OrderBy(call => call.Id, StringComparer.Ordinal).ToArray();
    internal bool MatchesOwnedCall(string? id, string? name, System.Text.Json.Nodes.JsonNode? arguments) =>
        id is not null && _witnesses.TryGetValue(id, out var call) && call.Name == name && Registration.Catalog.Matches(call) &&
        System.Text.Json.Nodes.JsonNode.DeepEquals(System.Text.Json.Nodes.JsonNode.Parse(call.Arguments.GetRawText()), arguments);
    private async Task HeartbeatAsync()
    {
        try
        {
            using var timer = new PeriodicTimer(TimeSpan.FromTicks(Math.Max(TimeSpan.FromMilliseconds(10).Ticks, Registration.Options.Lease.Ticks / 3)));
            while (await timer.WaitForNextTickAsync(_heartbeatStop.Token))
                if (!await Registration.Journal.RenewAsync(Lease, _heartbeatStop.Token)) { await CancelWorkAsync(); return; }
        }
        catch (OperationCanceledException) when (_heartbeatStop.IsCancellationRequested) { }
        catch (Exception exception)
        {
            Http.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("NativeSessionLease").LogWarning(exception, "Native session renewal failed; request authority is cancelled.");
            await CancelWorkAsync();
        }
    }
    internal async ValueTask<bool> CleanupAsync()
    {
        if (_cleanupResult is { } completed) return completed;
        _closed = true;
        await _heartbeatStop.CancelAsync();
        if (_heartbeat is not null) await _heartbeat;
        if (Admission?.Lease is null) return (_cleanupResult = true).Value;
        using var budget = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        try { return (_cleanupResult = await Registration.Journal.FailureCleanupAsync(Lease, budget.Token)).Value; }
        catch (Exception exception)
        {
            Http.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("NativeSessionCleanup").LogWarning(exception, "Native session cleanup failed; durable fences remain retained.");
            return (_cleanupResult = false).Value;
        }
    }
    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;
        try { await CleanupAsync(); }
        finally { _heartbeatStop.Dispose(); _work.Dispose(); }
    }
}

/// <summary>Server-owned immutable configuration shared by one named native composition.</summary>
internal sealed record NativeSessionRegistration(string AgentName, INativeSessionJournal Journal, NativeToolCatalog Catalog, Func<HttpContext, string?> Scope, NativeSessionOptions Options);
/// <summary>Bounded pre-work native admission failure; never includes private session data.</summary>
internal sealed class NativeSessionRequestException(int status) : InvalidOperationException("Native session admission or ownership is unavailable.")
{
    internal int Status { get; } = status;
}
