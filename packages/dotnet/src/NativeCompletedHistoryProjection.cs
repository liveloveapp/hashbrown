#pragma warning disable MAAI001, MEAI001 // Uses pinned public AGUI conversion and ordinary native content APIs only.
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using AGUI.Abstractions;
using AGUI.Server;
using Microsoft.Extensions.AI;

namespace Hashbrown.AspNetCore;

/// <summary>Projects only fully completed journal-accepted history into independent ordinary provider-input pairs.</summary>
internal static class NativeCompletedHistoryProjection
{
  /// <summary>Preserves accepted canonical history while formatting its completed calls without restoring approval or execution authority.</summary>
  internal static IReadOnlyList<ChatMessage> Project(IReadOnlyList<ChatMessage> messages, NativeSessionContext context)
  {
    if (context.Admission is not { Status: 200, Lease: not null, Snapshot: { } saved } || context.Lease.Key.Selector != context.Input.ThreadId) throw Refuse();
    var limits = context.Registration.Options;
    if (Encoding.UTF8.GetByteCount(saved.PublicRequest) > limits.PublicBytes || Encoding.UTF8.GetByteCount(context.PublicRequest) > limits.PublicBytes) throw Refuse();
    var stored = JsonNode.Parse(saved.PublicRequest)?.AsObject() ?? throw Refuse();
    var incoming = JsonNode.Parse(context.PublicRequest)?.AsObject() ?? throw Refuse();
    if (stored["threadId"]?.GetValue<string>() != context.Input.ThreadId || incoming["threadId"]?.GetValue<string>() != context.Input.ThreadId || stored["messages"] is not JsonArray accepted || incoming["messages"] is not JsonArray admitted || accepted.Count > limits.MaximumMessages || admitted.Count > limits.MaximumMessages) throw Refuse();
    var current = saved.ExpectedBrowserCallIds.Concat(saved.PendingCalls.Select(call => call.Id)).ToHashSet(StringComparer.Ordinal);
    Add(saved.Approvals.PendingBatch);
    Add(context.ApprovalEvidence?.Batch);
    if (!HasAdmittedWarmPrefix(context, saved)) RequireAcceptedPrefix(accepted, admitted, saved);

    var calls = new Dictionary<string, HistoricalCall>(StringComparer.Ordinal);
    var allCalls = new HashSet<string>(StringComparer.Ordinal);
    var allResults = new HashSet<string>(StringComparer.Ordinal);
    var publicIdentities = new HashSet<string>(StringComparer.Ordinal);
    foreach (var node in accepted)
    {
      if (node is not JsonObject message || !publicIdentities.Add(Required(message, "id"))) throw Refuse();
      if (message["toolCalls"] is JsonArray announcements)
      {
        if (message["role"]?.GetValue<string>() != "assistant") throw Refuse();
        foreach (var announcement in announcements)
        {
          if (announcement is not JsonObject call || call["function"] is not JsonObject function) throw Refuse();
          var id = Required(call, "id");
          if (!allCalls.Add(id)) throw Refuse();
          if (!current.Contains(id))
          {
            var arguments = JsonNode.Parse(Required(function, "arguments"));
            if (arguments is not JsonObject) throw Refuse();
            calls.Add(id, new(id, Required(function, "name"), arguments, null));
          }
        }
      }
      if (message["role"]?.GetValue<string>() == "tool")
      {
        var id = Required(message, "toolCallId");
        if (!allCalls.Contains(id) || !allResults.Add(id)) throw Refuse();
        if (calls.TryGetValue(id, out var call)) calls[id] = call with { Result = RequiredString(message, "content") };
      }
    }
    if (calls.Values.Any(call => call.Result is null)) throw Refuse();
    if (calls.Count == 0) return messages;

    // Public conversion is the supported preimage; browser declarations must not manufacture approval responses.
    var transportJson = JsonSerializer.Serialize(context.Input, AGUIJsonSerializerContext.Default.RunAgentInput);
    if (Encoding.UTF8.GetByteCount(transportJson) > limits.PublicBytes) throw Refuse();
    var transport = JsonSerializer.Deserialize(transportJson, AGUIJsonSerializerContext.Default.RunAgentInput) ?? throw Refuse();
    transport.Tools = [];
    var expected = transport.ToChatRequestContext(JsonSerializerOptions.Web).Messages;
    if (messages.Count != expected.Count) throw Refuse();
    for (var index = 0; index < messages.Count; index++) RequireSamePreimage(messages[index], expected[index], limits);

    var nativeCalls = messages.SelectMany(message => message.Contents).OfType<FunctionCallContent>().Where(call => calls.ContainsKey(call.CallId)).ToArray();
    var ordered = calls.Values.ToArray();
    if (nativeCalls.Length != ordered.Length) throw Refuse();
    for (var index = 0; index < ordered.Length; index++)
      if (nativeCalls[index].CallId != ordered[index].Id || nativeCalls[index].Name != ordered[index].Name || !ArgumentsEqual(nativeCalls[index].Arguments, ordered[index].Arguments, limits.ArgumentBytes)) throw Refuse();
    var results = new Dictionary<string, (ChatMessage Message, FunctionResultContent Content)>(StringComparer.Ordinal);
    foreach (var message in messages)
      foreach (var result in message.Contents.OfType<FunctionResultContent>())
        if (calls.TryGetValue(result.CallId, out var call) && (message.Role != ChatRole.Tool || !ExactResult(result.Result, call.Result!) || !results.TryAdd(result.CallId, (message, result)))) throw Refuse();
    if (results.Count != calls.Count) throw Refuse();

    var identities = messages.Select(message => message.MessageId).OfType<string>().Concat(allCalls).Concat(publicIdentities).ToHashSet(StringComparer.Ordinal);
    var output = new List<ChatMessage>();
    var ordinal = 0;
    foreach (var message in messages)
    {
      var remaining = new List<AIContent>();
      foreach (var content in message.Contents)
      {
        if (content is FunctionCallContent call && calls.ContainsKey(call.CallId))
        {
          if (remaining.Count > 0) { output.Add(Clone(message, remaining, Identity())); remaining = []; }
          output.Add(Clone(message, [CloneContent(call, limits)], Identity()));
          var result = results[call.CallId];
          output.Add(Clone(result.Message, [CloneContent(result.Content, limits)], Identity()));
        }
        else if (content is FunctionResultContent result && calls.ContainsKey(result.CallId)) { }
        else remaining.Add(CloneContent(content, limits));
      }
      if (remaining.Count > 0) output.Add(Clone(message, remaining, message.MessageId));
    }
    return output.AsReadOnly();

    void Add(NativeBoundApprovalBatch? batch)
    {
      if (batch is null) return;
      current.UnionWith(batch.Batch.ProtectedRequests.Select(item => item.Call.Id));
      current.UnionWith(batch.Batch.BrowserBindings.Select(item => item.CallId));
    }
    string Identity()
    {
      string id;
      do { id = "hashbrown-history-" + ordinal++; } while (!identities.Add(id));
      return id;
    }
  }

