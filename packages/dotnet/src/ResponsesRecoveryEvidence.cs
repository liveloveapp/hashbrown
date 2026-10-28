#pragma warning disable OPENAI001 // Inspect pinned native Responses payloads before their adaptation loses output items.
using System.ClientModel.Primitives;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.AI;
using OpenAI.Responses;

namespace Hashbrown.AspNetCore;

/// <summary>Bounded request-local evidence for native output that the canonical AG-UI stream cannot represent.</summary>
internal sealed class ResponsesRecoveryEvidence : IDisposable
{
  private static readonly AsyncLocal<ResponsesRecoveryEvidence?> Active = new();
  private readonly ResponsesRecoveryEvidence? _previous;
  private readonly int _maximumBytes;
  private readonly int _maximumMessages;
  private readonly HashSet<(string Response, string Message)> _pairs = [];
  private readonly Dictionary<(string Response, string Call), (string Id, string Name, string Arguments)> _calls = [];
  private readonly HashSet<string> _outputIds = new(StringComparer.Ordinal);
  private readonly object _gate = new();
  private string? _responseId;
  private long _observed;
  private bool _available = true;

  private ResponsesRecoveryEvidence(int maximumBytes, int maximumMessages)
  {
    _maximumBytes = maximumBytes;
    _maximumMessages = maximumMessages;
    _previous = Active.Value;
    Active.Value = this;
  }

  internal static ResponsesRecoveryEvidence Begin(int maximumBytes, int maximumMessages) => new(maximumBytes, maximumMessages);
  internal static ResponsesRecoveryEvidence? Current => Active.Value;
  internal bool Available { get { lock (_gate) return _available; } }
  internal bool Matches(string? responseId, string? messageId)
  {
    lock (_gate) return _available && responseId is not null && messageId is not null && _pairs.Contains((responseId, messageId));
  }

  internal bool MatchesCall(string? responseId, string? callId, string? name, JsonNode? arguments)
  {
    lock (_gate)
    {
      if (!_available || responseId is null || callId is null || !_calls.TryGetValue((responseId, callId), out var call) || name != call.Name) return false;
      try { return JsonNode.DeepEquals(JsonNode.Parse(call.Arguments), arguments); }
      catch (JsonException) { return false; }
    }
  }

  internal string? CallMessageId(string? responseId, string? callId, string? name, JsonNode? arguments)
  {
    lock (_gate) return MatchesCall(responseId, callId, name, arguments) ? _calls[(responseId!, callId!)].Id : null;
  }

  // Serialization uses the SDK's JSON model writer, preserving native unknown item fields as well as typed fields.
  internal static void Observe(ChatResponseUpdate update)
  {
    if (update.RawRepresentation is not StreamingResponseUpdate native) { Active.Value?.Discard(); return; }
    using var document = JsonDocument.Parse(ModelReaderWriter.Write(native).ToMemory());
    var root = document.RootElement;
    ValidateTerminal(root);
    Active.Value?.Inspect(root, update.ResponseId, update.MessageId);
  }

  internal static void Observe(ChatResponse response)
  {
    if (response.RawRepresentation is not ResponseResult native) { Active.Value?.Discard(); return; }
    using var document = JsonDocument.Parse(ModelReaderWriter.Write(native).ToMemory());
    ValidateResponseStatus(document.RootElement, terminal: true);
    Active.Value?.InspectResponse(document.RootElement, response.ResponseId);
  }

  private static void ValidateTerminal(JsonElement root)
  {
    var type = Text(root, "type");
    if (type is "response.failed" or "response.incomplete" or "response.cancelled" or "error")
      throw new InvalidOperationException("The native Responses stream did not complete successfully.");
    if (root.TryGetProperty("response", out var response))
      ValidateResponseStatus(response, type == "response.completed");
  }

  private static void ValidateResponseStatus(JsonElement response, bool terminal)
  {
    var status = Text(response, "status");
    if (status is "failed" or "incomplete" or "cancelled" || terminal && status != "completed" ||
        response.TryGetProperty("error", out var error) && error.ValueKind != JsonValueKind.Null ||
        response.TryGetProperty("incomplete_details", out var incomplete) && incomplete.ValueKind != JsonValueKind.Null)
      throw new InvalidOperationException("The native Responses result did not complete successfully.");
  }

