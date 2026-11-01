using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using AGUI.Abstractions;

namespace Hashbrown.AspNetCore;

/// <summary>Witnesses provider identities before AG-UI adaptation; raw diagnostics alone confer no authority.</summary>
internal sealed class NativeSessionProjectionEvidence(
    Func<string?, string?, bool> matchesMessage,
    Func<string?, string?, string?, JsonNode?, bool> matchesCall,
    Func<bool>? available = null,
    Func<string?, string?, JsonNode?, bool>? ownedCall = null,
    Func<IReadOnlyList<NativeProjectionApproval>>? approvals = null)
{
  internal IReadOnlyList<NativeProjectionApproval> Approvals => approvals?.Invoke() ?? [];
  internal bool Available => available?.Invoke() ?? true;
  internal bool Matches(string? responseId, string? messageId) => matchesMessage(responseId, messageId);
  internal bool MatchesCall(string? responseId, string? callId, string? name, JsonNode? arguments) => matchesCall(responseId, callId, name, arguments);
  /// <summary>Matches only an exact current owned registered server descriptor, independently of provider/browser evidence.</summary>
  internal bool OwnsCall(string? callId, string? name, JsonNode? arguments) => ownedCall?.Invoke(callId, name, arguments) == true;
}

/// <summary>Independent immutable journal/capture witness for one supported native approval projection.</summary>
internal sealed record NativeProjectionApproval(string RequestId, string CallId, string Name, JsonElement Arguments, bool Protected, bool Pending, string? NativeMessageId, int ContentIndex, string? PublicParent = null, int? PublicMessageIndex = null, int? PublicCallIndex = null);

/// <summary>A bounded current public prefix and the genuine terminal's continuation disposition.</summary>
internal sealed record NativeSessionProjectionResult(
    bool Available,
    string? PublicRequestJson,
    IReadOnlyList<string> ExpectedBrowserCallIds,
    bool TurnCompleted,
    string? TerminalType,
    string? TerminalOutcome);

/// <summary>Folds genuine native SSE into one canonical public prefix and holds its terminal until the caller authorizes publication.</summary>
internal sealed class NativeSessionProjection
{
  private static readonly UTF8Encoding StrictUtf8 = new(false, true);
  private readonly NativeSessionProjectionEvidence? _evidence;
  private readonly HashSet<string> _browserTools;
  private readonly int _maximumBytes;
  private readonly int _maximumMessages;
  private readonly int _maximumFrameBytes;
  private readonly int _maximumTerminalBytes;
  private readonly string _threadId;
  private readonly string _runId;
  private readonly List<byte> _frame = [];
  private readonly Dictionary<string, JsonObject> _texts = new(StringComparer.Ordinal);
  private readonly Dictionary<string, JsonObject> _calls = new(StringComparer.Ordinal);
  private readonly Dictionary<string, JsonObject> _rawTexts = new(StringComparer.Ordinal);
  private readonly Dictionary<string, JsonObject> _rawCalls = new(StringComparer.Ordinal);
  private readonly Dictionary<string, string> _callParents = new(StringComparer.Ordinal);
  private readonly Dictionary<string, JsonObject> _rawBatchCalls = new(StringComparer.Ordinal);
  private readonly Dictionary<string, JsonNode?> _rawBatchResults = new(StringComparer.Ordinal);
  private readonly HashSet<string> _messageIds = new(StringComparer.Ordinal);
  private readonly HashSet<string> _historicalCallIds = new(StringComparer.Ordinal);
  private readonly HashSet<string> _openTexts = new(StringComparer.Ordinal);
  private readonly HashSet<string> _openCalls = new(StringComparer.Ordinal);
  private readonly HashSet<string> _answeredCalls = new(StringComparer.Ordinal);
  private JsonObject? _request;
  private JsonArray _messages;
  private byte[]? _terminal;
  private string? _terminalType;
  private string? _terminalOutcome;
  private string? _activeAssistantMessageId;
  private bool _available = true;
  private bool _invalid;
  private bool _complete;
  private bool _released;
  private int _newlines;
  private long _observed;
  private NativeSessionProjectionResult? _result;

  /// <summary>Clones the admitted input and browser names; every retained buffer has an independent positive bound.</summary>
  internal NativeSessionProjection(string originalRequestJson, IReadOnlySet<string> browserToolNames,
      int maximumBytes = 1048576, int maximumMessages = 1000, int maximumFrameBytes = 262144,
      int maximumTerminalBytes = 65536, NativeSessionProjectionEvidence? evidence = null)
  {
    ArgumentNullException.ThrowIfNull(originalRequestJson);
    ArgumentNullException.ThrowIfNull(browserToolNames);
    if (maximumBytes < 1 || maximumMessages < 1 || maximumFrameBytes < 1 || maximumTerminalBytes < 1) throw new ArgumentOutOfRangeException(nameof(maximumBytes));
    if (Encoding.UTF8.GetByteCount(originalRequestJson) > maximumBytes) throw new ArgumentException("Native public input exceeds its byte bound.", nameof(originalRequestJson));
    _ = JsonSerializer.Deserialize(originalRequestJson, AGUIJsonSerializerContext.Default.RunAgentInput) ?? throw new JsonException("Missing native input.");
    _request = JsonNode.Parse(originalRequestJson) as JsonObject ?? throw new JsonException("Expected native input object.");
    _messages = _request["messages"] as JsonArray ?? throw new JsonException("Expected native messages.");
    _threadId = Required(_request, "threadId"); _runId = Required(_request, "runId");
    _browserTools = new HashSet<string>(browserToolNames, StringComparer.Ordinal);
    _maximumBytes = maximumBytes; _maximumMessages = maximumMessages; _maximumFrameBytes = maximumFrameBytes; _maximumTerminalBytes = maximumTerminalBytes; _evidence = evidence;
    foreach (var message in _messages.OfType<JsonObject>())
    {
      if (!_messageIds.Add(Required(message, "id"))) throw new JsonException("Duplicate admitted message ID.");
      if (message["toolCalls"] is JsonArray calls) foreach (var call in calls.OfType<JsonObject>())
        if (!_historicalCallIds.Add(Required(call, "id"))) throw new JsonException("Duplicate admitted call ID.");
    }
    CheckBound();
  }