  /// <summary>Preserves only the existing owned warm cancellation exception after complete durable decision admission.</summary>
  private static bool HasAdmittedWarmPrefix(NativeSessionContext context, NativeSessionSnapshot saved)
  {
    if (context.Recovery is not null || context.Decisions is not { } decisions || context.ApprovalEvidence is not { State: NativeApprovalState.DecisionAdmitted } evidence || saved.Approvals.PendingBatch is not { } pending) return false;
    var lease = context.Lease;
    if (evidence.SessionKeyId != lease.Key.Id || evidence.CurrentOwner.Key.Id != lease.Key.Id || evidence.CurrentOwner.Token != lease.Token || evidence.CurrentOwner.Generation != lease.Generation || evidence.CurrentOwner.Revision != lease.Revision || evidence.AdmittedGeneration != lease.Generation || evidence.AdmittedRevision is not { } consumedRevision || consumedRevision < lease.Revision || consumedRevision <= evidence.PublishedRevision || evidence.PublishedRevision > lease.Revision || evidence.CatalogIdentity != context.Registration.Catalog.Identity) return false;
    // The pure comparator checks the saved batch again; equality here also makes the lineage requirement explicit.
    if (!JsonNode.DeepEquals(JsonSerializer.SerializeToNode(pending), JsonSerializer.SerializeToNode(evidence.Batch))) return false;
    var expected = pending.Batch.ProtectedRequests.Select(item => item.RequestId).ToHashSet(StringComparer.Ordinal);
    if (decisions.Decisions.Count != expected.Count || evidence.Decisions.Count != expected.Count || decisions.Decisions.Select(item => item.RequestId).Distinct(StringComparer.Ordinal).Count() != expected.Count || evidence.Decisions.Select(item => item.RequestId).Distinct(StringComparer.Ordinal).Count() != expected.Count || !expected.SetEquals(decisions.Decisions.Select(item => item.RequestId)) || !expected.SetEquals(evidence.Decisions.Select(item => item.RequestId))) return false;
    foreach (var decision in decisions.Decisions)
      if (evidence.Decisions.Single(item => item.RequestId == decision.RequestId).Kind != decision.Kind) return false;
    var canonical = NativeSessionHistory.Normalize(context.PublicRequest, lease.Key, context.Registration.Catalog, context.Registration.Options);
    return canonical == decisions.CanonicalPublicRequest && NativeApprovalAdmission.MatchesBoundPrefix(canonical, saved, evidence.Batch);
  }

