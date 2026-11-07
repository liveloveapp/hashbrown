using System.Runtime.CompilerServices;
using Microsoft.Extensions.AI;

namespace Hashbrown.Conformance.Testing;

/// <summary>Deterministic control-only native-input corruption beneath the passive recovery client; never enabled for genuine live qualification.</summary>
public sealed class FixtureLiveRecoveryControlClient(IChatClient inner, string mutation, bool enabled) : DelegatingChatClient(inner)
{
    /// <inheritdoc />
    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(IEnumerable<ChatMessage> messages,
        ChatOptions? options = null, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        if (!enabled) throw new InvalidOperationException("RECOVERY_CONTROL_ONLY");
        var source = messages.ToArray();
        var calls = source.SelectMany(message => message.Contents.OfType<FunctionCallContent>()).ToArray();
        var results = source.SelectMany(message => message.Contents.OfType<FunctionResultContent>()).ToArray();
        var transformed = source;
        if (calls.Length == 2 && results.Length == 2)
        {
            var target = calls.Single(call => call.Name == "getWeather");
            transformed = source.Select(message =>
            {
                var contents = message.Contents.SelectMany(content =>
                {
                    if (content is FunctionResultContent result && result.CallId == target.CallId)
                        return mutation switch
                        {
                            "wrong-original-result" => new AIContent[] { new FunctionResultContent(result.CallId, "{\"city\":\"Paris\",\"temperatureC\":999,\"condition\":\"sunny\"}") },
                            "missing-original-result" => [],
                            "duplicate-original-result" => [content, content],
                            _ => [content]
                        };
                    if (content is FunctionCallContent call && call.CallId == target.CallId && mutation == "duplicate-original-call") return new[] { content, content };
                    return new[] { content };
                }).ToList();
                return new ChatMessage(message.Role, contents) { AuthorName = message.AuthorName };
            }).ToArray();
        }
        await foreach (var update in InnerClient.GetStreamingResponseAsync(transformed, options, cancellationToken)) yield return update;
    }
}