  /// <summary>Adopts only the journal-admitted original extension-container shape before native preparation; events and canonical history remain intact.</summary>
  internal void AdoptAdmittedForwardedProperties(string admittedPublicRequest)
  {
    if (_request is null || _complete || _invalid) throw new NativeSessionRequestException(503);
    var admitted = JsonNode.Parse(admittedPublicRequest)!.AsObject();
    if (admitted.TryGetPropertyValue("forwardedProps", out var forwarded)) _request["forwardedProps"] = forwarded?.DeepClone();
    else _request.Remove("forwardedProps");
    CheckBound();
  }

  /// <summary>Returns an immutable completed projection; before completion no continuation history is available.</summary>
  internal NativeSessionProjectionResult Result => _result ?? new(false, null, Array.Empty<string>(), false, _terminalType, _terminalOutcome);

  /// <summary>Forwards ordinary complete frames byte-for-byte; holding a terminal never waits for upstream persistence.</summary>
  internal async ValueTask ObserveAsync(ReadOnlyMemory<byte> bytes, Func<ReadOnlyMemory<byte>, ValueTask> forward, CancellationToken cancellationToken)
  {
    ArgumentNullException.ThrowIfNull(forward);
    if (_invalid || _complete && bytes.Length > 0) { Invalidate(); throw new InvalidOperationException("Native stream is no longer writable."); }
    for (var index = 0; index < bytes.Length; index++)
    {
      if (cancellationToken.IsCancellationRequested) { Invalidate(); cancellationToken.ThrowIfCancellationRequested(); }
      var value = bytes.Span[index];
      if (++_observed > (long)_maximumBytes * 8) { Invalidate(); throw new IOException("Native SSE exceeds its cumulative byte bound."); }
      if (_frame.Count >= _maximumFrameBytes) { Invalidate(); throw new IOException("Native SSE frame exceeds its byte bound."); }
      _frame.Add(value);
      if (value == 10) _newlines++; else if (value != 13) _newlines = 0;
      if (value != 10 || _newlines < 2) continue;
      var frame = _frame.ToArray(); _frame.Clear(); _newlines = 0;
      bool terminal;
      try { terminal = Process(frame); }
      catch { Invalidate(); throw; }
      if (!terminal)
      {
        try { await forward(frame); }
        catch { Invalidate(); throw; }
      }
    }
  }

  /// <summary>Finalizes the current prefix after upstream has emitted its terminal, including from its session-save callback.</summary>
  internal void Complete()
  {
    if (_complete) return;
    _complete = true;
    if (_frame.Count > 0) { Invalidate(); throw new IOException("Native SSE ended inside a frame."); }
    if (_terminal is null || _invalid || _evidence?.Available == false || _openTexts.Count > 0 || _openCalls.Count > 0 || _rawTexts.Count > 0 || _rawCalls.Count > 0) Discard();
    if (_available && !BatchObligationsAgree()) Discard();
    _rawBatchCalls.Clear(); _rawBatchResults.Clear();
    var pending = _calls.Where(pair => !_answeredCalls.Contains(pair.Key)).ToArray();
    if (pending.Any(pair => !_browserTools.Contains(Required(pair.Value["function"]!, "name")) && !CurrentPending().Any(item => item.Protected && item.CallId == pair.Key))) Discard();
    if (_terminalType != "RUN_FINISHED" || _terminalOutcome is not ("success" or "interrupt")) Discard();
    string? json = null;
    if (_available && _request is not null)
    {
      json = _request.ToJsonString();
      try { _ = JsonSerializer.Deserialize(json, AGUIJsonSerializerContext.Default.RunAgentInput) ?? throw new JsonException(); }
      catch (Exception exception) when (exception is JsonException or NotSupportedException) { Discard(); json = null; }
    }
    _result = new(_available, json, _available ? Array.AsReadOnly(pending.Where(pair => _browserTools.Contains(Required(pair.Value["function"]!, "name"))).Select(pair => pair.Key).ToArray()) : Array.Empty<string>(),
        _available && pending.Length == 0 && CurrentPending().Count == 0, _terminalType, _terminalOutcome);
  }

  /// <summary>Publishes the held genuine bytes once, only after the caller has durably saved and authorized this owner/revision.</summary>
  internal async ValueTask ReleaseTerminalAsync(Func<ReadOnlyMemory<byte>, ValueTask> forward, CancellationToken cancellationToken)
  {
    ArgumentNullException.ThrowIfNull(forward);
    if (!_complete || _invalid || _released || _terminal is null || _terminalType == "RUN_FINISHED" && !Result.Available)
      throw new InvalidOperationException("Native terminal is unavailable for publication.");
    cancellationToken.ThrowIfCancellationRequested();
    _released = true;
    var terminal = _terminal; _terminal = null;
    await forward(terminal);
  }

