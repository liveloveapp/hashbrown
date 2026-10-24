using System.Runtime.CompilerServices;
using System.Text.Json;
using AGUI.Abstractions;
using AGUI.Server;
using Microsoft.Extensions.AI;

namespace Hashbrown.Conformance.Integration;

/// <summary>Pauses an application-selected workflow using upstream native interrupt content.</summary>
public sealed class InterruptWorkflowClient(IChatClient innerClient, IInterruptStore store, WorkflowOperationRegistry registry,
    Func<RunAgentInput, WorkflowCheckpoint?> selectCheckpoint, Func<string> scope, Func<InterruptClaim?> currentClaim) : DelegatingChatClient(innerClient)
{
    private static readonly JsonElement Schema = JsonSerializer.SerializeToElement(new
    {
        type = "object",
        additionalProperties = false,
        required = new[] { "approved" },
        properties = new { approved = new { type = "boolean" } }
    });

    /// <inheritdoc />
    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        if (options is not null && options.TryGetRunAgentInput(out var input))
        {
            // These decisions are consumed by the application gate, not by the model.
            // MEAI otherwise lowers generic response content to an empty user message.
            if (input.Resume is { Count: > 0 })
            {
                messages = messages.Select(message => new ChatMessage(message.Role,
                    message.Contents.Where(content => content is not InterruptResponseContent).ToList())
                {
                    MessageId = message.MessageId,
                    AuthorName = message.AuthorName,
                    AdditionalProperties = message.AdditionalProperties
                }).Where(message => message.Contents.Count > 0);
            }
            if (input.Resume is { Count: > 0 } resume && resume.Any(entry => entry.Status == "cancelled" ||
                entry.Payload is { } payload && payload.TryGetProperty("approved", out var approved) && !approved.GetBoolean()))
            {
                yield return new ChatResponseUpdate(ChatRole.Assistant, "Action declined.");
                yield break;
            }
            if (input.Resume is not { Count: > 0 } && selectCheckpoint(input) is { } checkpoint)
            {
                var batch = await store.CreateAsync(scope(), input, checkpoint, cancellationToken);
                foreach (var id in batch.Ids)
                {
                    yield return new ChatResponseUpdate(ChatRole.Assistant, [new InterruptRequestContent(id)
                    {
                        Reason = "confirmation", Message = "Approve the pending server action?",
                        ResponseSchema = Schema, ExpiresAt = batch.ExpiresAt.ToString("O")
                    }]);
                }
                yield break;
            }
            if (input.Resume is { Count: > 0 })
            {
                var claim = currentClaim() ?? throw new InvalidOperationException("A server-created confirmation claim is required.");
                // MAF can call this client again for tool continuations within the same HTTP request.
                if (claim.EnterWorkflow())
                {
                    var operation = registry.Resolve(claim.Checkpoint);
                    await operation.Prepare(claim.Checkpoint.Parameters, cancellationToken);
                    cancellationToken.ThrowIfCancellationRequested();
                    if (!await store.TryStartEffectAsync(claim, cancellationToken))
                        throw new InvalidOperationException("The preparation claim is stale or its lease expired.");
                    await operation.Execute(claim.Checkpoint.Parameters, claim.EffectId, cancellationToken);
                    await store.FinishAsync(claim, InterruptFinish.Completed, cancellationToken);
                }
            }
        }
        await foreach (var update in base.GetStreamingResponseAsync(messages, options, cancellationToken).WithCancellation(cancellationToken))
            yield return update;
    }
}
