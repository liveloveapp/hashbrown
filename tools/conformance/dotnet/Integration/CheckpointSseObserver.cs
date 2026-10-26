using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using AGUI.Abstractions;

namespace Hashbrown.Conformance.Integration;

/// <summary>Bounded incremental UTF-8 SSE capture of native canonical messages. Unsupported meaningful events fail closed.</summary>
internal sealed class CheckpointSseObserver
{
    private readonly CheckpointCaptureHandle _handle;
    private readonly Func<string, string?, ValueTask> _commit;
    private readonly List<byte> _frame = [];
    private readonly Dictionary<string, JsonObject> _texts = new(StringComparer.Ordinal);
    private readonly Dictionary<string, JsonObject> _calls = new(StringComparer.Ordinal);
    private readonly Dictionary<string, JsonObject> _rawCalls = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _callParents = new(StringComparer.Ordinal);
    private readonly HashSet<string> _openTexts = new(StringComparer.Ordinal);
    private readonly HashSet<string> _openCalls = new(StringComparer.Ordinal);
    private readonly HashSet<string> _answeredCalls = new(StringComparer.Ordinal);
    private JsonArray _messages = [];
    private JsonNode? _state;
    private bool _available = true;
    private bool _terminal;
    private int _newlines;
    private Func<ReadOnlyMemory<byte>, ValueTask>? _forward;
    private long _observed;
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);

    internal CheckpointSseObserver(CheckpointCaptureHandle handle, Func<string, string?, ValueTask> commit)
    {
        _handle = handle;
        _commit = commit;
        if (handle.OriginalRequest is null) { Discard(); return; }
        var original = JsonNode.Parse(handle.OriginalRequest)!;
        _messages = (JsonArray)original["messages"]!.DeepClone();
        _state = original["state"]?.DeepClone();
    }

    internal async ValueTask ObserveAsync(ReadOnlyMemory<byte> bytes, Func<ReadOnlyMemory<byte>, ValueTask> forward, CancellationToken cancellationToken)
    {
        _forward = forward;
        for (var index = 0; index < bytes.Length; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var value = bytes.Span[index];
            _observed++;
            if (_observed > (long)_handle.MaximumBytes * 8) Discard();
            if (value == 10) _newlines++;
            else if (value != 13) _newlines = 0;
            var boundary = value == 10 && _newlines >= 2;
            _frame.Add(value);
            if (_frame.Count > _handle.MaximumBytes)
            {
                Discard(); _frame.Clear();
                // An unparsed oversized frame might be a successful terminal: it can never be passed through.
                throw new IOException("Checkpoint SSE frame exceeds the bounded observation limit.");
            }
            if (boundary)
            {
                var frame = _frame.ToArray();
                _frame.Clear(); _newlines = 0;
                await ProcessAsync(frame);
                await forward(frame);
            }
        }
    }

    private void Discard()
    {
        _available = false;
        _messages.Clear(); _state = null; _texts.Clear(); _calls.Clear();
        _openTexts.Clear(); _openCalls.Clear(); _answeredCalls.Clear(); _rawCalls.Clear(); _callParents.Clear();
    }

    private async ValueTask ProcessAsync(byte[] frame)
    {
        string data;
        try
        {
            data = string.Join("\n", StrictUtf8.GetString(frame).Split('\n').Select(line => line.TrimEnd('\r')).Where(line => line.StartsWith("data:", StringComparison.Ordinal)).Select(line => line[5..].TrimStart(' ')));
            if (data.Length == 0) return;
            _ = JsonSerializer.Deserialize(data, AGUIJsonSerializerContext.Default.BaseEvent) ?? throw new JsonException();
        }
        catch (Exception exception) when (exception is JsonException or DecoderFallbackException or NotSupportedException) { Discard(); return; }
        var item = JsonNode.Parse(data)!;
        var type = item["type"]!.GetValue<string>();
        if (!_available && type is not ("RUN_FINISHED" or "RUN_ERROR")) return;
        if (item["subagentRunId"] is not null || item["rawEvent"] is not null && !SupportedNativeRaw(item, type) || item["metadata"] is not null) Discard();
        if (!_available && type is not ("RUN_FINISHED" or "RUN_ERROR")) return;
        if (_terminal) { Discard(); throw new InvalidOperationException("Events followed a terminal checkpoint event."); }
        try
        {
            switch (type)
            {
                case "RUN_STARTED": case "STEP_STARTED": case "STEP_FINISHED": break;
                case "TEXT_MESSAGE_START":
                    var id = item["messageId"]!.GetValue<string>();
                    if (_texts.ContainsKey(id) || _messages.Any(message => message?["id"]?.GetValue<string>() == id)) { Discard(); break; }
                    var message = new JsonObject { ["id"] = id, ["role"] = item["role"]?.DeepClone() ?? JsonValue.Create("assistant"), ["content"] = "" };
                    if (item["name"] is not null) message["name"] = item["name"]!.DeepClone();
                    _messages.Add(message); _texts.Add(id, message); _openTexts.Add(id); break;
                case "TEXT_MESSAGE_CONTENT":
                    var textId = item["messageId"]!.GetValue<string>();
                    if (!_texts.TryGetValue(textId, out var text) || !_openTexts.Contains(textId)) { Discard(); break; }
                    text["content"] = (text["content"]?.GetValue<string>() ?? "") + item["delta"]!.GetValue<string>(); break;
                case "TEXT_MESSAGE_END": if (!_openTexts.Remove(item["messageId"]!.GetValue<string>())) Discard(); break;
                case "TOOL_CALL_START":
                    var callId = item["toolCallId"]!.GetValue<string>();
                    var parent = item["parentMessageId"]?.GetValue<string>() ?? callId;
                    var assistant = _messages.OfType<JsonObject>().FirstOrDefault(message => message["id"]?.GetValue<string>() == parent);
                    if (assistant is null) { assistant = new JsonObject { ["id"] = parent, ["role"] = "assistant", ["toolCalls"] = new JsonArray() }; _messages.Add(assistant); }
                    if (item["rawEvent"]?["authorName"] is { } author) assistant["name"] ??= author.DeepClone();
                    _callParents[callId] = parent;
                    assistant["toolCalls"] ??= new JsonArray();
                    var call = new JsonObject { ["id"] = callId, ["type"] = "function", ["function"] = new JsonObject { ["name"] = item["toolCallName"]!.DeepClone(), ["arguments"] = "" } };
                    ((JsonArray)assistant["toolCalls"]!).Add(call);
                    if (!_calls.TryAdd(callId, call)) Discard();
                    _openCalls.Add(callId); break;
                case "TOOL_CALL_ARGS":
                    var argsId = item["toolCallId"]!.GetValue<string>();
                    if (!_calls.TryGetValue(argsId, out var argsCall) || !_openCalls.Contains(argsId)) { Discard(); break; }
                    argsCall["function"]!["arguments"] = argsCall["function"]!["arguments"]!.GetValue<string>() + item["delta"]!.GetValue<string>(); break;
                case "TOOL_CALL_END":
                    var endedId = item["toolCallId"]!.GetValue<string>();
                    if (!_openCalls.Remove(endedId) || !DeferredArgumentsAgree(endedId)) Discard();
                    _rawCalls.Remove(endedId);
                    break;
                case "TOOL_CALL_RESULT":
                    var resultId = item["toolCallId"]!.GetValue<string>();
                    if (!_calls.ContainsKey(resultId) || !_answeredCalls.Add(resultId)) Discard();
                    _messages.Add(new JsonObject { ["id"] = item["messageId"]!.DeepClone(), ["role"] = "tool", ["toolCallId"] = resultId, ["content"] = item["content"]?.DeepClone() }); break;
                case "MESSAGES_SNAPSHOT":
                    // A replacement cannot erase an unfinished canonical event or bypass deferred diagnostic equivalence.
                    if (_openTexts.Count > 0 || _openCalls.Count > 0 || _rawCalls.Count > 0) { Discard(); break; }
                    _messages = (JsonArray)item["messages"]!.DeepClone(); _texts.Clear(); _calls.Clear(); _openTexts.Clear(); _openCalls.Clear(); _answeredCalls.Clear(); _rawCalls.Clear(); _callParents.Clear(); break;
                case "STATE_SNAPSHOT": _state = item["snapshot"]?.DeepClone(); break;
                case "RUN_ERROR": await TerminalAsync("Failed", false); break;
                case "RUN_FINISHED":
                    var outcome = item["outcome"]?["type"]?.GetValue<string>() ?? "success";
                    var success = outcome == "success";
                    if (item["outcome"]?["pendingToolCallIds"] is JsonArray { Count: > 0 }) Discard();
                    await TerminalAsync(success ? "Finished" : outcome == "interrupt" ? "Interrupted" : "Interrupted", success); break;
                default: Discard(); break;
            }
            var retainedBytes = Encoding.UTF8.GetByteCount(_messages.ToJsonString()) + (_state is null ? 0 : Encoding.UTF8.GetByteCount(_state.ToJsonString())) + _rawCalls.Values.Sum(raw => Encoding.UTF8.GetByteCount(raw.ToJsonString()));
            if (_messages.Count > _handle.MaximumMessages || retainedBytes > _handle.MaximumBytes) Discard();
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException or NullReferenceException or ArgumentException)
        {
            if (_terminal) throw;
            Discard();
        }
    }

    private bool SupportedNativeRaw(JsonNode item, string type)
    {
        try { return SupportedNativeTextRaw(item, type) || SupportedNativeToolRaw(item, type); }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException or FormatException or ArgumentException) { return false; }
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
        if (raw["messageId"]?.GetValue<string>() != id || raw["responseId"]?.GetValue<string>() != id || raw["role"]?.GetValue<string>() != role || raw["authorName"]?.GetValue<string>() != name) return false;
        var allowed = new HashSet<string>(["authorName", "role", "contents", "additionalProperties", "responseId", "messageId", "conversationId", "createdAt", "finishReason", "modelId", "continuationToken"], StringComparer.Ordinal);
        if (raw.Any(property => !allowed.Contains(property.Key)) || raw["additionalProperties"] is not null || raw["conversationId"] is not null || raw["finishReason"] is not null || raw["continuationToken"] is not null) return false;
        if (raw["contents"] is not JsonArray { Count: 1 } contents || contents[0] is not JsonObject content) return false;
        if (content.Any(property => property.Key is not ("$type" or "text" or "annotations" or "additionalProperties")) || content["$type"]?.GetValue<string>() != "text" || content["annotations"] is not null || content["additionalProperties"] is not null) return false;
        return content["text"]?.GetValue<string>() == (type == "TEXT_MESSAGE_START" ? "" : item["delta"]?.GetValue<string>());
    }

    // Native server-tool rounds use redundant functionCall/functionResult ChatResponseUpdate diagnostics.
    // Argument equivalence is deferred until END so canonical streamed fragments are preserved exactly.
    private bool SupportedNativeToolRaw(JsonNode item, string type)
    {
        if (type is not ("TOOL_CALL_START" or "TOOL_CALL_ARGS" or "TOOL_CALL_END" or "TOOL_CALL_RESULT") || item["rawEvent"] is not JsonObject raw) return false;
        var allowed = new HashSet<string>(["authorName", "role", "contents", "additionalProperties", "responseId", "messageId", "conversationId", "createdAt", "finishReason", "modelId", "continuationToken"], StringComparer.Ordinal);
        if (raw.Any(property => !allowed.Contains(property.Key)) || raw["additionalProperties"] is not null || raw["conversationId"] is not null || raw["continuationToken"] is not null ||
            string.IsNullOrWhiteSpace(raw["messageId"]?.GetValue<string>()) || raw["responseId"]?.GetValue<string>() != raw["messageId"]?.GetValue<string>() || raw["contents"] is not JsonArray { Count: 1 } contents || contents[0] is not JsonObject content) return false;
        var callId = item["toolCallId"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(callId) || content["callId"]?.GetValue<string>() != callId || content["annotations"] is not null || content["additionalProperties"] is not null) return false;
        if (type == "TOOL_CALL_RESULT")
        {
            if (!_calls.ContainsKey(callId) || raw["role"]?.GetValue<string>() != "tool" || raw["finishReason"] is not null || content["$type"]?.GetValue<string>() != "functionResult" || content.Any(property => property.Key is not ("$type" or "result" or "callId" or "annotations" or "additionalProperties"))) return false;
            if (item["content"] is not JsonValue canonical || !canonical.TryGetValue<string>(out var text)) return false;
            if (content["result"] is JsonValue result && result.TryGetValue<string>(out var resultText) && resultText == text) return true;
            try { return JsonNode.DeepEquals(JsonNode.Parse(text), content["result"]); }
            catch (JsonException) { return false; }
        }
        if (raw["role"]?.GetValue<string>() != "assistant" || raw["finishReason"]?.GetValue<string>() != "tool_calls" || content["$type"]?.GetValue<string>() != "functionCall" || content["informationalOnly"]?.GetValue<bool>() != false || content["arguments"] is not JsonObject ||
            content.Any(property => property.Key is not ("$type" or "name" or "arguments" or "informationalOnly" or "callId" or "annotations" or "additionalProperties"))) return false;
        if (type == "TOOL_CALL_START")
        {
            if (content["name"]?.GetValue<string>() != item["toolCallName"]?.GetValue<string>() || raw["messageId"]?.GetValue<string>() != item["parentMessageId"]?.GetValue<string>() || _rawCalls.ContainsKey(callId)) return false;
            _rawCalls.Add(callId, (JsonObject)raw.DeepClone());
            return true;
        }
        if (!_rawCalls.TryGetValue(callId, out var first) || !JsonNode.DeepEquals(first, raw) || !_calls.TryGetValue(callId, out var call) || !_callParents.TryGetValue(callId, out var parent) ||
            raw["messageId"]?.GetValue<string>() != parent || call["function"]?["name"]?.GetValue<string>() != content["name"]?.GetValue<string>()) return false;
        if (type != "TOOL_CALL_END") return true;
        try { return JsonNode.DeepEquals(JsonNode.Parse(call["function"]!["arguments"]!.GetValue<string>()), content["arguments"]); }
        catch (JsonException) { return false; }
    }

    private async ValueTask TerminalAsync(string outcome, bool successful)
    {
        _terminal = true;
        string? snapshot = null;
        if (successful && _available && _openTexts.Count == 0 && _openCalls.Count == 0 && _calls.Keys.All(_answeredCalls.Contains))
        {
            // A native round trip validates canonical message shape before any persisted answer is acknowledged.
            var native = JsonSerializer.Deserialize(_handle.OriginalRequest!, AGUIJsonSerializerContext.Default.RunAgentInput)!;
            var canonicalInput = JsonNode.Parse(_handle.OriginalRequest!)!;
            canonicalInput["messages"] = _messages.DeepClone();
            _ = JsonSerializer.Deserialize(canonicalInput.ToJsonString(), AGUIJsonSerializerContext.Default.RunAgentInput) ?? throw new JsonException();
            if (_messages.Select(message => message?["id"]?.GetValue<string>()).Any(string.IsNullOrWhiteSpace) || _messages.Select(message => message?["id"]?.GetValue<string>()).Distinct(StringComparer.Ordinal).Count() != _messages.Count) Discard();
            var finalCalls = _messages.SelectMany(message => (message?["toolCalls"] as JsonArray ?? []).Select(call => call?["id"]?.GetValue<string>())).ToArray();
            var finalResults = _messages.Where(message => message?["role"]?.GetValue<string>() == "tool").Select(message => message?["toolCallId"]?.GetValue<string>()).ToArray();
            if (finalCalls.Any(id => id is null || finalResults.Count(result => result == id) != 1)) Discard();
            if (!_available) { await _commit(outcome, null); return; }
            var payload = new JsonObject { ["threadId"] = native.ThreadId, ["messages"] = _messages.DeepClone(), ["state"] = _state?.DeepClone(), ["interrupts"] = null };
            snapshot = payload.ToJsonString();
            if (Encoding.UTF8.GetByteCount(snapshot) > _handle.MaximumBytes) snapshot = null;
        }
        await _commit(outcome, snapshot);
    }

    internal async ValueTask FinishAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_frame.Count > 0) { var trailing = _frame.ToArray(); await ProcessAsync(trailing); if (_forward is not null) await _forward(trailing); _frame.Clear(); }
        if (!_terminal) await _commit("Unavailable", null);
    }
}
