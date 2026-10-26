using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using AGUI.Abstractions;

namespace Hashbrown.Conformance.Integration;

/// <summary>Current trusted browser configuration. History and shared state come only from storage.</summary>
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ConversationRecoveryConfiguration(string? System = null, IReadOnlyList<AGUITool>? Tools = null, JsonElement? ForwardedProps = null);

/// <summary>Public confirmation fields, carrying no server claim authority.</summary>
public sealed record RecoveryInterrupt(string Id, string Reason, string Message, JsonElement ResponseSchema, string ExpiresAt);

/// <summary>Owned canonical native conversation that can be installed without replaying events.</summary>
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ConversationSnapshot(string ThreadId, JsonElement Messages, JsonElement? State,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<RecoveryInterrupt>? Interrupts = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ConfiguredSystemMessageId = null);

/// <summary>Versioned read-only checkpoint disposition; effect and generation outcomes are independent.</summary>
public sealed record CheckpointRecovery(int SchemaVersion, string BatchId, long ServerRevision, string EffectState,
    string GenerationOutcome, string TranscriptAvailability, string Disposition, DateTimeOffset ExpiresAt,
    DateTimeOffset? LeaseUntil, ConversationSnapshot? Snapshot, string? ReconciliationOutcome = null);

/// <summary>Pre-stream read-only recovery result.</summary>
public sealed record CheckpointRecoveryResult(int Status, CheckpointRecovery? Recovery = null);

internal static class RecoverySerialization
{
    internal static void ValidateCapture(CheckpointCaptureHandle handle, string outcome, string? snapshot)
    {
        if (outcome is not ("Finished" or "Failed" or "Interrupted" or "Unavailable")) throw new ArgumentException("Capture outcome must be terminal.");
        if (snapshot is null) return;
        if (outcome != "Finished" || Encoding.UTF8.GetByteCount(snapshot) > handle.MaximumBytes) throw new ArgumentException("Only a bounded finished canonical transcript can be retained.");
        try
        {
            var final = JsonSerializer.Deserialize<ConversationSnapshot>(snapshot, JsonSerializerOptions.Web) ?? throw new JsonException();
            if (final.Messages.ValueKind != JsonValueKind.Array || final.Messages.GetArrayLength() > handle.MaximumMessages || final.Interrupts is not null || final.ConfiguredSystemMessageId is not null || handle.OriginalRequest is null) throw new JsonException();
            var original = System.Text.Json.Nodes.JsonNode.Parse(handle.OriginalRequest)!;
            if (final.ThreadId != original["threadId"]?.GetValue<string>()) throw new JsonException();
            original["messages"] = System.Text.Json.Nodes.JsonNode.Parse(final.Messages.GetRawText());
            var native = JsonSerializer.Deserialize(original.ToJsonString(), AGUIJsonSerializerContext.Default.RunAgentInput) ?? throw new JsonException();
            if (native.Messages.Any(message => string.IsNullOrWhiteSpace(message.Id)) || native.Messages.Select(message => message.Id).Distinct(StringComparer.Ordinal).Count() != native.Messages.Count) throw new JsonException();
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException or NotSupportedException)
        { throw new ArgumentException("The completed transcript is not a bounded canonical snapshot.", nameof(snapshot), exception); }
    }

    internal static string Original(RunAgentInput input, InterruptStoreOptions options)
    {
        var json = JsonSerializer.Serialize(input, AGUIJsonSerializerContext.Default.RunAgentInput);
        if (input.Messages.Count > options.MaximumMessages || Encoding.UTF8.GetByteCount(json) > options.OriginalRequestBytes)
            throw new ArgumentException("The original checkpoint request exceeds its configured recovery limit.");
        return json;
    }

    internal static CheckpointRecoveryResult Recover(InterruptRecord record, ConversationRecoveryConfiguration configuration, DateTimeOffset now, InterruptStoreOptions options)
    {
        if (record.CompatibilityIdentity != options.CompatibilityIdentity) return new(409);
        if (record.CreatedAt + options.SnapshotRetention <= now) record = record with { OriginalRequest = null, TerminalSnapshot = null };
        var disposition = record.State switch
        {
            "Claimed" when record.LeaseUntil > now => "Busy",
            "Pending" or "Claimed" when record.Batch.ExpiresAt <= now => "Expired",
            "Pending" => "Pending",
            "Claimed" when record.LeaseUntil <= now => "Pending",
            "Claimed" => "Busy",
            "EffectStarted" => "UnknownEffect",
            "FailedAfterEffect" => "AmbiguousEffect",
            "Completed" when record.GenerationOutcome != "Finished" || record.TerminalSnapshot is null => "CompletedAnswerUnavailable",
            _ => record.State
        };
        ConversationSnapshot? snapshot = null;
        if (record.OriginalRequest is { } original)
        {
            var input = JsonSerializer.Deserialize(original, AGUIJsonSerializerContext.Default.RunAgentInput)!;
            var supplied = new RunAgentInput { ThreadId = "", RunId = "", Tools = configuration.Tools?.ToList(), ForwardedProperties = configuration.ForwardedProps };
            var originalConfiguration = JsonSerializer.SerializeToElement(new RunAgentInput { ThreadId = "", RunId = "", Tools = input.Tools, ForwardedProperties = input.ForwardedProperties }, AGUIJsonSerializerContext.Default.RunAgentInput);
            var currentConfiguration = JsonSerializer.SerializeToElement(supplied, AGUIJsonSerializerContext.Default.RunAgentInput);
            if (originalConfiguration.GetRawText() != currentConfiguration.GetRawText()) return new(409);
            string? overlayId = null;
            if (configuration.System is { } system)
            {
                if (input.Messages.FirstOrDefault() is not AGUISystemMessage first || first.Content != system) return new(409);
                overlayId = first.Id;
            }
            var stored = JsonSerializer.SerializeToElement(input, AGUIJsonSerializerContext.Default.RunAgentInput);
            var interrupts = disposition == "Pending" ? record.Batch.Ids.Select(id => new RecoveryInterrupt(id, "confirmation", "Approve the pending server action?",
                JsonSerializer.SerializeToElement(new { type = "object", additionalProperties = false, required = new[] { "approved" }, properties = new { approved = new { type = "boolean" } } }), record.Batch.ExpiresAt.ToString("O"))).ToArray() : null;
            snapshot = record.GenerationOutcome == "Finished" && record.TerminalSnapshot is { } terminal
                ? JsonSerializer.Deserialize<ConversationSnapshot>(terminal, JsonSerializerOptions.Web)! with { ConfiguredSystemMessageId = overlayId }
                : new(input.ThreadId, stored.GetProperty("messages").Clone(), input.State?.Clone(), interrupts, overlayId);
        }
        return new(200, new(1, record.Batch.Id, record.Revision, record.State, record.GenerationOutcome,
            record.OriginalRequest is null ? "Unavailable" : record.TerminalSnapshot is not null ? "Complete" : "Original", disposition,
            record.Batch.ExpiresAt, record.LeaseUntil, snapshot, record.ReconciliationOutcome));
    }
}
