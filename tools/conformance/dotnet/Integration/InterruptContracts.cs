using System.Collections.Frozen;
using System.Security.Cryptography;
using System.Text.Json;
using AGUI.Abstractions;

namespace Hashbrown.Conformance.Integration;

/// <summary>An immutable server-selected operation descriptor; parameters are cloned at the ownership boundary.</summary>
public sealed class WorkflowCheckpoint(string name, int version, JsonElement parameters)
{
    /// <summary>Stable registered operation name.</summary>
    public string Name { get; } = name;
    /// <summary>Version whose meaning must be retained across application deployments.</summary>
    public int Version { get; } = version;
    /// <summary>Server-owned JSON arguments, never reconstructed from a resume request.</summary>
    public JsonElement Parameters { get; } = parameters.Clone();
}

/// <summary>A versioned operation with argument validation, side-effect-free preparation, and protected execution.</summary>
public sealed record WorkflowOperation(string Name, int Version, Func<JsonElement, bool> Validate,
    Func<JsonElement, CancellationToken, ValueTask> Prepare,
    Func<JsonElement, string, CancellationToken, ValueTask> Execute);

/// <summary>Immutable server registry. Missing versions and incompatible persisted arguments fail closed.</summary>
public sealed class WorkflowOperationRegistry(IEnumerable<WorkflowOperation> operations)
{
    private readonly FrozenDictionary<(string, int), WorkflowOperation> _operations = operations.ToFrozenDictionary(operation => (operation.Name, operation.Version));

    /// <summary>Resolves and validates only the stored descriptor.</summary>
    public WorkflowOperation Resolve(WorkflowCheckpoint checkpoint)
    {
        if (!_operations.TryGetValue((checkpoint.Name, checkpoint.Version), out var operation) || !operation.Validate(checkpoint.Parameters))
            throw new InvalidOperationException("The persisted workflow operation is unavailable or incompatible.");
        return operation;
    }
}

/// <summary>Independent approval admission, preparation lease, and terminal retention limits.</summary>
public sealed record InterruptStoreOptions
{
    /// <summary>Trusted server compatibility binding; omission preserves explicit unbound legacy rows. Never derive this value from browser input.</summary>
    public string? CompatibilityIdentity { get; init; }
    /// <summary>Maximum retained batches, including terminal tombstones.</summary>
    public int Capacity { get; init; } = 128;
    /// <summary>Deadline for admitting a new approval claim.</summary>
    public TimeSpan ApprovalTtl { get; init; } = TimeSpan.FromMinutes(10);
    /// <summary>Finite permission for pure preparation, independent of approval expiry.</summary>
    public TimeSpan PreparationLease { get; init; } = TimeSpan.FromSeconds(30);
    /// <summary>Retention of known terminal records; unresolved EffectStarted and FailedAfterEffect records require reconciliation. Deletion never makes IDs executable.</summary>
    public TimeSpan TerminalRetention { get; init; } = TimeSpan.FromMinutes(10);

    /// <summary>Maximum owned original request bytes before any interrupt is published.</summary>
    public int OriginalRequestBytes { get; init; } = 256 * 1024;
    /// <summary>Maximum read-only recovery configuration query bytes.</summary>
    public int RecoveryQueryBytes { get; init; } = 256 * 1024;
    /// <summary>Maximum completed canonical transcript bytes.</summary>
    public int TerminalSnapshotBytes { get; init; } = 1024 * 1024;
    /// <summary>Maximum canonical messages in original and final history.</summary>
    public int MaximumMessages { get; init; } = 2048;
    /// <summary>Independent immutable operator audit retention.</summary>
    public TimeSpan AuditRetention { get; init; } = TimeSpan.FromDays(30);
    /// <summary>Private transcript retention, independently bounded from safety metadata.</summary>
    public TimeSpan SnapshotRetention { get; init; } = TimeSpan.FromMinutes(10);
    /// <summary>Maximum rows per category (metadata, transcripts, audits) in one cleanup transaction.</summary>
    public int CleanupBatchSize { get; init; } = 100;

    internal InterruptStoreOptions Checked()
    {
        if (Capacity < 1 || ApprovalTtl <= TimeSpan.Zero || PreparationLease <= TimeSpan.Zero ||
            PreparationLease > TimeSpan.FromDays(1) || TerminalRetention <= TimeSpan.Zero || OriginalRequestBytes < 1 || RecoveryQueryBytes < 1 || TerminalSnapshotBytes < 1 || MaximumMessages < 1 || AuditRetention <= TimeSpan.Zero || SnapshotRetention <= TimeSpan.Zero || CleanupBatchSize < 1 || CleanupBatchSize > 1000)
            throw new ArgumentOutOfRangeException(nameof(InterruptStoreOptions));
        return this;
    }
}

/// <summary>Persisted batch information that is safe to emit as native interrupts.</summary>
public sealed record PendingInterrupt(string Id, IReadOnlyList<string> Ids, DateTimeOffset ExpiresAt,
    WorkflowCheckpoint Checkpoint, string EffectId);

/// <summary>An opaque request-local server claim. Browser run IDs convey no ownership.</summary>
public sealed record InterruptClaim(string BatchId, string Token, long Generation, WorkflowCheckpoint Checkpoint,
    string EffectId, bool Declined = false)
{
    private int _entered;
    internal bool EnterWorkflow() => Interlocked.Exchange(ref _entered, 1) == 0;
}

/// <summary>Pre-stream admission result, preserving native HTTP validation status codes.</summary>
public sealed record InterruptClaimResult(int Status, InterruptClaim? Claim = null);