  private bool Process(byte[] frame)
  {
    if (_terminal is not null || _released) { Invalidate(); throw new InvalidOperationException("Events followed the native terminal."); }
    JsonObject? item;
    try
    {
      var data = string.Join("\n", StrictUtf8.GetString(frame).Split('\n').Select(line => line.TrimEnd('\r')).Where(line => line.StartsWith("data:", StringComparison.Ordinal)).Select(line => line[5..].StartsWith(' ') ? line[6..] : line[5..]));
      if (data.Length == 0) return false;
      _ = JsonSerializer.Deserialize(data, AGUIJsonSerializerContext.Default.BaseEvent) ?? throw new JsonException();
      item = JsonNode.Parse(data) as JsonObject ?? throw new JsonException();
    }
    catch (Exception exception) when (exception is JsonException or DecoderFallbackException or NotSupportedException)
    { Invalidate(); throw new IOException("Invalid native SSE event.", exception); }
    var type = Required(item, "type");
    if ((type is "RUN_STARTED" or "RUN_FINISHED") && (Required(item, "threadId") != _threadId || Required(item, "runId") != _runId) ||
        item["threadId"] is not null && item["threadId"]!.GetValue<string>() != _threadId ||
        item["runId"] is not null && item["runId"]!.GetValue<string>() != _runId)
    { Invalidate(); throw new InvalidOperationException("Native run identity mismatch."); }
    var terminal = type is "RUN_FINISHED" or "RUN_ERROR";
    if (terminal)
    {
      if (frame.Length > _maximumTerminalBytes) { Invalidate(); throw new IOException("Native terminal exceeds its byte bound."); }
      _terminal = frame; _terminalType = type;
      _terminalOutcome = type == "RUN_ERROR" ? "error" : item["outcome"]?["type"]?.GetValue<string>() ?? "success";
    }
    if (!_available) return terminal;
    try
    {
      if (!KnownFields(item, type) || item["metadata"] is not null || item["subagentRunId"] is not null || item["rawEvent"] is not null && !SupportedNativeRaw(item, type)) { Discard(); return terminal; }
      switch (type)
      {
        case "RUN_STARTED":
          if (item["protocolVersion"] is not null && item["protocolVersion"]!.GetValue<string>() != "1.0") Discard();
          break;
        case "STEP_STARTED": case "STEP_FINISHED": break;
        case "TEXT_MESSAGE_START":
          var id = Required(item, "messageId");
          if (!_messageIds.Add(id) || _historicalCallIds.Contains(id) || _calls.ContainsKey(id)) { Discard(); break; }
          var role = item["role"]?.GetValue<string>() ?? "assistant";
          if (role != "assistant") { Discard(); break; }
          var message = new JsonObject { ["id"] = id, ["role"] = role, ["content"] = "" };
          CopyName(item, message);
          _messages.Add(message); _texts.Add(id, message); _openTexts.Add(id);
          // The SDK keeps this correlation after TEXT_MESSAGE_END, tool starts and results until the attempt ends.
          _activeAssistantMessageId = id;
          break;
        case "TEXT_MESSAGE_CONTENT":
          var textId = Required(item, "messageId");
          if (_rawTexts.ContainsKey(textId) || !_texts.TryGetValue(textId, out var text) || !_openTexts.Contains(textId)) { Discard(); break; }
          text["content"] = text["content"]!.GetValue<string>() + item["delta"]!.GetValue<string>(); CopyName(item, text); break;
        case "TEXT_MESSAGE_END":
          var endId = Required(item, "messageId");
          if (_rawTexts.ContainsKey(endId) || !_openTexts.Remove(endId)) Discard();
          else CopyName(item, _texts[endId]);
          break;
        case "TOOL_CALL_START":
          var callId = Required(item, "toolCallId");
          var parent = item["parentMessageId"]?.GetValue<string>() ?? _activeAssistantMessageId ?? $"assistant-{callId}";
          if (string.IsNullOrWhiteSpace(parent) || parent == callId || _calls.ContainsKey(callId) || _historicalCallIds.Contains(callId) || _messageIds.Contains(callId) || _historicalCallIds.Contains(parent) || _calls.ContainsKey(parent)) { Discard(); break; }
          var assistant = _messages.OfType<JsonObject>().FirstOrDefault(message => message["id"]?.GetValue<string>() == parent);
          if (assistant is null)
          {
            assistant = new JsonObject { ["id"] = parent, ["role"] = "assistant", ["content"] = "", ["toolCalls"] = new JsonArray() };
            _messageIds.Add(parent); _messages.Add(assistant);
          }
          if (assistant["role"]?.GetValue<string>() != "assistant") { Discard(); break; }
          assistant["toolCalls"] ??= new JsonArray();
          var call = new JsonObject { ["id"] = callId, ["type"] = "function", ["function"] = new JsonObject { ["name"] = Required(item, "toolCallName"), ["arguments"] = "" } };
          CopyName(item, call);
          ((JsonArray)assistant["toolCalls"]!).Add(call); _calls.Add(callId, call); _callParents.Add(callId, parent); _openCalls.Add(callId); break;
        case "TOOL_CALL_ARGS":
          var argsId = Required(item, "toolCallId");
          if (!_calls.TryGetValue(argsId, out var argsCall) || !_openCalls.Contains(argsId)) { Discard(); break; }
          argsCall["function"]!["arguments"] = argsCall["function"]!["arguments"]!.GetValue<string>() + item["delta"]!.GetValue<string>(); CopyName(item, argsCall); break;
        case "TOOL_CALL_END":
          var endedId = Required(item, "toolCallId");
          if (!_openCalls.Remove(endedId) || !DeferredArgumentsAgree(endedId) || JsonNode.Parse(_calls[endedId]["function"]!["arguments"]!.GetValue<string>()) is not JsonObject) { Discard(); break; }
          _rawCalls.Remove(endedId); CopyName(item, _calls[endedId]); break;
        case "TOOL_CALL_RESULT":
          var resultId = Required(item, "toolCallId");
          var resultMessageId = Required(item, "messageId");
          if (item["rawEvent"] is not null) SeedOwnedHistoricalCall(resultId);
          if (item["role"] is not null && item["role"]!.GetValue<string>() != "tool" || !_calls.ContainsKey(resultId) || _openCalls.Contains(resultId) || !_answeredCalls.Add(resultId) || !_messageIds.Add(resultMessageId) || resultMessageId != resultId && (_calls.ContainsKey(resultMessageId) || _historicalCallIds.Contains(resultMessageId))) { Discard(); break; }
          var result = new JsonObject { ["id"] = resultMessageId, ["role"] = "tool", ["toolCallId"] = resultId, ["content"] = item["content"]!.DeepClone() };
          CopyName(item, result); if (item["error"] is not null) result["error"] = item["error"]!.DeepClone();
          _messages.Add(result); break;
        case "STATE_SNAPSHOT": _request!["state"] = item["snapshot"]?.DeepClone(); break;
        case "RUN_FINISHED":
          if (!SupportedTerminalUsage(item["usage"]) || (_terminalOutcome == "interrupt" ? !SupportedApprovalTerminal(item["outcome"]) : _terminalOutcome != "success" || CurrentPending().Any(approval => approval.Protected) || item["outcome"] is JsonObject outcome && outcome.Any(property => property.Key != "type"))) Discard();
          break;
        case "RUN_ERROR": break;
        default: Discard(); break;
      }
      CheckBound();
    }
    catch (Exception exception) when (exception is JsonException or InvalidOperationException or NullReferenceException or ArgumentException) { Discard(); }
    return terminal;
  }

