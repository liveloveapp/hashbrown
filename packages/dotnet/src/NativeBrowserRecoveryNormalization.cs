#pragma warning disable MAAI001, MEAI001 // Uses only pinned public native content and approval APIs.
using System.Text.Json;
using System.Text.Json.Nodes;
using AGUI.Abstractions;
using Microsoft.Extensions.AI;

namespace Hashbrown.AspNetCore;

/// <summary>Pairs only the journal-admitted current recovered batch before native function approval processing.</summary>
internal static class NativeBrowserRecoveryNormalization
{
  /// <summary>Builds independent typed call/settlement messages without changing canonical IDs or durable call locations.</summary>
  internal static IReadOnlyList<ChatMessage> Normalize(IReadOnlyList<ChatMessage> messages, NativeSessionContext context)
  {
    var recovery = context.Recovery ?? throw new NativeSessionRequestException(409);
    var saved = context.Admission?.Snapshot ?? throw new NativeSessionRequestException(409);
    var publicMessages = JsonNode.Parse(context.PublicRequest)!["messages"]!.AsArray();
    var expected = publicMessages.OfType<JsonObject>().SelectMany(message => message["toolCalls"] is JsonArray calls ? calls.OfType<JsonObject>() : []).ToArray();
    var nativeCalls = messages.SelectMany(message => message.Contents).OfType<FunctionCallContent>().ToArray();
    if (nativeCalls.Length != expected.Length) throw new NativeSessionRequestException(409);
    for (var index = 0; index < expected.Length; index++)
      if (nativeCalls[index].CallId != expected[index]["id"]?.GetValue<string>() || nativeCalls[index].Name != expected[index]["function"]?["name"]?.GetValue<string>() || !Equivalent(nativeCalls[index].Arguments, JsonNode.Parse(expected[index]["function"]!["arguments"]!.GetValue<string>()))) throw new NativeSessionRequestException(409);
    var browsers = recovery.Outcomes.Select(item => item.ToolCallId).ToHashSet(StringComparer.Ordinal);
    if (!browsers.SetEquals(saved.ExpectedBrowserCallIds)) throw new NativeSessionRequestException(409);
    var evidence = context.ApprovalEvidence;
    var protectedCalls = evidence?.Batch.Batch.ProtectedRequests.ToDictionary(item => item.Call.Id, StringComparer.Ordinal) ?? [];
    if (saved.Approvals.PendingBatch is not null && (evidence is null || evidence.State != NativeApprovalState.DecisionAdmitted || evidence.AdmittedGeneration != context.Lease.Generation || !browsers.SetEquals(evidence.Batch.Batch.BrowserBindings.Select(item => item.CallId)))) throw new NativeSessionRequestException(409);
    var current = browsers.Concat(protectedCalls.Keys).ToHashSet(StringComparer.Ordinal);
    var canonicalResults = publicMessages.OfType<JsonObject>().Where(message => message["role"]?.GetValue<string>() == "tool" && browsers.Contains(message["toolCallId"]?.GetValue<string>() ?? "")).ToDictionary(message => message["toolCallId"]!.GetValue<string>(), message => message["content"]!.GetValue<string>(), StringComparer.Ordinal);
    if (canonicalResults.Count != browsers.Count) throw new NativeSessionRequestException(409);
    var results = new Dictionary<string, (ChatMessage Message, FunctionResultContent Result)>(StringComparer.Ordinal);
    var responses = new Dictionary<string, (ChatMessage Message, InterruptResponseContent Response)>(StringComparer.Ordinal);
    foreach (var message in messages)
    {
      var rewritten = message.Contents.Any(content => content is FunctionCallContent call && current.Contains(call.CallId) || content is FunctionResultContent result && browsers.Contains(result.CallId) || content is InterruptResponseContent);
      if (rewritten)
        foreach (var content in message.Contents)
        {
          RequirePlain(message, content);
          if (content is not TextContent && !(content is FunctionCallContent call && current.Contains(call.CallId)) && !(content is FunctionResultContent result && browsers.Contains(result.CallId)) && content is not InterruptResponseContent) throw new NativeSessionRequestException(409);
        }
      foreach (var content in message.Contents)
      {
        if (content is FunctionResultContent result && browsers.Contains(result.CallId))
        {
          RequirePlain(message, result);
          if (message.Role != ChatRole.Tool || !ExactResult(result.Result, canonicalResults[result.CallId]) || !results.TryAdd(result.CallId, (message, result))) throw new NativeSessionRequestException(409);
        }
        if (content is InterruptResponseContent response)
        {
          RequirePlain(message, response);
          if (evidence is null || !evidence.Decisions.Any(item => item.RequestId == response.RequestId) || !responses.TryAdd(response.RequestId, (message, response))) throw new NativeSessionRequestException(409);
        }
      }
    }
    if (results.Count != browsers.Count || responses.Count != protectedCalls.Count) throw new NativeSessionRequestException(409);
    var identities = messages.Select(message => message.MessageId).Where(id => id is not null).Cast<string>().Concat(expected.Select(call => call["id"]!.GetValue<string>())).ToHashSet(StringComparer.Ordinal);
    var output = new List<ChatMessage>();
    var seen = new HashSet<string>(StringComparer.Ordinal);
    var ordinal = 0;
    foreach (var message in messages)
    {
      var remaining = new List<AIContent>();
      foreach (var content in message.Contents)
      {
        if (content is FunctionCallContent call && current.Contains(call.CallId))
        {
          RequirePlain(message, call);
          if (message.Role != ChatRole.Assistant || !seen.Add(call.CallId)) throw new NativeSessionRequestException(409);
          if (remaining.Count > 0) { output.Add(Clone(message, remaining, Identity())); remaining = []; }
          var clonedCall = new FunctionCallContent(call.CallId, call.Name, JsonSerializer.Deserialize<Dictionary<string, object?>>(JsonSerializer.Serialize(call.Arguments)));
          if (protectedCalls.TryGetValue(call.CallId, out var descriptor))
          {
            if (descriptor.Call.Name != call.Name || !Equivalent(call.Arguments, JsonNode.Parse(descriptor.Call.Arguments.GetRawText()))) throw new NativeSessionRequestException(409);
            var location = evidence!.Batch.PublicLocations[descriptor.RequestId];
            if (publicMessages[location.MessageIndex]?["id"]?.GetValue<string>() != location.AssistantMessageId || publicMessages[location.MessageIndex]?["toolCalls"]?[location.CallIndex]?["id"]?.GetValue<string>() != call.CallId) throw new NativeSessionRequestException(409);
            var request = new ToolApprovalRequestContent(descriptor.RequestId, clonedCall) { RequiresConfirmation = true };
            var decision = evidence.Decisions.Single(item => item.RequestId == descriptor.RequestId);
            output.Add(Clone(message, [request], Identity()));
            output.Add(Clone(responses[descriptor.RequestId].Message, [request.CreateResponse(decision.Kind == NativeApprovalDecisionKind.Approved, decision.Kind == NativeApprovalDecisionKind.Cancelled ? "Cancelled by caller." : null)], Identity()));
          }
          else
          {
            if (evidence is not null)
            {
              var binding = evidence.Batch.Batch.BrowserBindings.Single(item => item.CallId == call.CallId);
              if (binding.Name != call.Name || !Equivalent(call.Arguments, JsonNode.Parse(binding.Arguments.GetRawText()))) throw new NativeSessionRequestException(409);
            }
            output.Add(Clone(message, [clonedCall], Identity()));
            output.Add(Clone(results[call.CallId].Message, [new FunctionResultContent(call.CallId, canonicalResults[call.CallId])], Identity()));
          }
        }
        else if (content is FunctionResultContent result && browsers.Contains(result.CallId) || content is InterruptResponseContent) { }
        else
        {
          if (message.Contents.OfType<FunctionCallContent>().Any(item => current.Contains(item.CallId)))
          {
            RequirePlain(message, content);
            if (content is not TextContent text) throw new NativeSessionRequestException(409);
            remaining.Add(new TextContent(text.Text));
          }
          else remaining.Add(content);
        }
      }
      if (remaining.Count > 0) output.Add(Clone(message, remaining, message.MessageId));
    }
    if (!seen.SetEquals(current)) throw new NativeSessionRequestException(409);
    return output.AsReadOnly();

    string Identity()
    {
      string candidate;
      do { candidate = "hashbrown-recovered-" + ordinal++; } while (!identities.Add(candidate));
      return candidate;
    }
  }

  /// <summary>Requires exact string settlement identity, including JSON-looking and unavailable strings.</summary>
  internal static bool ExactResult(object? result, string expected) => result is string text ? text == expected : result is JsonElement { ValueKind: JsonValueKind.String } element && element.GetString() == expected;
  private static bool Equivalent(object? arguments, JsonNode? expected) => JsonNode.DeepEquals(JsonSerializer.SerializeToNode(arguments), expected);
  private static ChatMessage Clone(ChatMessage message, IList<AIContent> contents, string? id) { var clone = message.Clone(); clone.Contents = contents; clone.MessageId = id; return clone; }
  private static void RequirePlain(ChatMessage message, AIContent content)
  {
    if (message.RawRepresentation is not null || message.AdditionalProperties?.Count > 0 || content.RawRepresentation is not null || content.AdditionalProperties?.Count > 0 || content.Annotations?.Count > 0 || content is FunctionCallContent { Exception: not null } or FunctionCallContent { InformationalOnly: true } or FunctionResultContent { Exception: not null }) throw new NativeSessionRequestException(409);
  }
}
