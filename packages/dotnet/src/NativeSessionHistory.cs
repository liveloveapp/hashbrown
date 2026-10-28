using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using AGUI.Abstractions;

namespace Hashbrown.AspNetCore;

/// <summary>Canonical bounded public history admission. This is storage validation, not a MAF transcript provider.</summary>
public static class NativeSessionHistory
{
  /// <summary>Normalizes JSON object order using the same structural JSON equivalence as canonical SSE argument validation.</summary>
  public static string Canonical(JsonElement value)
  {
    using var stream = new MemoryStream();
    using (var writer = new Utf8JsonWriter(stream)) Write(writer, value);
    return Encoding.UTF8.GetString(stream.ToArray());
  }
  private static void Write(Utf8JsonWriter writer, JsonElement value)
  {
    if (value.ValueKind == JsonValueKind.Object)
    {
      writer.WriteStartObject();
      foreach (var property in value.EnumerateObject().OrderBy(property => property.Name, StringComparer.Ordinal)) { writer.WritePropertyName(property.Name); Write(writer, property.Value); }
      writer.WriteEndObject();
    }
    else if (value.ValueKind == JsonValueKind.Array) { writer.WriteStartArray(); foreach (var item in value.EnumerateArray()) Write(writer, item); writer.WriteEndArray(); }
    else value.WriteTo(writer);
  }
  /// <summary>Validates and clones a genuine AGUI public request, rejecting ambiguous IDs and oversized state.</summary>
  public static string Normalize(string request, NativeSessionKey key, NativeToolCatalog catalog, NativeSessionOptions options)
  {
    if (Encoding.UTF8.GetByteCount(request) > options.PublicBytes) throw new ArgumentException("Native public history exceeds its limit.");
    using (var raw = JsonDocument.Parse(request)) ValidateShape(raw.RootElement, options);
    var input = JsonSerializer.Deserialize(request, AGUIJsonSerializerContext.Default.RunAgentInput) ?? throw new ArgumentException("A native public request is required.");
    if (input.ThreadId != key.Selector || input.Resume is { Count: > 0 } || input.Messages is not { Count: > 0 } || input.Messages.Count > options.MaximumMessages) throw new ArgumentException("Invalid native history selector, resume or message count.");
    var serialized = JsonSerializer.Serialize(input, AGUIJsonSerializerContext.Default.RunAgentInput);
    using (var normalized = JsonDocument.Parse(serialized)) ValidateShape(normalized.RootElement, options);
    var root = JsonNode.Parse(serialized)!.AsObject();
    root.Remove("runId");
    var messages = root["messages"]!.AsArray();
    var ids = new HashSet<string>(StringComparer.Ordinal);
    var calls = new HashSet<string>(StringComparer.Ordinal);
    var results = new HashSet<string>(StringComparer.Ordinal);
    foreach (var message in messages)
    {
      if (message is not JsonObject item || item["id"] is null || !ids.Add(NativeSessionKey.Required(item["id"]!.GetValue<string>()))) throw new ArgumentException("Native message IDs must be unique.");
      if (item["role"]?.GetValue<string>() == "tool" && (item["toolCallId"] is null || !results.Add(item["toolCallId"]!.GetValue<string>()) || !calls.Contains(item["toolCallId"]!.GetValue<string>()))) throw new ArgumentException("Native tool results must follow a unique call.");
      if (item["toolCalls"] is JsonArray toolCalls)
        foreach (var call in toolCalls)
        {
          var id = NativeSessionKey.Required(call!["id"]!.GetValue<string>());
          if (!calls.Add(id)) throw new ArgumentException("Native call IDs must be unique.");
          var function = call["function"]!.AsObject();
          var arguments = JsonNode.Parse(function["arguments"]!.GetValue<string>()) ?? throw new ArgumentException("Tool arguments must be JSON.");
          if (arguments is not JsonObject) throw new ArgumentException("Tool arguments must be an object.");
          function["arguments"] = Canonical(JsonSerializer.SerializeToElement(arguments));
        }
    }
    if (root["tools"] is JsonArray tools && (tools.Select(tool => tool!["name"]!.GetValue<string>()).Distinct(StringComparer.Ordinal).Count() != tools.Count || tools.Any(tool => catalog.Contains(tool!["name"]!.GetValue<string>())))) throw new ArgumentException("Browser and registered server tools must be disjoint and unique.");
    var canonical = Canonical(JsonSerializer.SerializeToElement(root));
    if (Encoding.UTF8.GetByteCount(canonical) > options.PublicBytes) throw new ArgumentException("Canonical native public history exceeds its limit.");
    return canonical;
  }
  private static void ValidateShape(JsonElement root, NativeSessionOptions options)
  {
    if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("messages", out var messages) || messages.ValueKind != JsonValueKind.Array || messages.GetArrayLength() is 0 || messages.GetArrayLength() > options.MaximumMessages) throw new ArgumentException("Native messages must be a bounded nonempty array.");
    foreach (var message in messages.EnumerateArray())
    {
      if (message.ValueKind != JsonValueKind.Object) throw new ArgumentException("Native messages must be objects.");
      _ = RequiredString(message, "id");
      var role = RequiredString(message, "role");
      if (role is not ("system" or "user" or "assistant" or "tool")) throw new ArgumentException("Unsupported native message role.");
      if (role == "tool") _ = RequiredString(message, "toolCallId");
      if (message.TryGetProperty("toolCalls", out var calls) && calls.ValueKind != JsonValueKind.Null)
      {
        if (role != "assistant" || calls.ValueKind != JsonValueKind.Array) throw new ArgumentException("Only assistant messages may contain a tool call array.");
        foreach (var call in calls.EnumerateArray())
        {
          if (call.ValueKind != JsonValueKind.Object) throw new ArgumentException("Native tool calls must be objects.");
          _ = RequiredString(call, "id");
          if (!call.TryGetProperty("function", out var function) || function.ValueKind != JsonValueKind.Object) throw new ArgumentException("Native function descriptors must be objects.");
          _ = RequiredString(function, "name");
          if (!function.TryGetProperty("arguments", out var arguments) || arguments.ValueKind != JsonValueKind.String) throw new ArgumentException("Native function arguments must be JSON strings.");
        }
      }
    }
    if (root.TryGetProperty("tools", out var tools) && tools.ValueKind != JsonValueKind.Null)
    {
      if (tools.ValueKind != JsonValueKind.Array) throw new ArgumentException("Native browser tools must be an array.");
      foreach (var tool in tools.EnumerateArray())
      {
        if (tool.ValueKind != JsonValueKind.Object) throw new ArgumentException("Native browser tools must be objects.");
        _ = RequiredString(tool, "name");
      }
    }
  }
  private static string RequiredString(JsonElement item, string name) => item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? NativeSessionKey.Required(value.GetString()!) : throw new ArgumentException($"Native {name} must be a nonempty string.");
  /// <summary>Compares public messages structurally and parses function arguments using the canonical SSE equivalence rules.</summary>
  internal static bool EquivalentMessage(JsonNode? left, JsonNode? right) => JsonNode.DeepEquals(ArgumentValues(left), ArgumentValues(right));
  private static JsonNode? ArgumentValues(JsonNode? message)
  {
    var copy = message?.DeepClone();
    if (copy?["toolCalls"] is JsonArray calls)
      foreach (var call in calls)
      {
        var function = call!["function"]!.AsObject();
        function["arguments"] = JsonNode.Parse(function["arguments"]!.GetValue<string>());
      }
    return copy;
  }
  /// <summary>Checks owned history with exact pending client results after their calls, or one subsequent user turn.</summary>
  public static bool Admits(string incoming, NativeSessionSnapshot? stored)
  {
    var current = JsonNode.Parse(incoming)!.AsObject();
    var messages = current["messages"]!.AsArray();
    if (stored is null) return messages.All(message => message!["role"]!.GetValue<string>() is "user" or "system") && messages.Any(message => message!["role"]!.GetValue<string>() == "user");
    var original = JsonNode.Parse(stored.PublicRequest)!.AsObject();
    var prefix = original["messages"]!.AsArray();
    current.Remove("messages"); original.Remove("messages");
    if (stored.ExpectedBrowserCallIds.Count != 0)
      return JsonNode.DeepEquals(current, original) && AdmitsBrowserResults(messages, prefix, stored.ExpectedBrowserCallIds);
    if (messages.Count < prefix.Count || prefix.Where((message, index) => !EquivalentMessage(message, messages[index])).Any()) return false;
    if (!stored.TurnCompleted && !JsonNode.DeepEquals(current, original)) return false;
    var delta = messages.Skip(prefix.Count).ToArray();
    return stored.TurnCompleted && delta.Length == 1 && delta[0]!["role"]!.GetValue<string>() == "user";
  }
  private static bool AdmitsBrowserResults(JsonArray messages, JsonArray prefix, IReadOnlyList<string> expectedIds)
  {
    var expected = expectedIds.ToHashSet(StringComparer.Ordinal);
    if (expected.Count != expectedIds.Count) return false;
    var announced = new HashSet<string>(StringComparer.Ordinal);
    var received = new HashSet<string>(StringComparer.Ordinal);
    var ownedIndex = 0;
    foreach (var message in messages)
    {
      var resultId = message!["role"]?.GetValue<string>() == "tool" ? message["toolCallId"]?.GetValue<string>() : null;
      if (resultId is not null && expected.Contains(resultId))
      {
        if (!announced.Contains(resultId) || !received.Add(resultId)) return false;
        continue;
      }
      if (ownedIndex >= prefix.Count || !EquivalentMessage(prefix[ownedIndex], message)) return false;
      // Only a matched stored call permits a new result. Incoming calls never establish authority.
      if (prefix[ownedIndex]!["toolCalls"] is JsonArray calls)
        foreach (var call in calls)
        {
          var callId = call!["id"]!.GetValue<string>();
          if (expected.Contains(callId)) announced.Add(callId);
        }
      ownedIndex++;
    }
    return ownedIndex == prefix.Count && received.SetEquals(expected);
  }

}
