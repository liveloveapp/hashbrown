using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using AGUI.Abstractions;

namespace Hashbrown.AspNetCore;

/// <summary>Strict request-local syntax and independent transient metadata clones; journal storage remains the authority.</summary>
internal static class NativeBrowserRecoveryAdmission
{
  internal const string UnavailableResult = "{\"hashbrownRecovery\":{\"version\":1,\"status\":\"result-unavailable\",\"effect\":\"unknown\",\"message\":\"The browser result is unavailable after recovery. The operation may already have occurred. No retry was performed.\"}}";

  /// <summary>Parses exact bounded recovery evidence from original bytes without acquiring ownership or changing input.</summary>
  internal static NativeBrowserRecoveryRequest? Parse(string raw, NativeSessionOptions options)
  {
    if (Encoding.UTF8.GetByteCount(raw) > options.PublicBytes) throw new ArgumentException("Browser recovery exceeds its bound.");
    NativeSessionRawRequest.Validate(raw);
    using var document = JsonDocument.Parse(raw, new JsonDocumentOptions { MaxDepth = 64 });
    var root = document.RootElement;
    if (!root.TryGetProperty("forwardedProps", out var forwarded) || forwarded.ValueKind != JsonValueKind.Object) return null;
    Alias(forwarded, "hashbrown");
    if (!forwarded.TryGetProperty("hashbrown", out var hashbrown)) return null;
    if (hashbrown.ValueKind != JsonValueKind.Object) throw new ArgumentException("hashbrown must be an object.");
    Alias(hashbrown, "recovery");
    if (!hashbrown.TryGetProperty("recovery", out var recovery)) return null;
    Exact(recovery, ["version", "serverRevision", "outcomes"]);
    if (!recovery.GetProperty("version").TryGetInt32(out var version) || version != 1 || !recovery.GetProperty("serverRevision").TryGetInt64(out var revision) || revision is < 1 or > 9007199254740991L) throw new ArgumentException("Unsupported recovery version or revision.");
    var outcomes = recovery.GetProperty("outcomes");
    if (outcomes.ValueKind != JsonValueKind.Array || outcomes.GetArrayLength() is < 1 || outcomes.GetArrayLength() > options.MaximumCalls) throw new ArgumentException("Complete bounded outcomes are required.");
    var parsed = new List<NativeBrowserRecoveryOutcome>();
    foreach (var outcome in outcomes.EnumerateArray())
    {
      Exact(outcome, ["toolCallId", "status"]);
      parsed.Add(new(String(outcome, "toolCallId"), String(outcome, "status")));
    }
    var request = new NativeBrowserRecoveryRequest(version, revision, parsed);
    if (!root.TryGetProperty("messages", out var messages) || messages.ValueKind != JsonValueKind.Array) throw new ArgumentException("Canonical recovery messages are required.");
    var ids = new HashSet<string>(StringComparer.Ordinal);
    var results = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
    foreach (var message in messages.EnumerateArray())
    {
      var id = String(message, "id");
      if (!ids.Add(id)) throw new ArgumentException("Recovery message identities must be unique.");
      if (String(message, "role") == "tool")
      {
        var call = String(message, "toolCallId");
        if (!results.TryAdd(call, message)) throw new ArgumentException("Recovery results must be unique.");
      }
    }
    foreach (var outcome in request.Outcomes)
    {
      if (!results.TryGetValue(outcome.ToolCallId, out var result)) throw new ArgumentException("Every browser outcome requires its canonical result.");
      if (outcome.Status == "unavailable" && (!result.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.String || !string.Equals(content.GetString(), UnavailableResult, StringComparison.Ordinal))) throw new ArgumentException("Unavailable browser results require the exact explicit uncertainty representation.");
    }
    return request;
  }

