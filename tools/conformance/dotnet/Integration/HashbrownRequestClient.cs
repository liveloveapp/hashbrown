using System.Text.Json;
using System.Runtime.CompilerServices;
using AGUI.Abstractions;
using AGUI.Server;
using Microsoft.Extensions.AI;

namespace Hashbrown.Conformance.Integration;

/// <summary>Applies Hashbrown output semantics without modifying upstream request options.</summary>
public sealed class HashbrownRequestClient(IChatClient innerClient) : DelegatingChatClient(innerClient)
{
    /// <inheritdoc />
    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var configured = options?.Clone() ?? new ChatOptions();
        if (configured.TryGetRunAgentInput(out var input) && ReadSchema(input) is { } schema)
        {
            configured.ResponseFormat = ChatResponseFormat.ForJsonSchema(schema.Clone(), "hashbrown");
            configured.AdditionalProperties = new AdditionalPropertiesDictionary(configured.AdditionalProperties ?? [])
            {
                ["strict"] = true
            };
        }
        var browserTools = configured.TryGetRunAgentInput(out var run)
            ? (run.Tools ?? []).Select(tool => tool.Name).ToHashSet(StringComparer.Ordinal)
            : [];
        var sawBrowser = false;
        var sawServer = false;
        await foreach (var update in base.GetStreamingResponseAsync(messages, configured, cancellationToken).WithCancellation(cancellationToken))
        {
            foreach (var call in update.Contents.OfType<FunctionCallContent>())
            {
                sawBrowser |= browserTools.Contains(call.Name);
                sawServer |= !browserTools.Contains(call.Name);
            }
            if (sawBrowser && sawServer)
                throw new NotSupportedException("Request browser and server tools in separate model turns.");
            yield return update;
        }
    }

    /// <summary>Reads the optional native output schema from AG-UI forwarded properties.</summary>
    public static JsonElement? ReadSchema(RunAgentInput input)
    {
        if (input.ForwardedProperties is not { ValueKind: JsonValueKind.Object } forwarded ||
            !forwarded.TryGetProperty("hashbrown", out var hashbrown)) return null;
        if (hashbrown.ValueKind != JsonValueKind.Object) throw new ArgumentException("hashbrown must be an object.");
        if (!hashbrown.TryGetProperty("responseSchema", out var schema)) return null;
        if (schema.ValueKind != JsonValueKind.Object) throw new ArgumentException("responseSchema must be a JSON schema object.");
        return schema;
    }
}