  private IReadOnlyList<NativeProjectionApproval> CurrentPending() => _evidence?.Approvals.Where(item => item.Pending).ToArray() ?? [];
  /// <summary>Returns a location only from the completed genuine public fold.</summary>
  internal (string Parent, int MessageIndex, int CallIndex)? PublicLocation(string callId)
  {
    if (!Result.Available) return null;
    for (var messageIndex = 0; messageIndex < _messages.Count; messageIndex++)
      if (_messages[messageIndex] is JsonObject message && message["toolCalls"] is JsonArray calls)
        for (var callIndex = 0; callIndex < calls.Count; callIndex++)
          if (calls[callIndex]?["id"]?.GetValue<string>() == callId) return (Required(message, "id"), messageIndex, callIndex);
    return null;
  }
  private bool SupportedApprovalTerminal(JsonNode? node)
  {
    var expected = CurrentPending().Where(item => item.Protected).ToArray();
    if (expected.Length == 0 || node is not JsonObject outcome || outcome.Count != 2 || outcome["type"]?.GetValue<string>() != "interrupt" || outcome["interrupts"] is not JsonArray interrupts || interrupts.Count != expected.Length) return false;
    var seen = new HashSet<string>(StringComparer.Ordinal);
    foreach (var item in interrupts.OfType<JsonObject>())
    {
      if (item.Count != 5 || !seen.Add(Required(item, "id"))) return false;
      var approval = expected.SingleOrDefault(value => value.RequestId == Required(item, "id"));
      if (approval is null || item["reason"]?.GetValue<string>() != "tool_call" || item["message"]?.GetValue<string>() != "Approval required for tool call: " + approval.Name || item["toolCallId"]?.GetValue<string>() != approval.CallId ||
          !JsonNode.DeepEquals(item["responseSchema"], JsonNode.Parse("{\"type\":\"object\",\"properties\":{\"approved\":{\"type\":\"boolean\"}},\"required\":[\"approved\"]}"))) return false;
      if (!_calls.ContainsKey(approval.CallId) || _answeredCalls.Contains(approval.CallId)) return false;
    }
    return seen.Count == expected.Length;
  }
  private bool SeedOwnedHistoricalCall(string id)
  {
    if (_calls.ContainsKey(id)) return true;
    var approval = _evidence?.Approvals.SingleOrDefault(item => !item.Pending && item.CallId == id);
    if (approval is null || approval.PublicMessageIndex is not int messageIndex || approval.PublicCallIndex is not int callIndex || messageIndex >= _messages.Count || _messages[messageIndex] is not JsonObject message || Required(message, "id") != approval.PublicParent || message["role"]?.GetValue<string>() != "assistant" || message["toolCalls"] is not JsonArray calls || callIndex >= calls.Count || calls[callIndex] is not JsonObject call || Required(call, "id") != id ||
        call["function"]?["name"]?.GetValue<string>() != approval.Name || !JsonNode.DeepEquals(JsonNode.Parse(call["function"]!["arguments"]!.GetValue<string>()), JsonNode.Parse(approval.Arguments.GetRawText())) || _messages.Any(item => item?["role"]?.GetValue<string>() == "tool" && item["toolCallId"]?.GetValue<string>() == id)) return false;
    _calls.Add(id, call); _callParents.Add(id, approval.PublicParent!); return true;
  }
  private bool SupportedApprovalRaw(JsonNode item, string type, JsonObject raw)
  {
    if (type is not ("TOOL_CALL_START" or "TOOL_CALL_ARGS" or "TOOL_CALL_END" or "TOOL_CALL_RESULT") || raw["contents"] is not JsonArray contents || contents.Count is < 1 || contents.Count > _maximumMessages) return false;
    var approvals = _evidence?.Approvals ?? [];
    if (approvals.Count == 0) return false;
    var allowed = new HashSet<string>(["authorName", "role", "contents", "additionalProperties", "responseId", "messageId", "conversationId", "createdAt", "finishReason", "modelId", "continuationToken"], StringComparer.Ordinal);
    if (raw.Any(property => !allowed.Contains(property.Key)) || raw["additionalProperties"] is not null || raw["conversationId"] is not null || raw["continuationToken"] is not null || raw["finishReason"] is not null && (type == "TOOL_CALL_RESULT" || raw["finishReason"]!.GetValue<string>() != "tool_calls") || raw["role"]?.GetValue<string>() != (type == "TOOL_CALL_RESULT" ? "tool" : "assistant")) return false;
    var seen = new HashSet<string>(StringComparer.Ordinal); var selected = false;
    for (var index = 0; index < contents.Count; index++)
    {
      if (contents[index] is not JsonObject content || content["annotations"] is not null || content["additionalProperties"] is not null) return false;
      JsonObject call;
      NativeProjectionApproval? approval;
      if (content["$type"]?.GetValue<string>() == "toolApprovalRequest")
      {
        if (type == "TOOL_CALL_RESULT" || content.Any(property => property.Key is not ("$type" or "toolCall" or "requiresConfirmation" or "requestId" or "annotations" or "additionalProperties")) || content["toolCall"] is not JsonObject function) return false;
        approval = approvals.SingleOrDefault(value => value.Pending && value.Protected && value.RequestId == content["requestId"]?.GetValue<string>());
        if (approval is null || content["requiresConfirmation"]?.GetValue<bool>() != true) return false;
        call = function;
      }
      else
      {
        call = content;
        approval = approvals.SingleOrDefault(value => value.CallId == content["callId"]?.GetValue<string>() && (type == "TOOL_CALL_RESULT" ? !value.Pending : value.Pending && !value.Protected));
        if (approval is null) return false;
      }
      if (!seen.Add(approval.CallId) || call["callId"]?.GetValue<string>() != approval.CallId) return false;
      if (type == "TOOL_CALL_RESULT")
      {
        if (call["$type"]?.GetValue<string>() != "functionResult" || call.Any(property => property.Key is not ("$type" or "result" or "callId" or "annotations" or "additionalProperties")) || !SeedOwnedHistoricalCall(approval.CallId)) return false;
        if (_rawBatchResults.TryGetValue(approval.CallId, out var prior) && !JsonNode.DeepEquals(prior, call["result"])) return false;
        _rawBatchResults[approval.CallId] = call["result"]?.DeepClone();
        if (approval.CallId == item["toolCallId"]?.GetValue<string>())
        {
          if (item["content"] is not JsonValue canonical || !canonical.TryGetValue<string>(out var text) || !EquivalentResult(text, call["result"])) return false;
          selected = true;
        }
      }
      else
      {
        if (approval.ContentIndex != index || approval.NativeMessageId != raw["messageId"]?.GetValue<string>() || call["$type"]?.GetValue<string>() != "functionCall" || call["name"]?.GetValue<string>() != approval.Name || call["informationalOnly"]?.GetValue<bool>() != false || call["annotations"] is not null || call["additionalProperties"] is not null || call.Any(property => property.Key is not ("$type" or "name" or "arguments" or "informationalOnly" or "callId" or "annotations" or "additionalProperties")) || !JsonNode.DeepEquals(call["arguments"], JsonNode.Parse(approval.Arguments.GetRawText()))) return false;
        var parent = raw["messageId"]?.GetValue<string>() ?? _activeAssistantMessageId ?? $"assistant-{approval.CallId}";
        var obligation = new JsonObject { ["parentMessageId"] = parent, ["content"] = call.DeepClone() };
        if (_rawBatchCalls.TryGetValue(approval.CallId, out var prior) && !JsonNode.DeepEquals(prior, obligation)) return false;
        _rawBatchCalls[approval.CallId] = obligation;
        if (approval.CallId == item["toolCallId"]?.GetValue<string>())
        {
          if (type == "TOOL_CALL_START" && (item["toolCallName"]?.GetValue<string>() != approval.Name || item["parentMessageId"]?.GetValue<string>() != raw["messageId"]?.GetValue<string>())) return false;
          selected = true;
        }
      }
    }
    return selected;
  }

