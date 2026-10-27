namespace Hashbrown.Conformance.Integration;

public sealed partial class PostgresNativeSessionJournal
{
    /// <inheritdoc />
    public ValueTask<bool> CaptureApprovalBatchAsync(NativeSessionLease lease, NativeApprovalBatch capture, CancellationToken cancellationToken = default) => throw new NotSupportedException("Native approval persistence is not enabled.");
    /// <inheritdoc />
    public ValueTask<NativeApprovalEvidence?> GetOwnedApprovalEvidenceAsync(NativeSessionLease lease, CancellationToken cancellationToken = default) => throw new NotSupportedException("Native approval persistence is not enabled.");
    /// <inheritdoc />
    public ValueTask<bool> TryAdmitApprovalBatchAsync(NativeSessionLease lease, string batchId, NativeApprovalAdmissionEnvelope admission, CancellationToken cancellationToken = default) => throw new NotSupportedException("Native approval persistence is not enabled.");
    /// <inheritdoc />
    public ValueTask<bool> SettleApprovalRejectionAsync(NativeSessionLease lease, NativeApprovalRejection rejection, CancellationToken cancellationToken = default) => throw new NotSupportedException("Native approval persistence is not enabled.");
}
