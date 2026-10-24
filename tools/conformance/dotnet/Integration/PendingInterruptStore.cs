using AGUI.Abstractions;

namespace Hashbrown.Conformance.Integration;

/// <summary>Bounded process-local development store implementing the same fenced claim contract as PostgreSQL.</summary>
public sealed class PendingInterruptStore(TimeProvider clock, WorkflowOperationRegistry registry, InterruptStoreOptions? options = null) : IInterruptStore
{
    private readonly object _gate = new();
    private readonly Dictionary<string, InterruptRecord> _pending = new(StringComparer.Ordinal);
    private readonly InterruptStoreOptions _options = (options ?? new()).Checked();

    /// <inheritdoc />
    public ValueTask<PendingInterrupt> CreateAsync(string scope, RunAgentInput input, WorkflowCheckpoint checkpoint, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _ = registry.Resolve(checkpoint);
        lock (_gate)
        {
            var now = clock.GetUtcNow();
            foreach (var key in _pending.Where(pair => Removable(pair.Value, now)).Select(pair => pair.Key).ToArray()) _pending.Remove(key);
            var existing = _pending.Values.FirstOrDefault(record => record.Scope == scope && record.ThreadId == input.ThreadId && record.State is "Pending" or "Claimed" or "EffectStarted");
            if (existing is not null) return ValueTask.FromResult(existing.Batch);
            if (_pending.Count >= _options.Capacity) throw new InvalidOperationException("Pending confirmation capacity reached.");
            var id = Guid.NewGuid().ToString("N");
            var batch = new PendingInterrupt(id, Array.AsReadOnly(new[] { Guid.NewGuid().ToString("N"), Guid.NewGuid().ToString("N") }), now + _options.ApprovalTtl, checkpoint, Guid.NewGuid().ToString("N"));
            _pending.Add(id, new(batch, scope, input.ThreadId, input.RunId, InterruptValidation.Fingerprint(input)));
            return ValueTask.FromResult(batch);
        }
    }

    /// <inheritdoc />
    public ValueTask<InterruptClaimResult> TryClaimAsync(string scope, RunAgentInput input, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            if (input.Resume is not { Count: > 0 }) return ValueTask.FromResult(new InterruptClaimResult(400));
            var record = _pending.Values.FirstOrDefault(candidate => input.Resume.Any(entry => candidate.Batch.Ids.Contains(entry.InterruptId, StringComparer.Ordinal)));
            if (record is null) return ValueTask.FromResult(new InterruptClaimResult(410));
            var now = clock.GetUtcNow();
            var status = InterruptValidation.Validate(scope, input, record, now);
            if (status != 200) return ValueTask.FromResult(new InterruptClaimResult(status));
            try { _ = registry.Resolve(record.Batch.Checkpoint); }
            catch (InvalidOperationException) { return ValueTask.FromResult(new InterruptClaimResult(503)); }
            var declined = InterruptValidation.Declined(input);
            var claim = new InterruptClaim(record.Batch.Id, Guid.NewGuid().ToString("N"), record.Generation + 1, record.Batch.Checkpoint, record.Batch.EffectId, declined);
            _pending[record.Batch.Id] = record with { State = declined ? "Declined" : "Claimed", Token = claim.Token, Generation = claim.Generation, LeaseUntil = now + _options.PreparationLease, CompletedAt = declined ? now : null };
            return ValueTask.FromResult(new InterruptClaimResult(200, claim));
        }
    }

    /// <inheritdoc />
    public ValueTask<bool> TryStartEffectAsync(InterruptClaim claim, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            if (!Current(claim, out var record) || record!.State != "Claimed" || record.LeaseUntil <= clock.GetUtcNow()) return ValueTask.FromResult(false);
            _pending[claim.BatchId] = record with { State = "EffectStarted" };
            return ValueTask.FromResult(true);
        }
    }

    /// <inheritdoc />
    public ValueTask FinishAsync(InterruptClaim claim, InterruptFinish finish, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            if (!Current(claim, out var record) || record!.State is not ("Claimed" or "EffectStarted")) return ValueTask.CompletedTask;
            // An expired preparation owner cannot consume or release a later claimant's opportunity.
            if (record.State == "Claimed" && record.LeaseUntil <= clock.GetUtcNow()) return ValueTask.CompletedTask;
            var released = finish == InterruptFinish.Cancelled && record.State == "Claimed";
            var state = released ? "Pending" : finish == InterruptFinish.Completed ? "Completed" : record.State == "EffectStarted" ? "FailedAfterEffect" : "FailedBeforeEffect";
            _pending[claim.BatchId] = record with { State = state, Token = released ? null : record.Token, LeaseUntil = null, CompletedAt = released ? null : clock.GetUtcNow() };
        }
        return ValueTask.CompletedTask;
    }

    private bool Current(InterruptClaim claim, out InterruptRecord? record) => _pending.TryGetValue(claim.BatchId, out record) && record.Token == claim.Token && record.Generation == claim.Generation;
    private bool Removable(InterruptRecord record, DateTimeOffset now) => record.State switch
    {
        "Pending" => record.Batch.ExpiresAt <= now,
        "Claimed" => record.Batch.ExpiresAt <= now && record.LeaseUntil <= now,
        "EffectStarted" => false,
        _ => record.CompletedAt + _options.TerminalRetention <= now
    };
}
