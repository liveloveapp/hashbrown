namespace Hashbrown.AspNetCore;

public sealed partial class PendingInterruptStore
{
  /// <inheritdoc />
  public ValueTask<CheckpointCaptureHandle?> StartCaptureAsync(InterruptClaim claim, CancellationToken cancellationToken = default)
  {
    cancellationToken.ThrowIfCancellationRequested();
    lock (_gate)
    {
      if (!Current(claim, out var record) || record!.State is not ("Claimed" or "Declined") || record.State == "Claimed" && record.LeaseUntil <= clock.GetUtcNow()) return ValueTask.FromResult<CheckpointCaptureHandle?>(null);
      _pending[claim.BatchId] = record with { CaptureToken = claim.Token, GenerationOutcome = "Running", Revision = record.Revision + 1 };
      return ValueTask.FromResult<CheckpointCaptureHandle?>(new(claim, record.OriginalRequest, _options));
    }
  }

  /// <inheritdoc />
  public ValueTask<bool> CompleteCaptureAsync(CheckpointCaptureHandle handle, string outcome, string? snapshot, CancellationToken cancellationToken = default)
  {
    cancellationToken.ThrowIfCancellationRequested();
    RecoverySerialization.ValidateCapture(handle, outcome, snapshot);
    lock (_gate)
    {
      if (!Current(handle.Claim, out var record) || record!.CaptureToken != handle.Claim.Token || record.State == "Reconciled") return ValueTask.FromResult(false);
      if (record.GenerationOutcome != "Running") return ValueTask.FromResult(true);
      _pending[handle.Claim.BatchId] = record with { GenerationOutcome = outcome, TerminalSnapshot = record.CreatedAt + _options.SnapshotRetention > clock.GetUtcNow() ? snapshot : null, Revision = record.Revision + 1 };
      return ValueTask.FromResult(true);
    }
  }
}
