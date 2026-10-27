using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Hashbrown.Conformance.Integration;

/// <summary>Pure bounded native approval wire parsing and preliminary owned comparison.</summary>
public static class NativeApprovalAdmission
{
    /// <summary>Parses exact generic decisions separately from canonical public history.</summary>
    public static NativeApprovalAdmissionEnvelope Parse(string originalRunAgentInputJson, NativeSessionKey key, NativeToolCatalog catalog, NativeSessionOptions options)
    {
        ArgumentNullException.ThrowIfNull(originalRunAgentInputJson); options.Checked();
        if (Encoding.UTF8.GetByteCount(originalRunAgentInputJson) > options.PublicBytes) throw new ArgumentException("Native approval input exceeds its limit.");
        using var document = JsonDocument.Parse(originalRunAgentInputJson);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object || root.EnumerateObject().Count(item => item.NameEquals("resume")) != 1 || !root.TryGetProperty("resume", out var resume) || resume.ValueKind != JsonValueKind.Array || resume.GetArrayLength() < 1 || resume.GetArrayLength() > options.MaximumCalls) throw new ArgumentException("A bounded complete native decision array is required.");
        var decisions = new List<NativeApprovalDecision>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var entry in resume.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object) throw new ArgumentException("Native decisions must be objects.");
            var fields = entry.EnumerateObject().Select(item => item.Name).ToArray();
            if (fields.Distinct(StringComparer.Ordinal).Count() != fields.Length || fields.Any(field => field is not ("interruptId" or "status" or "payload"))) throw new ArgumentException("Unsupported or ambiguous native decision field.");
            var id = RequiredString(entry, "interruptId");
            if (!ids.Add(id)) throw new ArgumentException("Native decision identities must be unique.");
            var status = RequiredString(entry, "status");
            var hasPayload = entry.TryGetProperty("payload", out var payload);
            NativeApprovalDecisionKind kind;
            if (status == "cancelled" && !hasPayload) kind = NativeApprovalDecisionKind.Cancelled;
            else if (status == "resolved" && hasPayload && payload.ValueKind == JsonValueKind.Object && payload.EnumerateObject().Count() == 1 && payload.TryGetProperty("approved", out var approved) && approved.ValueKind is JsonValueKind.True or JsonValueKind.False)
                kind = approved.GetBoolean() ? NativeApprovalDecisionKind.Approved : NativeApprovalDecisionKind.Declined;
            else throw new ArgumentException("Native decisions require an exact approved boolean or cancelled absence.");
            decisions.Add(new(id, kind));
        }
        // Normalize a separate clone: raw decisions remain request-local, and the original is unchanged.
        var canonicalInput = JsonNode.Parse(originalRunAgentInputJson)!.AsObject();
        canonicalInput.Remove("resume");
        return new(NativeSessionHistory.Normalize(canonicalInput.ToJsonString(), key, catalog, options), decisions);
    }
    /// <summary>Checks only the complete current published protected request set; storage still rechecks authority.</summary>
    public static bool MatchesPublishedBatch(NativeApprovalAdmissionEnvelope input, NativeApprovalEvidence owned)
    {
        if (!Pending(owned)) return false;
        var expected = owned.Batch.Batch.ProtectedRequests.Select(item => item.RequestId).ToHashSet(StringComparer.Ordinal);
        return input.Decisions.Count == expected.Count && input.Decisions.Select(item => item.RequestId).Distinct(StringComparer.Ordinal).Count() == expected.Count && expected.SetEquals(input.Decisions.Select(item => item.RequestId));
    }
    /// <summary>Checks exact owned history allowing only characterized interrupted browser cancellation annotations.</summary>
    public static bool AdmitsOwnedPrefix(string canonicalIncoming, NativeSessionSnapshot stored, NativeApprovalEvidence owned)
    {
        if (!Pending(owned) || stored.TurnCompleted || stored.Approvals.PendingBatch is not { } pending || !JsonNode.DeepEquals(JsonSerializer.SerializeToNode(pending), JsonSerializer.SerializeToNode(owned.Batch))) return false;
        try
        {
            var incoming = JsonNode.Parse(canonicalIncoming)!.AsObject();
            var original = JsonNode.Parse(stored.PublicRequest)!.AsObject();
            var messages = incoming["messages"]!.AsArray(); var prefix = original["messages"]!.AsArray();
            if (messages.Count != prefix.Count || !BoundCallsMatch(prefix, owned.Batch)) return false;
            incoming.Remove("messages"); original.Remove("messages");
            if (!JsonNode.DeepEquals(incoming, original)) return false;
            for (var index = 0; index < prefix.Count; index++)
            {
                if (NativeSessionHistory.EquivalentMessage(prefix[index], messages[index])) continue;
                var candidate = messages[index]?.DeepClone();
                foreach (var browser in owned.Batch.Batch.BrowserBindings.Where(item => owned.Batch.PublicLocations[item.RequestId].MessageIndex == index))
                {
                    if (!stored.ExpectedBrowserCallIds.Contains(browser.CallId, StringComparer.Ordinal) || prefix.Any(message => message?["role"]?.GetValue<string>() == "tool" && message["toolCallId"]?.GetValue<string>() == browser.CallId)) return false;
                    var location = owned.Batch.PublicLocations[browser.RequestId];
                    if (candidate?["toolCalls"] is not JsonArray calls || location.CallIndex >= calls.Count || prefix[index]?["toolCalls"] is not JsonArray originals) return false;
                    if (!JsonNode.DeepEquals(calls[location.CallIndex], originals[location.CallIndex]) && !RemoveCancellationAnnotation(calls[location.CallIndex], originals[location.CallIndex])) return false;
                }
                if (!NativeSessionHistory.EquivalentMessage(prefix[index], candidate)) return false;
            }
            return true;
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException or ArgumentException or KeyNotFoundException or IndexOutOfRangeException) { return false; }
    }
    private static bool Pending(NativeApprovalEvidence owned) => owned.State == NativeApprovalState.Pending && owned.Decisions.Count == 0 && owned.AdmittedGeneration is null && owned.AdmittedRevision is null && owned.SessionKeyId == owned.CurrentOwner.Key.Id && owned.CurrentOwner.Generation > 0 && owned.CurrentOwner.Revision >= owned.PublishedRevision && !string.IsNullOrWhiteSpace(owned.CurrentOwner.Token);
    private static string RequiredString(JsonElement value, string name) => value.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.String ? NativeSessionKey.Required(field.GetString()!) : throw new ArgumentException("Native decision identities and statuses must be strings.");
    private static bool BoundCallsMatch(JsonArray prefix, NativeBoundApprovalBatch bound)
    {
        foreach (var descriptor in bound.Batch.ProtectedRequests)
            if (!CallMatches(prefix, bound.PublicLocations[descriptor.RequestId], descriptor.Call.Id, descriptor.Call.Name, descriptor.Call.Arguments)) return false;
        foreach (var browser in bound.Batch.BrowserBindings)
            if (!CallMatches(prefix, bound.PublicLocations[browser.RequestId], browser.CallId, browser.Name, browser.Arguments)) return false;
        return true;
    }
    private static bool CallMatches(JsonArray messages, NativePublicCallLocation location, string id, string name, JsonElement arguments)
    {
        if (location.MessageIndex >= messages.Count || messages[location.MessageIndex] is not JsonObject message || message["id"]?.GetValue<string>() != location.AssistantMessageId || message["role"]?.GetValue<string>() != "assistant" || message["toolCalls"] is not JsonArray calls || location.CallIndex >= calls.Count || calls[location.CallIndex] is not JsonObject call) return false;
        if (messages.Any(item => item?["role"]?.GetValue<string>() == "tool" && item["toolCallId"]?.GetValue<string>() == id)) return false;
        return call["id"]?.GetValue<string>() == id && call["function"]?["name"]?.GetValue<string>() == name && JsonNode.DeepEquals(JsonNode.Parse(call["function"]!["arguments"]!.GetValue<string>()), JsonNode.Parse(arguments.GetRawText()));
    }
    private static bool RemoveCancellationAnnotation(JsonNode? candidate, JsonNode? original)
    {
        if (candidate?["metadata"] is not JsonObject metadata || metadata["b4.step"] is not JsonObject step || original?["metadata"]?["b4.step"] is not null) return false;
        if (step.Count != 4 || step["v"]?.GetValue<int>() != 1 || step["kind"]?.GetValue<string>() != "server" || step["status"]?.GetValue<string>() != "cancelled" || step["settledAt"] is not JsonValue time || !time.TryGetValue<double>(out var milliseconds) || !double.IsFinite(milliseconds) || milliseconds < 0 || milliseconds > 253402300799999) return false;
        metadata.Remove("b4.step");
        if (metadata.Count == 0 && original?["metadata"] is null) candidate!.AsObject().Remove("metadata");
        return true;
    }
}
