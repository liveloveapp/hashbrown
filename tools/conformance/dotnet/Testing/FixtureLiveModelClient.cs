using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Extensions.AI;

namespace Hashbrown.Conformance.Testing;

/// <summary>Applies live-only budgets and tool policy immediately around the genuine native client.</summary>
public sealed class FixtureLiveModelClient(IChatClient inner, FixtureLiveGate state) : DelegatingChatClient(inner)
{
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
        var hasResult = ValidateHistory(history, tool);
        configured.ToolMode = tool is not null && !hasResult ? ChatToolMode.RequireSpecific(tool) : ChatToolMode.None;
        if (tool is null) configured.Tools = [];
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
                if (!next) { completed = true; break; }
                var update = iterator.Current;
                if (update.FinishReason == ChatFinishReason.Length) { failed = true; throw new InvalidOperationException("LIVE_OUTPUT_INCOMPLETE"); }
                ValidateTool(update, hasResult ? null : tool);
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
