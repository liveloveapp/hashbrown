#pragma warning disable MAAI001, MEAI001 // Pinned MAF public native approval/session APIs are experimental.
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using AGUI.Abstractions;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;

namespace Hashbrown.Conformance.Integration;

/// <summary>Bridges genuine owned native requests to generic public decisions without changing native execution history.</summary>
internal sealed class NativeApprovalAgent(AIAgent inner, NativeToolCatalog catalog, IHttpContextAccessor accessor, IReadOnlyList<AIFunction> registered, Action<string>? observer = null) : DelegatingAIAgent(inner), INativeSessionAgent
{
    NativeToolCatalog INativeSessionAgent.Catalog => catalog;
    bool INativeSessionAgent.SupportsApprovals => true;
    Action<string>? INativeSessionAgent.Observer => observer;
    protected override async IAsyncEnumerable<AgentResponseUpdate> RunCoreStreamingAsync(IEnumerable<ChatMessage> messages, AgentSession? session, AgentRunOptions? options, [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        NativeSessionObservation.Record(observer, "Run.Guard");
        var context = Context();
        context.RequireSession(session);
        if (!ReferenceEquals(context.Registration.Catalog, catalog)) throw new NativeSessionRequestException(409);
        var configured = ConfigureOptions(options, context.Input, catalog, registered);
        var restored = Restore(messages.ToArray(), context);
        context.Observe("Run.Forward");
        await foreach (var update in InnerAgent.RunStreamingAsync(restored, session, configured, context.Cancellation))
        {
            for (var index = 0; index < update.Contents.Count; index++)
                if (update.Contents[index] is ToolApprovalRequestContent request) context.ObserveApproval(request, update.MessageId, index);
            foreach (var result in update.Contents.OfType<FunctionResultContent>()) await context.ObserveApprovalResultAsync(result);
            var projected = new List<AIContent>();
            foreach (var content in update.Contents)
            {
                if (content is ToolApprovalRequestContent { RequiresConfirmation: false, ToolCall: FunctionCallContent call }) projected.Add(call);
                else if (content is FunctionCallContent callEcho && IsOwnedEcho(callEcho, context)) { }
                else projected.Add(content);
            }
            var publicUpdate = ProjectForPublic(update, projected);
            if (publicUpdate is not null) yield return publicUpdate;
        }
        await context.CaptureApprovalBatchAsync();
    }
    private NativeSessionContext Context()
    {
        var context = NativeSessionContext.Get(accessor.HttpContext) ?? throw new NativeSessionRequestException(409);
        if (!ReferenceEquals(context.Registration.Catalog, catalog)) throw new NativeSessionRequestException(409);
        return context;
    }
    protected override async ValueTask<AgentSession> CreateSessionCoreAsync(CancellationToken cancellationToken)
    {
        NativeSessionObservation.Record(observer, "Create.Guard");
        var context = Context(); context.RequireSessionPreparation(creating: true);
        context.Observe("Create.Forward");
        var session = await InnerAgent.CreateSessionAsync(context.Cancellation);
        context.Observe("Create.Completed");
        return session;
    }
    protected override async ValueTask<AgentSession> DeserializeSessionCoreAsync(JsonElement serializedSession, JsonSerializerOptions? jsonSerializerOptions, CancellationToken cancellationToken)
    {
        NativeSessionObservation.Record(observer, "Deserialize.Guard");
        var context = Context(); context.RequireSessionPreparation(creating: false);
        context.Observe("Deserialize.Forward");
        var session = await InnerAgent.DeserializeSessionAsync(serializedSession, jsonSerializerOptions, context.Cancellation);
        context.Observe("Deserialize.Completed");
        return session;
    }
    protected override async ValueTask<JsonElement> SerializeSessionCoreAsync(AgentSession session, JsonSerializerOptions? jsonSerializerOptions, CancellationToken cancellationToken)
    {
        NativeSessionObservation.Record(observer, "Serialize.Guard");
        var context = Context(); context.RequireSession(session);
        context.Observe("Serialize.Forward");
        var serialized = await InnerAgent.SerializeSessionAsync(session, jsonSerializerOptions, context.Cancellation);
        context.Observe("Serialize.Completed");
        return serialized;
    }
    protected override Task<AgentResponse> RunCoreAsync(IEnumerable<ChatMessage> messages, AgentSession? session, AgentRunOptions? options, CancellationToken cancellationToken) => throw new NotSupportedException("The native Hashbrown endpoint requires streaming execution.");

    /// <summary>Clones supported request options and restores original browser schemas above native default tool unioning.</summary>
    private static ChatClientAgentRunOptions ConfigureOptions(AgentRunOptions? options, RunAgentInput input, NativeToolCatalog catalog, IReadOnlyList<AIFunction> registered)
    {
        var configured = options is ChatClientAgentRunOptions native ? (ChatClientAgentRunOptions)native.Clone() : options is null ? new ChatClientAgentRunOptions() : options.GetType() == typeof(AgentRunOptions) ? new ChatClientAgentRunOptions
        {
            AdditionalProperties = options.AdditionalProperties is null ? null : new(options.AdditionalProperties),
            ContinuationToken = options.ContinuationToken,
            AllowBackgroundResponses = options.AllowBackgroundResponses,
            ResponseFormat = options.ResponseFormat
        } : throw new NativeSessionRequestException(503);
        configured.ChatOptions = configured.ChatOptions?.Clone() ?? new ChatOptions();
        var browser = (input.Tools ?? []).ToArray();
        if (browser.Select(tool => tool.Name).Distinct(StringComparer.Ordinal).Count() != browser.Length || browser.Any(tool => catalog.Contains(tool.Name))) throw new NativeSessionRequestException(400);
        var existing = (configured.ChatOptions.Tools ?? []).ToArray();
        if (existing.Select(tool => tool.Name).Distinct(StringComparer.Ordinal).Count() != existing.Length) throw new NativeSessionRequestException(503);
        foreach (var tool in existing)
        {
            if (tool is not AIFunctionDeclaration declaration) throw new NativeSessionRequestException(503);
            if (catalog.Contains(tool.Name))
            {
                if (!catalog.MatchesDefinition(tool.Name, declaration.JsonSchema) || tool is AIFunction && !registered.Any(function => ReferenceEquals(function, tool))) throw new NativeSessionRequestException(503);
            }
            else
            {
                var original = browser.SingleOrDefault(item => item.Name == tool.Name);
                if (original is null || tool is AIFunction || original.Description != declaration.Description || !JsonNode.DeepEquals(JsonNode.Parse(declaration.JsonSchema.GetRawText()), JsonNode.Parse((original.Parameters ?? JsonSerializer.SerializeToElement(new { type = "object" })).GetRawText()))) throw new NativeSessionRequestException(503);
            }
        }
        // Native merges the factory-owned server defaults. Repeating them in run options creates duplicate native declarations.
        configured.ChatOptions.Tools = browser.Select(tool => (AITool)AIFunctionFactory.CreateDeclaration(tool.Name, tool.Description, tool.Parameters?.Clone() ?? JsonSerializer.SerializeToElement(new { type = "object" }), null)).ToList();
        return configured;
    }

    private static IReadOnlyList<ChatMessage> Restore(IReadOnlyList<ChatMessage> messages, NativeSessionContext context)
    {
        if (messages.SelectMany(message => message.Contents).Any(content => content is ToolApprovalResponseContent or ToolApprovalRequestContent)) throw new NativeSessionRequestException(400);
        var evidence = context.ApprovalEvidence;
        if (evidence is null)
        {
            if (messages.SelectMany(message => message.Contents).Any(content => content is InterruptResponseContent)) throw new NativeSessionRequestException(400);
            return messages;
        }
        var bound = evidence.Batch;
        var protectedRequests = bound.Batch.ProtectedRequests.ToDictionary(item => item.Call.Id, StringComparer.Ordinal);
        var browsers = bound.Batch.BrowserBindings.ToDictionary(item => item.CallId, StringComparer.Ordinal);
        var requests = protectedRequests.Values.Select(item => new ToolApprovalRequestContent(item.RequestId, Call(item.Call.Id, item.Call.Name, item.Call.Arguments)) { RequiresConfirmation = true })
            .Concat(browsers.Values.Select(item => new ToolApprovalRequestContent(item.RequestId, Call(item.CallId, item.Name, item.Arguments)) { RequiresConfirmation = false })).ToDictionary(item => ((FunctionCallContent)item.ToolCall).CallId, StringComparer.Ordinal);
        var publicMessages = JsonNode.Parse(context.PublicRequest)!["messages"]!.AsArray();
        var expectedCalls = publicMessages.OfType<JsonObject>().SelectMany(message => message["toolCalls"] is JsonArray calls ? calls.OfType<JsonObject>() : []).ToArray();
        var nativeCalls = messages.SelectMany(message => message.Contents).OfType<FunctionCallContent>().ToArray();
        if (nativeCalls.Length != expectedCalls.Length) throw new NativeSessionRequestException(409);
        for (var index = 0; index < expectedCalls.Length; index++)
        {
            var expected = expectedCalls[index]; var call = nativeCalls[index];
            if (call.CallId != expected["id"]?.GetValue<string>() || call.Name != expected["function"]?["name"]?.GetValue<string>() || !Equivalent(call.Arguments, JsonNode.Parse(expected["function"]!["arguments"]!.GetValue<string>()))) throw new NativeSessionRequestException(409);
        }
        var ordered = requests.Values.OrderBy(item => bound.PublicLocations[item.RequestId].MessageIndex).ThenBy(item => bound.PublicLocations[item.RequestId].CallIndex).ToArray();
        for (var index = 1; index < ordered.Length; index++)
        {
            var previous = Location(ordered[index - 1].RequestId); var current = Location(ordered[index].RequestId);
            if (previous.MessageId == current.MessageId && previous.MessageIndex == current.MessageIndex && previous.ContentIndex >= current.ContentIndex) throw new NativeSessionRequestException(409);
        }
        NativeRequestLocation Location(string id) => bound.Batch.ProtectedRequests.FirstOrDefault(item => item.RequestId == id)?.NativeLocation ?? bound.Batch.BrowserBindings.Single(item => item.RequestId == id).NativeLocation;
        var replacements = new HashSet<string>(StringComparer.Ordinal); var decisions = new HashSet<string>(StringComparer.Ordinal); var result = new List<ChatMessage>();
        foreach (var message in messages)
        {
            var contents = new List<AIContent>();
            foreach (var content in message.Contents)
            {
                if (content is FunctionCallContent call && requests.TryGetValue(call.CallId, out var request))
                {
                    if (!replacements.Add(call.CallId)) throw new NativeSessionRequestException(409);
                    var original = (FunctionCallContent)request.ToolCall;
                    if (original.Name != call.Name || !Equivalent(call.Arguments, JsonSerializer.SerializeToNode(original.Arguments))) throw new NativeSessionRequestException(409);
                    contents.Add(request);
                }
                else if (content is InterruptResponseContent response)
                {
                    if (!decisions.Add(response.RequestId)) throw new NativeSessionRequestException(409);
                    var decision = evidence.Decisions.SingleOrDefault(item => item.RequestId == response.RequestId) ?? throw new NativeSessionRequestException(409);
                    var original = requests.Values.Single(item => item.RequestId == response.RequestId && item.RequiresConfirmation);
                    contents.Add(original.CreateResponse(decision.Kind == NativeApprovalDecisionKind.Approved, decision.Kind == NativeApprovalDecisionKind.Cancelled ? "Cancelled by caller." : null));
                }
                else contents.Add(content);
            }
            var clone = message.Clone(); clone.Contents = contents; result.Add(clone);
        }
        if (replacements.Count != requests.Count || decisions.Count != evidence.Decisions.Count) throw new NativeSessionRequestException(409);
        return result;
    }
    private static FunctionCallContent Call(string id, string name, JsonElement arguments) => new(id, name, JsonSerializer.Deserialize<Dictionary<string, object?>>(arguments));
    private static bool Equivalent(object? arguments, JsonNode? expected) => JsonNode.DeepEquals(JsonSerializer.SerializeToNode(arguments), expected);
    private static bool IsOwnedEcho(FunctionCallContent call, NativeSessionContext context)
    {
        if (!call.InformationalOnly || context.ApprovalEvidence is not { } evidence) return false;
        var protectedCall = evidence.Batch.Batch.ProtectedRequests.FirstOrDefault(item => item.Call.Id == call.CallId)?.Call;
        if (protectedCall is not null) return protectedCall.Name == call.Name && Equivalent(call.Arguments, JsonNode.Parse(protectedCall.Arguments.GetRawText()));
        var browser = evidence.Batch.Batch.BrowserBindings.FirstOrDefault(item => item.CallId == call.CallId);
        return browser is not null && browser.Name == call.Name && Equivalent(call.Arguments, JsonNode.Parse(browser.Arguments.GetRawText()));
    }
    /// <summary>Applies empty-echo suppression at the public projection boundary.</summary>
    private static AgentResponseUpdate? ProjectForPublic(AgentResponseUpdate source, IList<AIContent> contents)
    {
        var projected = Project(source, contents);
        return contents.Count == 0 && source.Contents.Count > 0 ? null : projected;
    }

    /// <summary>Creates independent outer/raw updates, preserving every supported pinned property.</summary>
    private static AgentResponseUpdate Project(AgentResponseUpdate source, IList<AIContent> contents)
    {
        ChatResponseUpdate? raw = null;
        if (source.RawRepresentation is not null)
        {
            if (source.RawRepresentation is not ChatResponseUpdate native || native.Contents.Count != source.Contents.Count || native.Contents.Where((content, index) => !ReferenceEquals(content, source.Contents[index])).Any() ||
                native.Role != source.Role || native.AuthorName != source.AuthorName || native.MessageId != source.MessageId || native.ResponseId != source.ResponseId || native.CreatedAt != source.CreatedAt || native.FinishReason != source.FinishReason || !Equals(native.ContinuationToken, source.ContinuationToken) ||
                native.AdditionalProperties?.Count != source.AdditionalProperties?.Count || native.AdditionalProperties is not null && native.AdditionalProperties.Any(pair => source.AdditionalProperties?.TryGetValue(pair.Key, out var value) != true || !Equals(pair.Value, value))) throw new NativeSessionRequestException(503);
            raw = native.Clone(); raw.Contents = contents.ToList();
        }
        return new AgentResponseUpdate(source.Role, contents.ToList())
        {
            AuthorName = source.AuthorName,
            AgentId = source.AgentId,
            ResponseId = source.ResponseId,
            MessageId = source.MessageId,
            CreatedAt = source.CreatedAt,
            ContinuationToken = source.ContinuationToken,
            FinishReason = source.FinishReason,
            AdditionalProperties = source.AdditionalProperties is null ? null : new(source.AdditionalProperties),
            RawRepresentation = raw
        };
    }
}
