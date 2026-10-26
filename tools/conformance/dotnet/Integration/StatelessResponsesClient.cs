#pragma warning disable OPENAI001 // Pinned native Responses SDK API is experimental.
using System.Runtime.CompilerServices;
using Microsoft.Extensions.AI;
using OpenAI.Responses;

namespace Hashbrown.Conformance.Integration;

/// <summary>Keeps native Responses history application-owned using fresh per-call options.</summary>
public sealed class StatelessResponsesClient(IChatClient innerClient) : DelegatingChatClient(innerClient)
{
    /// <inheritdoc />
    public override async Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var response = await base.GetResponseAsync(messages, Configure(options), cancellationToken);
        ResponsesRecoveryEvidence.Observe(response);
        return response;
    }

    /// <inheritdoc />
    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var completed = false;
        await foreach (var update in base.GetStreamingResponseAsync(messages, Configure(options), cancellationToken).WithCancellation(cancellationToken))
        {
            ResponsesRecoveryEvidence.Observe(update);
            completed |= update.RawRepresentation is StreamingResponseCompletedUpdate;
            yield return update;
        }
        if (!completed) throw new InvalidOperationException("The native Responses stream ended before successful completion.");
    }

    private static ChatOptions Configure(ChatOptions? options)
    {
        var configured = options?.Clone() ?? new ChatOptions();
        configured.ConversationId = null;
        configured.ContinuationToken = null;
        configured.AllowBackgroundResponses = false;
        configured.RawRepresentationFactory = _ => new CreateResponseOptions { StoredOutputEnabled = false };
        return configured;
    }
}
