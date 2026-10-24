using System.Runtime.CompilerServices;
using Microsoft.Extensions.AI;

namespace Hashbrown.Conformance.Testing;

/// <summary>Opt-in pure application progress through the real native hosting adapter before protected preparation.</summary>
public sealed class FixtureProgressClient(IChatClient inner, Func<bool> enterPrelude) : DelegatingChatClient(inner)
{
    /// <inheritdoc />
    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        if (enterPrelude())
            yield return new ChatResponseUpdate(ChatRole.Assistant, "Preparing server action.") { MessageId = $"fixture-progress-{Guid.NewGuid():N}" };
        await foreach (var update in base.GetStreamingResponseAsync(messages, options, cancellationToken).WithCancellation(cancellationToken))
            yield return update;
    }
}
