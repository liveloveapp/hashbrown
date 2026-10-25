using System.Text.Json.Serialization;

namespace Hashbrown.Conformance.Integration;

/// <summary>Safe operator summary, excluding original history, operation parameters and claim tokens.</summary>
public sealed record CheckpointSummary(string BatchId, string EffectId, string ThreadId, string OperationName, int OperationVersion,
    string EffectState, string GenerationOutcome, long Generation, long ServerRevision, DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt, DateTimeOffset? LeaseUntil, DateTimeOffset? CompletedAt, string? ReconciliationOutcome);

/// <summary>Bounded scoped page of safe checkpoint summaries.</summary>
public sealed record CheckpointPage(IReadOnlyList<CheckpointSummary> Items, string? NextCursor);

/// <summary>Immutable retained operator evidence. Quiescence is an external assertion, never a database proof.</summary>
public sealed record CheckpointAudit(string Id, string BatchId, string Actor, DateTimeOffset RecordedAt, string PriorState,
    long PriorGeneration, long PriorRevision, string Outcome, string Reason, string EvidenceReference, bool ExternalQuiescenceAcknowledged);

/// <summary>Safe scoped inspection. Audit remains readable after checkpoint metadata and transcript cleanup.</summary>
public sealed record CheckpointInspection(CheckpointSummary? Checkpoint, IReadOnlyList<CheckpointAudit> Audit, string? NextCursor);

/// <summary>Exact expected-version terminal reconciliation; never authorizes dispatch or retry.</summary>
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CheckpointReconciliation(string ExpectedState, long ExpectedGeneration, long ExpectedRevision, string Outcome,
    string Reason, string EvidenceReference, bool ExternalQuiescenceAcknowledged)
{
    internal bool Valid => ExpectedState is "EffectStarted" or "FailedAfterEffect" && ExpectedGeneration >= 0 && ExpectedRevision > 0 &&
        Outcome is "ConfirmedPerformed" or "ConfirmedNotPerformed" or "Unresolved" && !string.IsNullOrWhiteSpace(Reason) && Reason.Length <= 2000 &&
        !string.IsNullOrWhiteSpace(EvidenceReference) && EvidenceReference.Length <= 2048 && ExternalQuiescenceAcknowledged;
}

internal static class CheckpointSummaries
{
    internal static CheckpointSummary Summary(InterruptRecord record) => new(record.Batch.Id, record.Batch.EffectId, record.ThreadId,
        record.Batch.Checkpoint.Name, record.Batch.Checkpoint.Version, record.State, record.GenerationOutcome, record.Generation, record.Revision,
        record.CreatedAt, record.Batch.ExpiresAt, record.LeaseUntil, record.CompletedAt, record.ReconciliationOutcome);
    internal static void ValidatePage(IReadOnlySet<string> scopes, int limit, string? cursor, string? state = null)
    {
        if (scopes.Count is < 1 or > 100 || scopes.Any(scope => string.IsNullOrWhiteSpace(scope) || scope.Length > 512) || limit is < 1 or > 100 ||
            cursor is not null && (cursor.Length != 32 || !cursor.All(Uri.IsHexDigit)) || !State(state)) throw new ArgumentException("Invalid bounded scoped checkpoint query.");
    }
    internal static bool State(string? state) => state is null or "Pending" or "Claimed" or "EffectStarted" or "Completed" or "Declined" or "FailedBeforeEffect" or "FailedAfterEffect" or "Reconciled";
}
