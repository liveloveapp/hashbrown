using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Extensions.AI;

namespace Hashbrown.Conformance.Testing;

/// <summary>Applies fixed recovery policy while forwarding genuine native inputs and update objects unchanged.</summary>
public sealed class FixtureLiveRecoveryClient(IChatClient inner, FixtureLiveRecoveryEvidence evidence) : DelegatingChatClient(inner)
{
    /// <inheritdoc />
    public override Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        GetStreamingResponseAsync(messages, options, cancellationToken).ToChatResponseAsync(cancellationToken);

    /// <inheritdoc />
    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(IEnumerable<ChatMessage> messages,
        ChatOptions? options = null, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, evidence.Token);
        var history = messages.ToArray();
        var snapshot = FixtureLiveRecoveryEvidence.History(history);
        if (snapshot.EnumerateArray().Any(message => message.GetProperty("unsupported").GetInt32() != 0))
            throw new InvalidOperationException("RECOVERY_HISTORY_INVALID");
        var calls = history.SelectMany(message => message.Contents.OfType<FunctionCallContent>()).ToArray();
        var results = history.SelectMany(message => message.Contents.OfType<FunctionResultContent>()).ToArray();
        var initial = calls.Length == 0 && results.Length == 0;
        if (evidence.Phase == "replacement" && initial || evidence.Phase == "original" && !initial)
            throw new InvalidOperationException("RECOVERY_HISTORY_INVALID");
        if (!initial)
        {
            ValidateCalls(calls);
            if (results.Length != 2 || results.Select(result => result.CallId).Distinct(StringComparer.Ordinal).Count() != 2 ||
                results.Any(result => !calls.Any(call => call.CallId == result.CallId))) throw new InvalidOperationException("RECOVERY_HISTORY_INVALID");
        }
        var configured = options?.Clone() ?? new ChatOptions();
        configured.MaxOutputTokens = 384;
        configured.Temperature = 0;
        configured.ToolMode = initial && evidence.Phase != "preflight" ? ChatToolMode.RequireAny : ChatToolMode.None;
        configured.AllowMultipleToolCalls = initial && evidence.Phase != "preflight";
        var index = evidence.Begin(history);
        var emitted = new List<FunctionCallContent>();
        var completed = false;
        var disposed = false;
        IAsyncEnumerator<ChatResponseUpdate>? iterator = null;
        try
        {
            iterator = InnerClient.GetStreamingResponseAsync(history, configured, linked.Token).GetAsyncEnumerator(linked.Token);
            while (await iterator.MoveNextAsync())
            {
                var update = iterator.Current;
                evidence.Update(index, update);
                emitted.AddRange(update.Contents.OfType<FunctionCallContent>());
                yield return update;
            }
            if (initial && evidence.Phase != "preflight") ValidateCalls(emitted.ToArray());
            else if (emitted.Count != 0) throw new InvalidOperationException("RECOVERY_TOOL_INVALID");
            completed = true;
        }
        finally
        {
            try { if (iterator is not null) await iterator.DisposeAsync(); disposed = true; }
            finally { evidence.Finish(index, completed, disposed, linked.IsCancellationRequested); }
        }
    }

    private static void ValidateCalls(FunctionCallContent[] calls)
    {
        if (calls.Length != 2 || calls.Select(call => call.CallId).Distinct(StringComparer.Ordinal).Count() != 2 ||
            !calls.Select(call => call.Name).ToHashSet(StringComparer.Ordinal).SetEquals(["getWeather", "lookupAirport"]))
            throw new InvalidOperationException("RECOVERY_TOOL_INVALID");
        foreach (var call in calls)
        {
            var argument = call.Name == "getWeather" ? "city" : "code";
            var expected = call.Name == "getWeather" ? "Paris" : "PDX";
            if (call.Arguments is not { Count: 1 } || !call.Arguments.TryGetValue(argument, out var actual) ||
                (actual is JsonElement element ? element.GetString() : actual as string) != expected)
                throw new InvalidOperationException("RECOVERY_TOOL_INVALID");
        }
    }
}