  private static bool KnownFields(JsonObject item, string type)
  {
    string[] fields = type switch
    {
      "RUN_STARTED" => ["threadId", "runId", "protocolVersion"],
      "RUN_FINISHED" => ["threadId", "runId", "outcome", "usage"],
      "RUN_ERROR" => ["message", "code", "threadId", "runId"],
      "STEP_STARTED" or "STEP_FINISHED" => ["stepName"],
      "TEXT_MESSAGE_START" => ["messageId", "role", "name"],
      "TEXT_MESSAGE_CONTENT" => ["messageId", "delta", "name"],
      "TEXT_MESSAGE_END" => ["messageId", "name"],
      "TOOL_CALL_START" => ["toolCallId", "toolCallName", "parentMessageId", "name"],
      "TOOL_CALL_ARGS" => ["toolCallId", "delta", "name"],
      "TOOL_CALL_END" => ["toolCallId", "name"],
      "TOOL_CALL_RESULT" => ["toolCallId", "messageId", "content", "role", "error", "name"],
      "STATE_SNAPSHOT" => ["snapshot"],
      _ => [],
    };
    return item.All(property => property.Value is null || property.Key is "type" or "timestamp" or "rawEvent" || fields.Contains(property.Key, StringComparer.Ordinal));
  }

  // TokenUsage contains only the pinned accounting labels/counts. It stays in the bounded genuine terminal, never the transcript.
  private bool SupportedTerminalUsage(JsonNode? usage)
  {
    if (usage is null) return true;
    if (usage is not JsonArray entries || entries.Count > _maximumMessages) return false;
    foreach (var node in entries)
    {
      if (node is not JsonObject entry) return false;
      foreach (var property in entry)
      {
        switch (property.Key)
        {
          case "provider":
          case "model":
            if (property.Value is not null && (property.Value is not JsonValue label || !label.TryGetValue<string>(out _))) return false;
            break;
          case "inputTokens":
          case "outputTokens":
          case "totalTokens":
          case "reasoningTokens":
          case "cachedInputTokens":
          case "cacheWriteInputTokens":
            if (property.Value is not null && (property.Value is not JsonValue count || !count.TryGetValue<long>(out var value) || value < 0 || value > 9007199254740991L)) return false;
            break;
          default: return false;
        }
      }
    }
    return true;
  }