  /// <summary>Requires the exact saved messages, allowing only already-admitted current browser results and a subsequent user turn around that prefix.</summary>
  private static void RequireAcceptedPrefix(JsonArray accepted, JsonArray admitted, NativeSessionSnapshot saved)
  {
    var current = saved.ExpectedBrowserCallIds.ToHashSet(StringComparer.Ordinal);
    var added = new HashSet<string>(StringComparer.Ordinal);
    var announced = new HashSet<string>(StringComparer.Ordinal);
    var index = 0;
    var subsequentUsers = 0;
    foreach (var node in admitted)
    {
      if (node is not JsonObject message) throw Refuse();
      if (index < accepted.Count && NativeSessionHistory.EquivalentMessage(accepted[index], message))
      {
        if (message["toolCalls"] is JsonArray calls)
          foreach (var call in calls) announced.Add(Required(call!, "id"));
        index++;
        continue;
      }
      var result = message["role"]?.GetValue<string>() == "tool" ? message["toolCallId"]?.GetValue<string>() : null;
      if (result is not null && current.Contains(result) && announced.Contains(result) && added.Add(result)) continue;
      if (index == accepted.Count && saved.TurnCompleted && message["role"]?.GetValue<string>() == "user" && ++subsequentUsers == 1) continue;
      throw Refuse();
    }
    if (index != accepted.Count) throw Refuse();
  }

  /// <summary>Validates supported typed content against fresh public conversion rather than trusting a reconstructed transcript.</summary>
  private static void RequireSamePreimage(ChatMessage actual, ChatMessage expected, NativeSessionOptions limits)
  {
    if (actual.Role != expected.Role || actual.MessageId is not null && actual.MessageId != expected.MessageId || actual.AuthorName != expected.AuthorName || actual.CreatedAt != expected.CreatedAt || actual.RawRepresentation is not null || actual.AdditionalProperties?.Count > 0 || actual.Contents.Count != expected.Contents.Count) throw Refuse();
    for (var index = 0; index < actual.Contents.Count; index++)
    {
      var content = actual.Contents[index]; var wanted = expected.Contents[index];
      RequirePlain(content);
      switch (content)
      {
        case TextContent text when wanted is TextContent expectedText && text.Text == expectedText.Text: break;
        case FunctionCallContent call when wanted is FunctionCallContent expectedCall && call.CallId == expectedCall.CallId && call.Name == expectedCall.Name && ArgumentsEqual(call.Arguments, ArgumentNode(expectedCall.Arguments, limits.ArgumentBytes), limits.ArgumentBytes): break;
        case FunctionResultContent result when wanted is FunctionResultContent expectedResult && actual.Role == ChatRole.Tool && result.CallId == expectedResult.CallId && SameResult(result.Result, expectedResult.Result): break;
        case InterruptResponseContent response when wanted is InterruptResponseContent expectedResponse:
          RequireJsonData(response.Payload, 0); RequireJsonData(response.Metadata, 0);
          if (JsonSerializer.Serialize(response, response.GetType()) != JsonSerializer.Serialize(expectedResponse, expectedResponse.GetType())) throw Refuse();
          break;
        default: throw Refuse();
      }
    }
  }