  private void Inspect(JsonElement root, string? responseId, string? messageId)
  {
    lock (_gate)
    {
      if (!Budget(root)) return;
      switch (Text(root, "type"))
      {
        case "response.created":
        case "response.in_progress":
        case "response.queued":
        case "response.completed":
          if (!root.TryGetProperty("response", out var response)) { Discard(); break; }
          InspectResponse(response, responseId);
          break;
        case "response.output_item.added":
        case "response.output_item.done":
          if (!root.TryGetProperty("item", out var item) || !SupportedItem(item)) Discard();
          break;
        case "response.content_part.added":
        case "response.content_part.done":
          if (!root.TryGetProperty("part", out var part) || !SupportedText(part)) Discard();
          break;
        case "response.output_text.delta":
        case "response.output_text.done":
          if (!Empty(root, "logprobs")) Discard();
          if (Text(root, "item_id") is { } textId) RememberOutput(textId);
          break;
        case "response.function_call_arguments.delta":
        case "response.function_call_arguments.done": break;
        default: Discard(); break;
      }
      // Distinct native response and message IDs are redundant only after their native association is witnessed.
      if (_available && responseId == _responseId && messageId is not null && _outputIds.Contains(messageId))
      {
        if (_pairs.Count >= _maximumMessages && !_pairs.Contains((responseId!, messageId))) Discard();
        else _pairs.Add((responseId!, messageId));
      }
    }
  }

  private void InspectResponse(JsonElement response, string? responseId)
  {
    lock (_gate)
    {
      if (!Budget(response)) return;
      if (Text(response, "id") is not { } id || id != responseId) { Discard(); return; }
      if (_responseId != id) _outputIds.Clear();
      _responseId = id;
      if (response.TryGetProperty("output", out var output))
      {
        if (output.ValueKind != JsonValueKind.Array) { Discard(); return; }
        foreach (var item in output.EnumerateArray()) if (!SupportedItem(item)) { Discard(); return; }
      }
    }
  }

  private bool SupportedItem(JsonElement item)
  {
    if (Text(item, "id") is not { Length: > 0 } || Text(item, "status") is { } status && status is not ("completed" or "in_progress")) return false;
    switch (Text(item, "type"))
    {
      case "message":
        if (!Only(item, "id", "type", "status", "role", "content") || Text(item, "role") != "assistant" ||
            !item.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array) return false;
        foreach (var part in content.EnumerateArray()) if (!SupportedText(part)) return false;
        RememberOutput(Text(item, "id")!);
        return _available;
      case "function_call":
        if (!Only(item, "id", "type", "status", "call_id", "name", "arguments") ||
            Text(item, "call_id") is not { Length: > 0 } || Text(item, "name") is not { Length: > 0 } || Text(item, "arguments") is null) return false;
        RememberOutput(Text(item, "id")!);
        if (_responseId is not null && Text(item, "status") == "completed")
        {
          var key = (_responseId, Text(item, "call_id")!);
          if (_calls.Count >= _maximumMessages && !_calls.ContainsKey(key)) { Discard(); return false; }
          _calls[key] = (Text(item, "id")!, Text(item, "name")!, Text(item, "arguments")!);
        }
        return _available;
      default: return false;
    }
  }

  private static bool SupportedText(JsonElement part) => Only(part, "type", "text", "annotations", "logprobs") &&
      Text(part, "type") == "output_text" && Text(part, "text") is not null && Empty(part, "annotations") && Empty(part, "logprobs");
  private static bool Only(JsonElement item, params string[] names) => item.ValueKind == JsonValueKind.Object && item.EnumerateObject().All(property => names.Contains(property.Name, StringComparer.Ordinal));
  private static string? Text(JsonElement item, string name) => item.ValueKind == JsonValueKind.Object && item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
  private static bool Empty(JsonElement item, string name) => !item.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null || value.ValueKind == JsonValueKind.Array && value.GetArrayLength() == 0;
  private void RememberOutput(string id)
  {
    if (id.Length > _maximumBytes || _outputIds.Count >= _maximumMessages && !_outputIds.Contains(id)) Discard();
    else _outputIds.Add(id);
  }
  private bool Budget(JsonElement root)
  {
    _observed += System.Text.Encoding.UTF8.GetByteCount(root.GetRawText());
    if (_observed > (long)_maximumBytes * 8) Discard();
    return _available;
  }
  private void Discard() { lock (_gate) { _available = false; _pairs.Clear(); _outputIds.Clear(); _calls.Clear(); } }
  /// <inheritdoc />
  public void Dispose() => Active.Value = _previous;
}