  private static string Required(JsonNode node, string property) => !string.IsNullOrWhiteSpace(node[property]?.GetValue<string>()) ? node[property]!.GetValue<string>() : throw new JsonException($"Missing {property}.");
  private static void CopyName(JsonNode source, JsonObject target) { if (source["name"] is not null) target["name"] = source["name"]!.DeepClone(); }
  private void CheckBound()
  {
    if (_messages.Count > _maximumMessages || _request is not null && Encoding.UTF8.GetByteCount(_request.ToJsonString()) + _rawCalls.Values.Concat(_rawTexts.Values).Sum(raw => Encoding.UTF8.GetByteCount(raw.ToJsonString())) +
        _rawBatchCalls.Sum(pair => Encoding.UTF8.GetByteCount(pair.Key) + Encoding.UTF8.GetByteCount(pair.Value.ToJsonString())) +
        _rawBatchResults.Sum(pair => Encoding.UTF8.GetByteCount(pair.Key) + Encoding.UTF8.GetByteCount(pair.Value?.ToJsonString() ?? "null")) > _maximumBytes) Discard();
  }
  private void Discard()
  {
    _available = false; _request = null; _messages = []; _texts.Clear(); _calls.Clear(); _rawTexts.Clear(); _rawCalls.Clear(); _callParents.Clear(); _rawBatchCalls.Clear(); _rawBatchResults.Clear(); _messageIds.Clear(); _historicalCallIds.Clear(); _openTexts.Clear(); _openCalls.Clear(); _answeredCalls.Clear();
    _activeAssistantMessageId = null; _result = null;
  }
  private void Invalidate() { Discard(); _invalid = true; _frame.Clear(); _terminal = null; }
  private bool SupportedNativeRaw(JsonNode item, string type)
  {
    try { return item["rawEvent"] is JsonObject raw && DiagnosticTypes(raw) && (SupportedNativeTextRaw(item, type) || SupportedApprovalRaw(item, type, raw) || SupportedNativeToolRaw(item, type)); }
    catch (Exception exception) when (exception is JsonException or InvalidOperationException or FormatException or ArgumentException) { return false; }
  }

  private static bool DiagnosticTypes(JsonObject raw)
  {
    if (raw["modelId"] is not null && (raw["modelId"] is not JsonValue model || !model.TryGetValue<string>(out _))) return false;
    if (raw["createdAt"] is null) return true;
    return raw["createdAt"] is JsonValue created && created.TryGetValue<string>(out var text) &&
        DateTimeOffset.TryParse(text, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.RoundtripKind, out _);
  }

  private bool DeferredArgumentsAgree(string callId)
  {
    if (!_rawCalls.TryGetValue(callId, out var expected)) return true;
    if (!_calls.TryGetValue(callId, out var call)) return false;
    try { return JsonNode.DeepEquals(JsonNode.Parse(call["function"]!["arguments"]!.GetValue<string>()), expected["contents"]![0]!["arguments"]); }
    catch (JsonException) { return false; }
  }

  // This installed hosting version attaches redundant MEAI ChatResponseUpdate diagnostics to text events.
  // Only the exact text-only shape is supported; provider continuation/reasoning/annotation data is not discarded.
  private bool SupportedNativeTextRaw(JsonNode item, string type)
  {
    if (type is not ("TEXT_MESSAGE_START" or "TEXT_MESSAGE_CONTENT") || item["rawEvent"] is not JsonObject raw) return false;
    var id = item["messageId"]?.GetValue<string>();
    var message = id is not null && _texts.TryGetValue(id, out var existing) ? existing : null;
    var role = item["role"]?.GetValue<string>() ?? message?["role"]?.GetValue<string>();
    var name = item["name"]?.GetValue<string>() ?? message?["name"]?.GetValue<string>();
    if (raw["messageId"]?.GetValue<string>() != id || !EquivalentResponseId(raw, id) || raw["role"]?.GetValue<string>() != role || raw["authorName"]?.GetValue<string>() != name) return false;
    var allowed = new HashSet<string>(["authorName", "role", "contents", "additionalProperties", "responseId", "messageId", "conversationId", "createdAt", "finishReason", "modelId", "continuationToken"], StringComparer.Ordinal);
    if (raw.Any(property => !allowed.Contains(property.Key)) || raw["additionalProperties"] is not null || raw["conversationId"] is not null || raw["finishReason"] is not null || raw["continuationToken"] is not null) return false;
    if (raw["contents"] is not JsonArray { Count: 1 } contents || contents[0] is not JsonObject content) return false;
    if (content.Any(property => property.Key is not ("$type" or "text" or "annotations" or "additionalProperties")) || content["$type"]?.GetValue<string>() != "text" || content["annotations"] is not null || content["additionalProperties"] is not null) return false;
    var diagnosticText = content["text"]?.GetValue<string>();
    if (type == "TEXT_MESSAGE_START")
    {
      if (diagnosticText == "") return true;
      if (string.IsNullOrEmpty(diagnosticText) || id is null || _rawTexts.ContainsKey(id)) return false;
      // EquivalentResponseId already requires trusted evidence for aliases. Pinned hosting can reuse a nonempty update
      // for START and CONTENT even with identical IDs; require exact subsequent diagnostic and canonical-text agreement.
      _rawTexts.Add(id, (JsonObject)raw.DeepClone());
      return true;
    }
    if (id is not null && _rawTexts.Remove(id, out var first) && !JsonNode.DeepEquals(first, raw)) return false;
    return diagnosticText == item["delta"]?.GetValue<string>();
  }

