using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Extensions.AI;

namespace Hashbrown.Conformance.Testing;

/// <summary>Applies live-only budgets and tool policy immediately around the genuine native client.</summary>
public sealed class FixtureLiveModelClient(IChatClient inner, FixtureLiveGate state) : DelegatingChatClient(inner)
{
    private FunctionCallContent[] _nativeCalls = [];

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
        var hasResult = mixed ? ValidateNativeHistory(history) : ValidateHistory(history, tool);
        configured.ToolMode = mixed && !hasResult ? ChatToolMode.RequireAny
            : tool is not null && !hasResult ? ChatToolMode.RequireSpecific(tool) : ChatToolMode.None;
        if (mixed) configured.AllowMultipleToolCalls = true;
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
                else ValidateTool(update, hasResult ? null : tool);
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
