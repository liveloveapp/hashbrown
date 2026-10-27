#pragma warning disable MAAI001 // Live-only history guard checks genuine pinned native approval content types.
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text;
using Microsoft.Agents.AI;
using AGUI.Abstractions;
using Microsoft.Extensions.AI;

namespace Hashbrown.Conformance.Testing;

/// <summary>Applies live-only budgets and tool policy immediately around the genuine native client.</summary>
public sealed class FixtureLiveModelClient(IChatClient inner, FixtureLiveGate state) : DelegatingChatClient(inner)
{
    private FunctionCallContent[] _nativeCalls = [];
    private string? _approvalCallId;
    private JsonElement _approvalArguments;
    private string? _initialApprovalHistory;
    private string? _postResultHistory;
    private int _postResultMessages;
    private readonly StringBuilder _approvalAnswer = new();
    private readonly StringBuilder _approvalInitialText = new();

    /// <inheritdoc />
    public override Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null,
        CancellationToken cancellationToken = default) => GetStreamingResponseAsync(messages, options, cancellationToken).ToChatResponseAsync(cancellationToken);

    /// <inheritdoc />
    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(IEnumerable<ChatMessage> messages,
        ChatOptions? options = null, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, state.Token);
        var configured = options?.Clone() ?? new ChatOptions();
        configured.MaxOutputTokens = 384;
        configured.Temperature = 0;
        var history = messages.ToArray();
        var tool = state.Group switch { "browser-tool" => "getWeather", "server-tool" => "lookupAirport", _ => null };
        var mixed = state.Group == "mixed-native-tools";
        var approval = state.Group == "native-approval";
        var approvalPhase = approval ? ValidateApprovalHistory(history) : 0;
        if (approval) tool = "lookupAirport";
        var hasResult = approval ? approvalPhase > 1 : mixed ? ValidateNativeHistory(history) : ValidateHistory(history, tool);
        configured.ToolMode = mixed && !hasResult ? ChatToolMode.RequireAny
            : tool is not null && !hasResult ? ChatToolMode.RequireSpecific(tool) : ChatToolMode.None;
        if (mixed) configured.AllowMultipleToolCalls = true;
        if (approval)
        {
            if (configured.Tools is null || configured.Tools.Count != 1 || configured.Tools[0].Name != "lookupAirport") throw new InvalidOperationException("LIVE_TOOL_INVALID");
            configured.AllowMultipleToolCalls = false;
        }
        if (tool is null && !mixed) configured.Tools = [];
        var emitted = new List<FunctionCallContent>();
        state.Dispatch();
        var failed = false;
        var completed = false;
        IAsyncEnumerator<ChatResponseUpdate>? iterator = null;
        try
        {
            try { iterator = InnerClient.GetStreamingResponseAsync(history, configured, linked.Token).GetAsyncEnumerator(linked.Token); }
            catch { failed = true; throw new InvalidOperationException("LIVE_PROVIDER_FAILED"); }
            while (true)
            {
                bool next;
                try { next = await iterator.MoveNextAsync(); }
                catch { failed = true; throw new InvalidOperationException(linked.IsCancellationRequested ? "LIVE_CANCELLED" : "LIVE_PROVIDER_FAILED"); }
                if (!next)
                {
                    if (mixed && !hasResult)
                    {
                        if (emitted.Count != 2 || emitted.Select(call => call.CallId).Distinct(StringComparer.Ordinal).Count() != 2 ||
                            !emitted.Select(call => call.Name).ToHashSet(StringComparer.Ordinal).SetEquals(["getWeather", "lookupAirport"]))
                            throw new InvalidOperationException("LIVE_TOOL_INVALID");
                        _nativeCalls = emitted.ToArray();
                        state.NativeCoEmission();
                    }
                    if (approval)
                    {
                        if (approvalPhase == 1)
                        {
                            if (emitted.Count != 1 || string.IsNullOrEmpty(emitted[0].CallId)) throw new InvalidOperationException("LIVE_TOOL_INVALID");
                            _approvalCallId = emitted[0].CallId;
                            _approvalArguments = JsonSerializer.SerializeToElement(emitted[0].Arguments).Clone();
                            state.Approval?.ModelCall(emitted[0]);
                        }
                        state.Approval?.ModelPhase(approvalPhase);
                    }
                    completed = true; break;
                }
                var update = iterator.Current;
                if (update.FinishReason == ChatFinishReason.Length) { failed = true; throw new InvalidOperationException("LIVE_OUTPUT_INCOMPLETE"); }
                if (mixed && !hasResult)
                {
                    foreach (var call in update.Contents.OfType<FunctionCallContent>())
                    {
                        if (string.IsNullOrEmpty(call.CallId) || call.Name is not ("getWeather" or "lookupAirport")) throw new InvalidOperationException("LIVE_TOOL_INVALID");
                        ValidateTool(new ChatResponseUpdate { Contents = [call] }, call.Name);
                        emitted.Add(call);
                    }
                }
                else
                {
                    ValidateTool(update, hasResult ? null : tool);
                    if (approval && approvalPhase == 1) { emitted.AddRange(update.Contents.OfType<FunctionCallContent>()); _approvalInitialText.Append(update.Text); }
                    if (approval && approvalPhase == 2) { _approvalAnswer.Append(update.Text); state.Approval?.ModelText(update.Text); }
                }
                state.Observe(update);
                yield return update;
                try { await state.AfterYieldAsync(update, linked.Token); }
                catch { failed = true; throw new InvalidOperationException(linked.IsCancellationRequested ? "LIVE_CANCELLED" : "LIVE_PROVIDER_FAILED"); }
            }
        }
        finally
        {
            var disposeFailed = false;
            if (iterator is not null)
            {
                try { await iterator.DisposeAsync(); }
                catch { disposeFailed = true; }
            }
            state.Finished(linked.IsCancellationRequested, failed || !completed || disposeFailed);
            if (disposeFailed) throw new InvalidOperationException(linked.IsCancellationRequested ? "LIVE_CANCELLED" : "LIVE_PROVIDER_FAILED");
        }
    }

    // This policy validates observations only. Native MAF still binds/approves/invokes the actual function.
    private int ValidateApprovalHistory(ChatMessage[] history)
    {
        var contents = history.SelectMany(message => message.Contents).ToArray();
        if (contents.Any(content => content is not (TextContent or FunctionCallContent or FunctionResultContent) || content is ToolApprovalRequestContent or ToolApprovalResponseContent or InterruptResponseContent)) throw new InvalidOperationException("LIVE_TOOL_INVALID");
        var calls = contents.OfType<FunctionCallContent>().ToArray();
        var results = contents.OfType<FunctionResultContent>().ToArray();
        if (state.Calls == 0)
        {
            if (calls.Length != 0 || results.Length != 0) throw new InvalidOperationException("LIVE_TOOL_INVALID");
            _initialApprovalHistory = ApprovalHistory(history);
            return 1;
        }
        if (state.Calls is not (1 or 2) || _approvalCallId is null || calls.Length != 1 || results.Length != 1 ||
            calls[0].CallId != _approvalCallId || calls[0].Name != "lookupAirport" || results[0].CallId != _approvalCallId ||
            !JsonNode.DeepEquals(JsonSerializer.SerializeToNode(calls[0].Arguments), JsonNode.Parse(_approvalArguments.GetRawText())))
            throw new InvalidOperationException("LIVE_TOOL_INVALID");
        ValidateNativeResult(results[0], "lookupAirport");
        if (state.Calls == 1)
        {
            if (history.Length < 3 || ApprovalHistory(history[..^2]) != _initialApprovalHistory ||
                history[^2].Role != ChatRole.Assistant || history[^2].Contents.Any(content => content is not (FunctionCallContent or TextContent)) || history[^2].Text != _approvalInitialText.ToString() ||
                history[^1].Role != ChatRole.Tool || history[^1].Contents.Any(content => content is not FunctionResultContent)) throw new InvalidOperationException("LIVE_TOOL_INVALID");
            _postResultHistory = ApprovalHistory(history); _postResultMessages = history.Length;
            return 2;
        }
        if (history.Length != _postResultMessages + 2 || ApprovalHistory(history[..^2]) != _postResultHistory ||
            history[^2].Role != ChatRole.Assistant || history[^2].Contents.Any(content => content is not TextContent) ||
            string.IsNullOrWhiteSpace(_approvalAnswer.ToString()) || history[^2].Text != _approvalAnswer.ToString() ||
            history[^1].Role != ChatRole.User || history[^1].Contents.Any(content => content is not TextContent) || string.IsNullOrWhiteSpace(history[^1].Text))
            throw new InvalidOperationException("LIVE_TOOL_INVALID");
        return 3;
    }

    private static string ApprovalHistory(IEnumerable<ChatMessage> messages) => JsonSerializer.Serialize(messages.Select(message => new
    {
        role = message.Role.Value,
        text = message.Text,
        calls = message.Contents.OfType<FunctionCallContent>().Select(call => new { call.CallId, call.Name, call.Arguments }),
        results = message.Contents.OfType<FunctionResultContent>().Select(result => new { result.CallId, Result = ApprovalResult(result.Result) }),
        unsupported = message.Contents.Count(content => content is not (TextContent or FunctionCallContent or FunctionResultContent))
    }));

    // Native persistence may materialize the same JSON result as a string or JsonElement; preserve its semantic value.
    private static JsonNode? ApprovalResult(object? result)
    {
        var node = JsonSerializer.SerializeToNode(result);
        if (node is JsonValue value && value.TryGetValue<string>(out var text)) node = JsonNode.Parse(text);
        return node is JsonObject resultObject ? new JsonObject(resultObject.OrderBy(pair => pair.Key, StringComparer.Ordinal).Select(pair => new KeyValuePair<string, JsonNode?>(pair.Key, pair.Value?.DeepClone()))) : node;
    }

    private bool ValidateNativeHistory(ChatMessage[] messages)
    {
        var calls = messages.SelectMany(message => message.Contents.OfType<FunctionCallContent>()).ToArray();
        var results = messages.SelectMany(message => message.Contents.OfType<FunctionResultContent>()).ToArray();
        if (state.Calls == 0)
        {
            if (calls.Length != 0 || results.Length != 0) throw new InvalidOperationException("LIVE_TOOL_INVALID");
            return false;
        }
        if (state.Calls != 1 || _nativeCalls.Length != 2 || calls.Length != 2 || results.Length != 2 ||
            results.Select(result => result.CallId).Distinct(StringComparer.Ordinal).Count() != 2)
            throw new InvalidOperationException("LIVE_TOOL_INVALID");
        foreach (var owned in _nativeCalls)
        {
            var call = calls.SingleOrDefault(call => call.CallId == owned.CallId);
            var result = results.SingleOrDefault(result => result.CallId == owned.CallId);
            if (call is null || result is null || call.Name != owned.Name) throw new InvalidOperationException("LIVE_TOOL_INVALID");
            ValidateHistory([new ChatMessage(ChatRole.Assistant, [call]), new ChatMessage(ChatRole.Tool, [result])], owned.Name);
            ValidateNativeResult(result, owned.Name);
        }
        state.NativeExactHistory();
        return true;
    }

    private static void ValidateNativeResult(FunctionResultContent result, string name)
    {
        try
        {
            var output = result.Result is string text ? JsonSerializer.Deserialize<JsonElement>(text)
                : JsonSerializer.SerializeToElement(result.Result);
            var valid = output.ValueKind == JsonValueKind.Object && (name == "getWeather"
                ? output.EnumerateObject().Count() == 3 && output.GetProperty("city").GetString() == "Paris" &&
                    output.GetProperty("temperatureC").GetDouble() == 21 && output.GetProperty("condition").GetString() == "sunny"
                : output.EnumerateObject().Count() == 2 && output.GetProperty("code").GetString() == "PDX" &&
                    output.GetProperty("name").GetString() == "Portland International Airport");
            if (!valid) throw new InvalidOperationException();
        }
        catch { throw new InvalidOperationException("LIVE_TOOL_INVALID"); }
    }

    private static bool ValidateHistory(ChatMessage[] messages, string? expected)
    {
        var results = messages.SelectMany(message => message.Contents.OfType<FunctionResultContent>()).ToArray();
        if (expected is null || results.Length == 0) return false;
        var calls = messages.SelectMany(message => message.Contents.OfType<FunctionCallContent>()).ToArray();
        if (results.Length != 1 || calls.Length != 1 || calls[0].Name != expected || calls[0].CallId != results[0].CallId)
            throw new InvalidOperationException("LIVE_TOOL_INVALID");
        ValidateTool(new ChatResponseUpdate { Contents = [calls[0]] }, expected);
        try
        {
            var output = results[0].Result is string text ? JsonSerializer.Deserialize<JsonElement>(text)
                : JsonSerializer.SerializeToElement(results[0].Result);
            var parameter = expected == "getWeather" ? "city" : "code";
            var value = expected == "getWeather" ? "Paris" : "PDX";
            if (output.ValueKind != JsonValueKind.Object || output.GetProperty(parameter).GetString() != value)
                throw new InvalidOperationException();
        }
        catch { throw new InvalidOperationException("LIVE_TOOL_INVALID"); }
        return true;
    }

    private static void ValidateTool(ChatResponseUpdate update, string? expected)
    {
        foreach (var call in update.Contents.OfType<FunctionCallContent>())
        {
            var parameter = expected == "getWeather" ? "city" : "code";
            var value = expected == "getWeather" ? "Paris" : "PDX";
            if (expected is null || call.Name != expected || call.Arguments is not { Count: 1 } arguments ||
                !arguments.TryGetValue(parameter, out var actual) || actual?.ToString() != value)
                throw new InvalidOperationException("LIVE_TOOL_INVALID");
        }
    }
}