  // Native server-tool rounds use redundant functionCall/functionResult ChatResponseUpdate diagnostics.
  // Argument equivalence is deferred until END so canonical streamed fragments are preserved exactly.
  private bool SupportedNativeToolRaw(JsonNode item, string type)
  {
    if (type is not ("TOOL_CALL_START" or "TOOL_CALL_ARGS" or "TOOL_CALL_END" or "TOOL_CALL_RESULT") || item["rawEvent"] is not JsonObject raw) return false;
    if (raw["contents"] is JsonArray { Count: > 1 } contents) return SupportedNativeToolBatchRaw(item, type, raw, contents);
    return SupportedNativeSingleToolRaw(item, type, raw);
  }

  private bool SupportedNativeToolBatchRaw(JsonNode item, string type, JsonObject raw, JsonArray contents)
  {
    if (contents.Count > _maximumMessages) return false;
    var resultBatch = type == "TOOL_CALL_RESULT";
    bool? informationalBatch = null;
    var seen = new HashSet<string>(StringComparer.Ordinal);
    JsonObject? selected = null;
    foreach (var node in contents)
    {
      if (node is not JsonObject content || content["annotations"] is not null || content["additionalProperties"] is not null) return false;
      var id = Required(content, "callId");
      if (!seen.Add(id)) return false;
      if (resultBatch)
      {
        if (content["$type"]?.GetValue<string>() != "functionResult" ||
            content.Any(property => property.Key is not ("$type" or "result" or "callId" or "annotations" or "additionalProperties")) ||
            !_calls.TryGetValue(id, out var call) || _openCalls.Contains(id) ||
            _evidence?.OwnsCall(id, call["function"]!["name"]!.GetValue<string>(), JsonNode.Parse(call["function"]!["arguments"]!.GetValue<string>())) != true) return false;
        if (_rawBatchResults.TryGetValue(id, out var expected))
        {
          if (!JsonNode.DeepEquals(expected, content["result"])) return false;
        }
        else
        {
          if (_rawBatchResults.Count >= _maximumMessages) return false;
          _rawBatchResults.Add(id, content["result"]?.DeepClone());
        }
      }
      else
      {
        if (content["$type"]?.GetValue<string>() != "functionCall" || content["informationalOnly"] is not JsonValue flag || !flag.TryGetValue<bool>(out var informationalOnly) || content["arguments"] is not JsonObject ||
            content.Any(property => property.Key is not ("$type" or "name" or "arguments" or "informationalOnly" or "callId" or "annotations" or "additionalProperties"))) return false;
        if (informationalBatch is not null && informationalBatch != informationalOnly) return false;
        informationalBatch = informationalOnly;
        // Diagnostic siblings are obligations only: server announcements require owned descriptors;
        // ordinary model calls must all name admitted browser tools and gain no execution authority.
        if (informationalOnly ? _evidence?.OwnsCall(id, Required(content, "name"), content["arguments"]) != true : !_browserTools.Contains(Required(content, "name"))) return false;
        var parent = Required(raw, "messageId");
        if (_rawBatchCalls.TryGetValue(id, out var expected))
        {
          if (Required(expected, "parentMessageId") != parent || !JsonNode.DeepEquals(expected["content"], content)) return false;
        }
        else
        {
          if (_rawBatchCalls.Count >= _maximumMessages) return false;
          _rawBatchCalls.Add(id, new JsonObject { ["parentMessageId"] = parent, ["content"] = content.DeepClone() });
        }
      }
      if (id == item["toolCallId"]?.GetValue<string>()) selected = content;
    }
    if (selected is null) return false;
    // Retain only the selected diagnostic, never one full sibling batch for each canonical event.
    var normalized = new JsonObject();
    foreach (var property in raw)
      if (property.Key != "contents") normalized.Add(property.Key, property.Value?.DeepClone());
    normalized["contents"] = new JsonArray(selected.DeepClone());
    return SupportedNativeSingleToolRaw(item, type, normalized);
  }

  private bool BatchObligationsAgree()
  {
    try
    {
      foreach (var (id, expected) in _rawBatchCalls)
      {
        if (!_calls.TryGetValue(id, out var call) || _openCalls.Contains(id) || !_callParents.TryGetValue(id, out var parent) || parent != Required(expected, "parentMessageId") ||
            call["function"]!["name"]!.GetValue<string>() != Required(expected["content"]!, "name") ||
            !JsonNode.DeepEquals(JsonNode.Parse(call["function"]!["arguments"]!.GetValue<string>()), expected["content"]!["arguments"])) return false;
      }
      foreach (var (id, expected) in _rawBatchResults)
      {
        if (!_answeredCalls.Contains(id)) return false;
        var result = _messages.OfType<JsonObject>().FirstOrDefault(message => message["role"]?.GetValue<string>() == "tool" && message["toolCallId"]?.GetValue<string>() == id);
        if (result?["content"] is not JsonValue content || !content.TryGetValue<string>(out var text) || !EquivalentResult(text, expected)) return false;
      }
      return true;
    }
    catch (Exception exception) when (exception is JsonException or InvalidOperationException or ArgumentException) { return false; }
  }