  /// <summary>Clones only characterized ordinary data; generic current decisions remain outside historical authority.</summary>
  private static AIContent CloneContent(AIContent content, NativeSessionOptions limits) => content switch
  {
    TextContent text => new TextContent(text.Text),
    FunctionCallContent call => new FunctionCallContent(call.CallId, call.Name, JsonSerializer.Deserialize<Dictionary<string, object?>>(NativeSessionJson.SerializeArguments(call.Arguments ?? new Dictionary<string, object?>(), limits.ArgumentBytes))),
    FunctionResultContent result => new FunctionResultContent(result.CallId, result.Result is JsonElement element ? element.Clone() : result.Result),
    InterruptResponseContent response => response,
    _ => throw Refuse()
  };
  private static ChatMessage Clone(ChatMessage message, IList<AIContent> contents, string? id) { var clone = message.Clone(); clone.Contents = contents; clone.MessageId = id; return clone; }
  private static void RequirePlain(AIContent content)
  {
    if (content.RawRepresentation is not null || content.AdditionalProperties?.Count > 0 || content.Annotations?.Count > 0 || content is FunctionCallContent { Exception: not null } or FunctionCallContent { InformationalOnly: true } or FunctionResultContent { Exception: not null }) throw Refuse();
  }
  private static bool ArgumentsEqual(IDictionary<string, object?>? arguments, JsonNode expected, int maximumBytes) => JsonNode.DeepEquals(ArgumentNode(arguments, maximumBytes), expected);
  private static JsonNode ArgumentNode(IDictionary<string, object?>? arguments, int maximumBytes)
  {
    RequireJsonData(arguments, 0);
    return JsonNode.Parse(NativeSessionJson.SerializeArguments(arguments ?? new Dictionary<string, object?>(), maximumBytes).GetRawText())!;
  }
  /// <summary>Rejects unsupported reference values before any serializer can invoke application getters or converters.</summary>
  private static void RequireJsonData(object? value, int depth)
  {
    if (depth > 64) throw Refuse();
    switch (value)
    {
      case null: case string: case bool: case byte: case sbyte: case short: case ushort: case int: case uint: case long: case ulong: case decimal: return;
      case float number when float.IsFinite(number): return;
      case double number when double.IsFinite(number): return;
      case JsonElement element when element.ValueKind != JsonValueKind.Undefined: return;
      case Dictionary<string, object?> dictionary when dictionary.GetType() == typeof(Dictionary<string, object?>):
        foreach (var item in dictionary.Values) RequireJsonData(item, depth + 1);
        return;
      case object?[] array:
        foreach (var item in array) RequireJsonData(item, depth + 1);
        return;
      case List<object?> list when list.GetType() == typeof(List<object?>):
        foreach (var item in list) RequireJsonData(item, depth + 1);
        return;
      default: throw Refuse();
    }
  }
  private static bool ExactResult(object? value, string expected) => value is string text ? text == expected : value is JsonElement { ValueKind: JsonValueKind.String } element && element.GetString() == expected;
  private static bool SameResult(object? actual, object? expected) => actual is string text && expected is string wanted ? text == wanted : actual is JsonElement first && expected is JsonElement second && first.ValueKind == JsonValueKind.String && second.ValueKind == JsonValueKind.String && first.GetRawText() == second.GetRawText();
  private static string Required(JsonNode node, string name) => !string.IsNullOrWhiteSpace(node[name]?.GetValue<string>()) ? node[name]!.GetValue<string>() : throw Refuse();
  private static string RequiredString(JsonNode node, string name) => node[name] is JsonValue value && value.TryGetValue<string>(out var text) ? text : throw Refuse();
  private static NativeSessionRequestException Refuse() => new(409);
  private sealed record HistoricalCall(string Id, string Name, JsonNode Arguments, string? Result);
}
