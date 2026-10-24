using System.Security.Cryptography;
using System.Text.Json;
using AGUI.Abstractions;

namespace Hashbrown.Conformance.Integration;

/// <summary>A server-selected operation. Both preparation and effect parameters stay server-owned.</summary>
public sealed record WorkflowCheckpoint(string Name, Func<CancellationToken, ValueTask> Prepare,
    Func<CancellationToken, ValueTask> Execute);

/// <summary>Immutable process-local confirmation checkpoint, owned by the server.</summary>
public sealed record PendingInterrupt(string Scope, string ThreadId, string RunId,
    string[] Ids, DateTimeOffset ExpiresAt, byte[] RequestFingerprint, WorkflowCheckpoint Checkpoint,
    string? ActiveRun = null, bool EffectStarted = false, bool Consumed = false);

/// <summary>Bounded, expiring confirmation batches with atomic execution claims and retained tombstones.</summary>
public sealed class PendingInterruptStore(TimeProvider clock, int capacity = 128)
{
    private readonly object _gate = new();
    private readonly Dictionary<string, PendingInterrupt> _pending = new(StringComparer.Ordinal);

    /// <summary>Creates a server-owned batch before its interrupt is emitted.</summary>
    public PendingInterrupt Create(string scope, RunAgentInput input, WorkflowCheckpoint checkpoint)
    {
        lock (_gate)
        {
            foreach (var key in _pending.Where(pair => pair.Value.ActiveRun is null && pair.Value.ExpiresAt <= clock.GetUtcNow()).Select(pair => pair.Key).ToArray())
                _pending.Remove(key);
            var existing = _pending.Values.FirstOrDefault(batch => batch.Scope == scope &&
                batch.ThreadId == input.ThreadId && !batch.Consumed);
            if (existing is not null) return existing;
            if (_pending.Count >= capacity) throw new InvalidOperationException("Pending confirmation capacity reached.");
            var batch = new PendingInterrupt(scope, input.ThreadId, input.RunId,
                [Guid.NewGuid().ToString("N"), Guid.NewGuid().ToString("N")], clock.GetUtcNow().AddMinutes(10),
                Fingerprint(input), checkpoint);
            _pending.Add(batch.Ids[0], batch);
            return batch;
        }
    }

    /// <summary>Validates the complete batch before atomically claiming its checkpoint for this run.</summary>
    public int TryClaim(string scope, RunAgentInput input)
    {
        lock (_gate)
        {
            var entries = input.Resume;
            if (entries is not { Count: > 0 }) return 400;
            // Search every ID so a reordered batch still resolves to its original tombstone.
            var batch = _pending.Values.FirstOrDefault(candidate => entries.Any(entry =>
                candidate.Ids.Contains(entry.InterruptId, StringComparer.Ordinal)));
            if (batch is null || batch.Scope != scope || batch.ThreadId != input.ThreadId ||
                batch.ExpiresAt <= clock.GetUtcNow()) return 410;
            if (batch.Consumed || batch.ActiveRun is not null) return 409;
            if (!CryptographicOperations.FixedTimeEquals(batch.RequestFingerprint, Fingerprint(input))) return 400;
            if (entries.Count != batch.Ids.Length ||
                entries.Select(entry => entry.InterruptId).Distinct(StringComparer.Ordinal).Count() != entries.Count ||
                entries.Any(entry => !batch.Ids.Contains(entry.InterruptId, StringComparer.Ordinal))) return 400;
            foreach (var entry in entries)
            {
                if (entry.Status == "cancelled")
                {
                    if (entry.Payload is not null) return 400;
                    continue;
                }
                if (entry.Status != "resolved" || entry.Payload is not { ValueKind: JsonValueKind.Object } payload ||
                    payload.EnumerateObject().Count() != 1 || !payload.TryGetProperty("approved", out var approved) ||
                    approved.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return 400;
            }
            _pending[batch.Ids[0]] = batch with { ActiveRun = input.RunId };
            return 200;
        }
    }

    /// <summary>Recovers and runs only the stored operation, marking the effect boundary before execution.</summary>
    public async ValueTask ExecuteCheckpointAsync(string scope, RunAgentInput input, CancellationToken cancellationToken)
    {
        PendingInterrupt batch;
        lock (_gate)
        {
            batch = Claimed(scope, input);
            if (batch.EffectStarted) return;
        }
        await batch.Checkpoint.Prepare(cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            batch = Claimed(scope, input);
            if (batch.EffectStarted) return;
            _pending[batch.Ids[0]] = batch with { EffectStarted = true };
        }
        await batch.Checkpoint.Execute(cancellationToken);
    }

    /// <summary>Releases cancellation before effects; conservatively consumes every other completed or failed claim.</summary>
    public void Finish(string scope, RunAgentInput input, bool cancelled)
    {
        lock (_gate)
        {
            var batch = Claimed(scope, input);
            _pending[batch.Ids[0]] = batch with
            {
                ActiveRun = null,
                Consumed = !cancelled || batch.EffectStarted
            };
        }
    }

    private PendingInterrupt Claimed(string scope, RunAgentInput input) => _pending.Values.Single(batch =>
        batch.Scope == scope && batch.ThreadId == input.ThreadId && batch.ActiveRun == input.RunId &&
        input.Resume!.Any(entry => entry.InterruptId == batch.Ids[0]));

    private static byte[] Fingerprint(RunAgentInput input) => SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(
        new RunAgentInput
        {
            ThreadId = input.ThreadId,
            RunId = string.Empty,
            Messages = input.Messages,
            Tools = input.Tools,
            ForwardedProperties = input.ForwardedProperties
        }, AGUIJsonSerializerContext.Default.RunAgentInput));
}