/// <summary>Outcome supplied to token-fenced, idempotent claim bookkeeping.</summary>
public enum InterruptFinish
{
    /// <summary>The registered executor returned successfully.</summary>
    Completed,
    /// <summary>The request was cancelled; only pre-effect claims can be released.</summary>
    Cancelled,
    /// <summary>Conservatively consume the claim following an error.</summary>
    Failed
}

/// <summary>Asynchronous checkpoint persistence. No transaction may span application, model, or streaming work.</summary>
public interface IInterruptStore
{
    /// <summary>Persists a descriptor before emitting its complete interrupt batch.</summary>
    ValueTask<PendingInterrupt> CreateAsync(string scope, RunAgentInput input, WorkflowCheckpoint checkpoint, CancellationToken cancellationToken = default);
    /// <summary>Reads the latest retained scoped checkpoint without claiming or executing it.</summary>
    ValueTask<CheckpointRecoveryResult> RecoverAsync(string scope, string threadId, ConversationRecoveryConfiguration configuration, CancellationToken cancellationToken = default);
    /// <summary>Validates the complete batch and atomically creates a fresh server token and generation.</summary>
    ValueTask<InterruptClaimResult> TryClaimAsync(string scope, RunAgentInput input, CancellationToken cancellationToken = default);
    /// <summary>Commits the irreversible dispatch marker only for the current, unexpired preparation claim.</summary>
    ValueTask<bool> TryStartEffectAsync(InterruptClaim claim, CancellationToken cancellationToken = default);
    /// <summary>Lists a bounded page solely within authenticated permitted scopes.</summary>
    ValueTask<CheckpointPage> ListAsync(IReadOnlySet<string> scopes, int limit = 50, string? cursor = null, string? state = null, CancellationToken cancellationToken = default);
    /// <summary>Inspects safe metadata and bounded retained audit solely within permitted scopes.</summary>
    ValueTask<CheckpointInspection?> InspectAsync(IReadOnlySet<string> scopes, string batchId, int limit = 50, string? cursor = null, CancellationToken cancellationToken = default);
    /// <summary>Atomically records authenticated evidence and retires claim/capture authority; never dispatches.</summary>
    ValueTask<int> ReconcileAsync(IReadOnlySet<string> scopes, string batchId, string actor, CheckpointReconciliation request, CancellationToken cancellationToken = default);
    /// <summary>Starts response observation only for the current accepted claim.</summary>
    ValueTask<CheckpointCaptureHandle?> StartCaptureAsync(InterruptClaim claim, CancellationToken cancellationToken = default);
    /// <summary>Persists terminal metadata under current claim and capture authority. Cleanup only updates Running outcomes.</summary>
    ValueTask<bool> CompleteCaptureAsync(CheckpointCaptureHandle handle, string outcome, string? snapshot, CancellationToken cancellationToken = default);
    /// <summary>Finalizes or releases only the matching token and generation; stale handles are harmless.</summary>
    ValueTask FinishAsync(InterruptClaim claim, InterruptFinish finish, CancellationToken cancellationToken = default);
}

internal static class InterruptValidation
{
    internal static byte[] Fingerprint(RunAgentInput input, string? identity = null)
    {
        var legacy = SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(
            new RunAgentInput { ThreadId = input.ThreadId, RunId = string.Empty, Messages = input.Messages, Tools = input.Tools, ForwardedProperties = input.ForwardedProperties },
            AGUIJsonSerializerContext.Default.RunAgentInput));
        return identity is null ? legacy : SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new[] { "hashbrown-bound-request-v1", identity, Convert.ToHexString(legacy) }));
    }

    internal static int Validate(string scope, RunAgentInput input, InterruptRecord record, DateTimeOffset now, string? identity = null)
    {
        if (record.Scope != scope || record.ThreadId != input.ThreadId || record.Batch.ExpiresAt <= now) return 410;
        if (record.CompatibilityIdentity != identity) return 409;
        if (record.State != "Pending" && !(record.State == "Claimed" && record.LeaseUntil <= now)) return 409;
        if (!CryptographicOperations.FixedTimeEquals(record.Fingerprint, Fingerprint(input, identity))) return 400;
        var entries = input.Resume!;
        if (entries.Count != record.Batch.Ids.Count || entries.Select(entry => entry.InterruptId).Distinct(StringComparer.Ordinal).Count() != entries.Count ||
            entries.Any(entry => !record.Batch.Ids.Contains(entry.InterruptId, StringComparer.Ordinal))) return 400;
        foreach (var entry in entries)
        {
            if (entry.Status == "cancelled") { if (entry.Payload is not null) return 400; continue; }
            if (entry.Status != "resolved" || entry.Payload is not { ValueKind: JsonValueKind.Object } payload ||
                payload.EnumerateObject().Count() != 1 || !payload.TryGetProperty("approved", out var approved) ||
                approved.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return 400;
        }
        return 200;
    }

    internal static bool Declined(RunAgentInput input) => input.Resume!.Any(entry => entry.Status == "cancelled" || !entry.Payload!.Value.GetProperty("approved").GetBoolean());
}

internal sealed record InterruptRecord(PendingInterrupt Batch, string Scope, string ThreadId, string OriginRunId, byte[] Fingerprint,
    string State = "Pending", string? Token = null, long Generation = 0, DateTimeOffset? LeaseUntil = null, DateTimeOffset? CompletedAt = null, string? OriginalRequest = null, string? TerminalSnapshot = null,
    string GenerationOutcome = "NotStarted", long Revision = 1, DateTimeOffset CreatedAt = default,
    string? CaptureToken = null, string? ReconciliationOutcome = null, string? CompatibilityIdentity = null);