  private static bool EquivalentResult(string text, JsonNode? result)
  {
    if (result is JsonValue value && value.TryGetValue<string>(out var resultText) && resultText == text) return true;
    try { return JsonNode.DeepEquals(JsonNode.Parse(text), result); }
    catch (JsonException) { return false; }
  }

  private bool SupportedNativeSingleToolRaw(JsonNode item, string type, JsonObject raw)
  {
    var allowed = new HashSet<string>(["authorName", "role", "contents", "additionalProperties", "responseId", "messageId", "conversationId", "createdAt", "finishReason", "modelId", "continuationToken"], StringComparer.Ordinal);
    if (raw.Any(property => !allowed.Contains(property.Key)) || raw["additionalProperties"] is not null || raw["conversationId"] is not null || raw["continuationToken"] is not null ||
        raw["contents"] is not JsonArray { Count: 1 } contents || contents[0] is not JsonObject content) return false;
    var callId = item["toolCallId"]?.GetValue<string>();
    if (string.IsNullOrWhiteSpace(callId) || content["callId"]?.GetValue<string>() != callId || content["annotations"] is not null || content["additionalProperties"] is not null) return false;
    var nativeCall = _evidence?.MatchesCall(raw["responseId"]?.GetValue<string>(), callId, content["name"]?.GetValue<string>(), content["arguments"]) == true;
    // Native function items have an output ID and call ID, but MEAI can leave MessageId and FinishReason null.
    var anonymousNativeCall = nativeCall && raw["messageId"] is null;
    if (!anonymousNativeCall && (string.IsNullOrWhiteSpace(raw["messageId"]?.GetValue<string>()) || !EquivalentResponseId(raw, raw["messageId"]?.GetValue<string>()))) return false;
    if (type == "TOOL_CALL_RESULT")
    {
      if (!_calls.ContainsKey(callId) || raw["role"]?.GetValue<string>() != "tool" || raw["finishReason"] is not null || content["$type"]?.GetValue<string>() != "functionResult" || content.Any(property => property.Key is not ("$type" or "result" or "callId" or "annotations" or "additionalProperties"))) return false;
      if (item["content"] is not JsonValue canonical || !canonical.TryGetValue<string>(out var text)) return false;
      return EquivalentResult(text, content["result"]);
    }
    if (raw["role"]?.GetValue<string>() != "assistant" || content["$type"]?.GetValue<string>() != "functionCall" || content["arguments"] is not JsonObject ||
        content.Any(property => property.Key is not ("$type" or "name" or "arguments" or "informationalOnly" or "callId" or "annotations" or "additionalProperties"))) return false;
    var informationalOnly = content["informationalOnly"]?.GetValue<bool>();
    if (informationalOnly == false)
    {
      if (raw["finishReason"]?.GetValue<string>() != "tool_calls" && !(nativeCall && raw["finishReason"] is null)) return false;
    }
    else
    {
      // Pinned MAF announces owned server calls with matching IDs: immediate tool_calls or deferred null finish.
      // Provider evidence also covers browser calls, so only the separate current owned server descriptor permits this shape.
      if (informationalOnly != true || raw["finishReason"] is not null && raw["finishReason"]!.GetValue<string>() != "tool_calls" || string.IsNullOrWhiteSpace(raw["messageId"]?.GetValue<string>()) ||
          raw["responseId"]?.GetValue<string>() != raw["messageId"]?.GetValue<string>() ||
          _evidence?.OwnsCall(callId, content["name"]?.GetValue<string>(), content["arguments"]) != true) return false;
    }
    if (type == "TOOL_CALL_START")
    {
      if (content["name"]?.GetValue<string>() != item["toolCallName"]?.GetValue<string>() || (raw["messageId"]?.GetValue<string>() != item["parentMessageId"]?.GetValue<string>() && !(anonymousNativeCall && item["parentMessageId"] is null)) || _rawCalls.ContainsKey(callId)) return false;
      _rawCalls.Add(callId, (JsonObject)raw.DeepClone());
      return true;
    }
    // Anonymous witnessed diagnostics have no parent identity; the START's canonical assistant correlation owns it.
    if (!_rawCalls.TryGetValue(callId, out var first) || !JsonNode.DeepEquals(first, raw) || !_calls.TryGetValue(callId, out var call) || !_callParents.TryGetValue(callId, out var parent) ||
        (raw["messageId"]?.GetValue<string>() != parent && !anonymousNativeCall) || call["function"]?["name"]?.GetValue<string>() != content["name"]?.GetValue<string>()) return false;
    if (type != "TOOL_CALL_END") return true;
    try { return JsonNode.DeepEquals(JsonNode.Parse(call["function"]!["arguments"]!.GetValue<string>()), content["arguments"]); }
    catch (JsonException) { return false; }
  }

  private bool EquivalentResponseId(JsonObject raw, string? messageId) =>
      raw["responseId"]?.GetValue<string>() == messageId || _evidence?.Matches(raw["responseId"]?.GetValue<string>(), messageId) == true;
}
