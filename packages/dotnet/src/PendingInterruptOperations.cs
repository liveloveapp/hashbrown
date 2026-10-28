namespace Hashbrown.AspNetCore;

public sealed partial class PendingInterruptStore
{
  private readonly Dictionary<string, (string Scope, CheckpointAudit Audit)> _audit = new(StringComparer.Ordinal);

  /// <inheritdoc />
  public ValueTask<CheckpointPage> ListAsync(IReadOnlySet<string> scopes, int limit = 50, string? cursor = null, string? state = null, CancellationToken cancellationToken = default)
  {
    cancellationToken.ThrowIfCancellationRequested();
    CheckpointSummaries.ValidatePage(scopes, limit, cursor, state);
    lock (_gate)
    {
      var records = _pending.Values.Where(record => scopes.Contains(record.Scope) && (cursor is null || StringComparer.Ordinal.Compare(record.Batch.Id, cursor) > 0) && (state is null || state == record.State)).OrderBy(record => record.Batch.Id, StringComparer.Ordinal).Take(limit + 1).ToArray();
      return ValueTask.FromResult(new CheckpointPage(records.Take(limit).Select(CheckpointSummaries.Summary).ToArray(), records.Length > limit ? records[limit - 1].Batch.Id : null));
    }
  }

  /// <inheritdoc />
  public ValueTask<CheckpointInspection?> InspectAsync(IReadOnlySet<string> scopes, string batchId, int limit = 50, string? cursor = null, CancellationToken cancellationToken = default)
  {
    CheckpointSummaries.ValidatePage(scopes, limit, cursor);
    if (batchId.Length > 64) throw new ArgumentException("Invalid checkpoint identity.");
    cancellationToken.ThrowIfCancellationRequested();
    lock (_gate)
    {
      _pending.TryGetValue(batchId, out var record);
      if (record is not null && !scopes.Contains(record.Scope)) record = null;
      var audit = _audit.Values.Where(entry => scopes.Contains(entry.Scope) && entry.Audit.BatchId == batchId).Select(entry => entry.Audit).Where(entry => cursor is null || StringComparer.Ordinal.Compare(entry.Id, cursor) > 0).OrderBy(entry => entry.Id, StringComparer.Ordinal).Take(limit + 1).ToArray();
      if (record is null && audit.Length == 0) return ValueTask.FromResult<CheckpointInspection?>(null);
      return ValueTask.FromResult<CheckpointInspection?>(new(record is null ? null : CheckpointSummaries.Summary(record), audit.Take(limit).ToArray(), audit.Length > limit ? audit[limit - 1].Id : null));
    }
  }

  /// <inheritdoc />
  public ValueTask<int> ReconcileAsync(IReadOnlySet<string> scopes, string batchId, string actor, CheckpointReconciliation request, CancellationToken cancellationToken = default)
  {
    cancellationToken.ThrowIfCancellationRequested();
    if (string.IsNullOrWhiteSpace(actor) || actor.Length > 512 || scopes.Count is < 1 or > 100) return ValueTask.FromResult(400);
    if (!request.Valid) return ValueTask.FromResult(400);
    lock (_gate)
    {
      if (!_pending.TryGetValue(batchId, out var record) || !scopes.Contains(record.Scope)) return ValueTask.FromResult(404);
      if (record.State != request.ExpectedState || record.Generation != request.ExpectedGeneration || record.Revision != request.ExpectedRevision || record.State is not ("EffectStarted" or "FailedAfterEffect")) return ValueTask.FromResult(409);
      var now = clock.GetUtcNow();
      var audit = new CheckpointAudit(Guid.NewGuid().ToString("N"), batchId, actor, now, record.State, record.Generation, record.Revision, request.Outcome, request.Reason, request.EvidenceReference, true);
      _audit.Add(audit.Id, (record.Scope, audit));
      _pending[batchId] = record with { State = "Reconciled", ReconciliationOutcome = request.Outcome, Revision = record.Revision + 1, Generation = record.Generation + 1, Token = null, CaptureToken = null, LeaseUntil = null, CompletedAt = now, GenerationOutcome = record.GenerationOutcome == "Running" ? "Unavailable" : record.GenerationOutcome };
      return ValueTask.FromResult(200);
    }
  }
}