  /// <summary>Removes only validated transient metadata, preserving every other public field in an independent graph.</summary>
  internal static JsonObject Sanitize(string originalRaw, string? trustedStoredRequest = null, bool removeResume = true)
  {
    var root = JsonNode.Parse(originalRaw)!.AsObject();
    if (removeResume) root.Remove("resume");
    if (root["forwardedProps"] is JsonObject forwarded && forwarded["hashbrown"] is JsonObject hashbrown)
      hashbrown.Remove("recovery");
    if (trustedStoredRequest is not null)
    {
      var stored = JsonNode.Parse(trustedStoredRequest)!.AsObject();
      // Empty containers are pruned only when their absence is witnessed by the owned stored configuration.
      var trustedForwarded = stored["forwardedProps"];
      if (root["forwardedProps"] is JsonObject current)
      {
        if (current["hashbrown"] is JsonObject empty && empty.Count == 0 && trustedForwarded?["hashbrown"] is null) current.Remove("hashbrown");
        if (current.Count == 0 && !stored.ContainsKey("forwardedProps")) root.Remove("forwardedProps");
      }
      if (root.ContainsKey("forwardedProps") != stored.ContainsKey("forwardedProps") || !JsonNode.DeepEquals(root["forwardedProps"], trustedForwarded)) throw new ArgumentException("Recovered configuration differs from the trusted stored configuration.");
    }
    return root;
  }

  /// <summary>Checks public completeness in addition to the journal's durable capability evidence.</summary>
  internal static bool CanAdvertise(NativeSessionStatus status, RunAgentInput input)
  {
    if (status.State != "Ready" || status.IsNew || status.TurnCompleted || status.Revision is < 1 or > 9007199254740991L || status.RecoveryReason is not (null or "PendingMixedBrowserResult") || status.BrowserRecoveryCallIds is not { Count: > 0 and <= 256 } ids || ids.Distinct(StringComparer.Ordinal).Count() != ids.Count) return false;
    var browserNames = (input.Tools ?? []).Select(item => item.Name).ToHashSet(StringComparer.Ordinal);
    var serialized = JsonSerializer.SerializeToElement(input, AGUIJsonSerializerContext.Default.RunAgentInput);
    var calls = new Dictionary<string, string>(StringComparer.Ordinal);
    var results = new HashSet<string>(StringComparer.Ordinal);
    var messageIds = new HashSet<string>(StringComparer.Ordinal);
    foreach (var message in serialized.GetProperty("messages").EnumerateArray())
    {
      if (!messageIds.Add(String(message, "id"))) return false;
      if (message.TryGetProperty("toolCalls", out var declared) && declared.ValueKind == JsonValueKind.Array)
        foreach (var call in declared.EnumerateArray())
          if (!calls.TryAdd(String(call, "id"), String(call.GetProperty("function"), "name"))) return false;
      if (String(message, "role") == "tool")
      {
        var resultId = String(message, "toolCallId");
        if (!calls.ContainsKey(resultId) || !results.Add(resultId)) return false;
      }
    }
    var unresolved = calls.Where(item => !results.Contains(item.Key)).ToArray();
    var browser = unresolved.Where(item => browserNames.Contains(item.Value)).Select(item => item.Key).ToHashSet(StringComparer.Ordinal);
    var protectedIds = unresolved.Where(item => !browserNames.Contains(item.Value)).Select(item => item.Key).ToHashSet(StringComparer.Ordinal);
    var interrupts = status.PendingInterrupts ?? [];
    return browser.SetEquals(ids) && ids.All(id => !string.IsNullOrWhiteSpace(id) && Encoding.UTF8.GetByteCount(id) <= 1024) && interrupts.Count == protectedIds.Count && interrupts.Select(item => item.ToolCallId).Distinct(StringComparer.Ordinal).Count() == interrupts.Count && protectedIds.SetEquals(interrupts.Select(item => item.ToolCallId!));
  }
  private static void Exact(JsonElement element, string[] names)
  {
    if (element.ValueKind != JsonValueKind.Object || element.EnumerateObject().Count() != names.Length || element.EnumerateObject().Any(item => !names.Contains(item.Name, StringComparer.Ordinal))) throw new ArgumentException("Unknown, missing or ambiguous recovery field.");
  }
  private static void Alias(JsonElement element, string name)
  {
    if (element.EnumerateObject().Any(item => item.Name != name && string.Equals(item.Name, name, StringComparison.OrdinalIgnoreCase))) throw new ArgumentException("Ambiguous recovery property alias.");
  }
  private static string String(JsonElement element, string name) => element.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.String ? NativeSessionKey.Required(field.GetString()!) : throw new ArgumentException("A bounded recovery identity is required.");
}
