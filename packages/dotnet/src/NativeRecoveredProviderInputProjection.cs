#pragma warning disable MAAI001, MEAI001 // Uses only pinned public native content APIs.
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.AI;

namespace Hashbrown.AspNetCore;

/// <summary>Captures the admitted current recovery preimage separately from completed historical authority.</summary>
internal sealed class NativeRecoveredProviderInputProjection
{
  private readonly NativeSessionContext _owner;
  private readonly string _publicRequest;
  private readonly NativeSessionLease _lease;
  private readonly NativeSessionOptions _limits;
  private readonly IReadOnlyList<ChatMessage> _template;
  private readonly IReadOnlyList<ChatMessage> _residual;
  private readonly IReadOnlyDictionary<string, Member> _members;
  private readonly HashSet<string> _originalIds;
  private readonly int _protectedAnchor;
  private readonly IReadOnlyList<string> _events;
  private readonly IReadOnlyDictionary<string, DeferredCall> _deferred;
  private readonly IReadOnlyList<CallGroup> _callGroups;
  private readonly NativeHeldRecoveryManifest _held;
  private readonly IReadOnlyList<string> _rejected;
  private readonly IReadOnlyList<string> _approved;

  private NativeRecoveredProviderInputProjection(NativeSessionContext owner, IReadOnlyList<ChatMessage> template, IReadOnlyList<ChatMessage> residual, IReadOnlyDictionary<string, Member> members, HashSet<string> originalIds, int protectedAnchor, IReadOnlyList<string> events, IReadOnlyDictionary<string, DeferredCall> deferred, IReadOnlyList<CallGroup> callGroups, NativeHeldRecoveryManifest held, IReadOnlyList<string> rejected, IReadOnlyList<string> approved)
  {
    _owner = owner; _publicRequest = owner.PublicRequest; _lease = owner.Lease; _limits = owner.Registration.Options;
    _template = template; _residual = residual; _members = members; _originalIds = originalIds; _protectedAnchor = protectedAnchor; _events = events; _deferred = deferred; _callGroups = callGroups; _held = held; _rejected = rejected; _approved = approved;
  }

  /// <summary>Copies the exact supported post-Restore preimage before native approval processing can regroup it.</summary>
  internal static NativeRecoveredProviderInputProjection Create(IReadOnlyList<ChatMessage> prepared, NativeSessionContext context)
  {
    if (context.Recovery is not { } recovery || context.Admission is not { Status: 200, Snapshot: { } saved } || context.Lease.Key.Selector != context.Input.ThreadId) throw Refuse();
    var limits = context.Registration.Options;
    var held = context.ReadHeldRecoveryManifest();
    if (prepared.Count > limits.MaximumMessages || Encoding.UTF8.GetByteCount(context.PublicRequest) > limits.PublicBytes) throw Refuse();
    var browsers = recovery.Outcomes.Select(item => item.ToolCallId).ToHashSet(StringComparer.Ordinal);
    if (!browsers.SetEquals(saved.ExpectedBrowserCallIds)) throw Refuse();
    var evidence = context.ApprovalEvidence;
    var descriptors = evidence?.Batch.Batch.ProtectedRequests.ToDictionary(item => item.Call.Id, StringComparer.Ordinal) ?? [];
    if (saved.Approvals.PendingBatch is not null && (evidence is null || evidence.State != NativeApprovalState.DecisionAdmitted || evidence.AdmittedGeneration != context.Lease.Generation)) throw Refuse();
    if (browsers.Overlaps(descriptors.Keys)) throw Refuse();
    var current = browsers.Concat(descriptors.Keys).ToHashSet(StringComparer.Ordinal);
    if (current.Count == 0 || current.Count > limits.MaximumCalls) throw Refuse();
    var canonical = JsonNode.Parse(context.PublicRequest)!["messages"]!.AsArray();
    var ordered = canonical.OfType<JsonObject>().SelectMany(message => message["toolCalls"] is JsonArray calls ? calls.OfType<JsonObject>() : []).Where(call => current.Contains(call["id"]?.GetValue<string>() ?? "")).ToArray();
    if (ordered.Length != current.Count || ordered.Select(call => call["id"]!.GetValue<string>()).Distinct(StringComparer.Ordinal).Count() != current.Count) throw Refuse();
    var members = new Dictionary<string, Member>(StringComparer.Ordinal);
    foreach (var item in ordered)
    {
      var id = item["id"]!.GetValue<string>();
      var name = item["function"]!["name"]!.GetValue<string>();
      var arguments = JsonNode.Parse(item["function"]!["arguments"]!.GetValue<string>()) as JsonObject ?? throw Refuse();
      var browser = browsers.Contains(id);
      string? result = null;
      if (browser)
      {
        var results = canonical.OfType<JsonObject>().Where(message => message["role"]?.GetValue<string>() == "tool" && message["toolCallId"]?.GetValue<string>() == id).ToArray();
        if (results.Length != 1 || results[0]["content"] is not JsonValue value || !value.TryGetValue<string>(out result)) throw Refuse();
      }
      else if (descriptors[id].Call.Name != name || !JsonNode.DeepEquals(arguments, JsonNode.Parse(descriptors[id].Call.Arguments.GetRawText()))) throw Refuse();
      members.Add(id, new(id, name, arguments.DeepClone(), browser, result, browser ? null : descriptors[id].RequestId));
    }
    var template = new List<ChatMessage>();
    var residual = new List<ChatMessage>();
    var seenCalls = new HashSet<string>(StringComparer.Ordinal);
    var seenSettlements = new HashSet<string>(StringComparer.Ordinal);
    var originalIds = new HashSet<string>(StringComparer.Ordinal);
    var protectedAnchor = -1;
    var eventAnchor = -1;
    var events = new List<string>();
    foreach (var message in prepared)
    {
      RequireMessage(message);
      if (message.MessageId is { } identity) originalIds.Add(identity);
      if (message.Contents.Count == 0) throw Refuse();
      var targets = message.Contents.Where(content => IsCurrent(content, current)).ToArray();
      if (targets.Length == 0)
      {
        var copy = CloneOrdinary(message, limits);
        template.Add(copy); residual.Add(copy);
        foreach (var ordinaryCall in message.Contents.OfType<FunctionCallContent>()) originalIds.Add(ordinaryCall.CallId);
        continue;
      }
      if (targets.Length != 1 || message.Contents.Count != 1) throw Refuse();
      var content = targets[0]; RequireContent(content);
      if (content is FunctionCallContent call)
      {
        if (!members.TryGetValue(call.CallId, out var member) || !member.Browser || message.Role != ChatRole.Assistant || !seenCalls.Add(call.CallId)) throw Refuse();
        RequireCall(call, member, limits);
        member.CallHeader = Header(message); member.ResidualIndex = residual.Count;
        events.Add("call:" + member.Id);
        template.Add(Clone(message, [CopyCall(member)]));
      }
      else if (content is ToolApprovalRequestContent request)
      {
        if (request.ToolCall is not FunctionCallContent native || !members.TryGetValue(native.CallId, out var member) || member.Browser || message.Role != ChatRole.Assistant || request.RequestId != member.RequestId || !request.RequiresConfirmation || !seenCalls.Add(native.CallId)) throw Refuse();
        RequireCall(native, member, limits);
        member.CallHeader = Header(message); member.ResidualIndex = residual.Count;
        protectedAnchor = residual.Count; eventAnchor = events.Count;
        // The private template uses an ordinary call slot; no approval object is retained or constructed here.
        template.Add(Clone(message, [CopyCall(member)]));
      }
      else if (content is FunctionResultContent result)
      {
        if (!members.TryGetValue(result.CallId, out var member) || !member.Browser || message.Role != ChatRole.Tool || !NativeBrowserRecoveryNormalization.ExactResult(result.Result, member.BrowserResult!) || !seenSettlements.Add(result.CallId)) throw Refuse();
        member.ResultHeader = Header(message);
        events.Add("result:" + member.Id);
      }
      else if (content is ToolApprovalResponseContent response)
      {
        if (response.ToolCall is not FunctionCallContent native || !members.TryGetValue(native.CallId, out var member) || member.Browser || response.RequestId != member.RequestId || !seenSettlements.Add(native.CallId)) throw Refuse();
        RequireCall(native, member, limits);
        var decision = evidence!.Decisions.Single(item => item.RequestId == member.RequestId);
        if (response.Approved != (decision.Kind == NativeApprovalDecisionKind.Approved) || response.Reason != (decision.Kind == NativeApprovalDecisionKind.Cancelled ? "Cancelled by caller." : null)) throw Refuse();
        protectedAnchor = residual.Count; eventAnchor = events.Count;
      }
      else throw Refuse();
    }
    if (!seenCalls.SetEquals(current) || !seenSettlements.SetEquals(current) || !template.SelectMany(message => message.Contents).OfType<FunctionCallContent>().Where(call => current.Contains(call.CallId)).Select(call => call.CallId).SequenceEqual(ordered.Select(item => item["id"]!.GetValue<string>()))) throw Refuse();
    var callGroups = new List<CallGroup>();
    var rejectedOrder = new List<string>();
    var approvedOrder = new List<string>();
    if (eventAnchor >= 0)
    {
      var protectedOrder = template.SelectMany(message => message.Contents).OfType<FunctionCallContent>().Where(call => members.TryGetValue(call.CallId, out var member) && !member.Browser).Select(call => members[call.CallId]).OrderBy(member => evidence!.Decisions.Single(decision => decision.RequestId == member.RequestId).Kind == NativeApprovalDecisionKind.Approved ? 1 : 0).Select(member => member.Id).ToArray();
      rejectedOrder.AddRange(protectedOrder.Where(id => evidence!.Decisions.Single(decision => decision.RequestId == members[id].RequestId).Kind != NativeApprovalDecisionKind.Approved));
      approvedOrder.AddRange(protectedOrder.Where(id => evidence!.Decisions.Single(decision => decision.RequestId == members[id].RequestId).Kind == NativeApprovalDecisionKind.Approved));
      // FICC groups by the original request message ID, retaining the first member's header.
      // A null ID is one group whose emitted ID is supplied by the native fallback generator.
      foreach (var group in protectedOrder.GroupBy(id => members[id].CallHeader!.Id ?? string.Empty, StringComparer.Ordinal))
        callGroups.Add(new(members[group.First()].CallHeader!, Array.AsReadOnly(group.ToArray())));
      events.InsertRange(eventAnchor, callGroups.SelectMany(group => group.Ids).Select(id => "call:" + id).Concat(protectedOrder.Select(id => "result:" + id)));
    }
    var deferred = new Dictionary<string, DeferredCall>(StringComparer.Ordinal);
    var ordinaryResults = residual.SelectMany(message => message.Contents).OfType<FunctionResultContent>().Select(result => result.CallId).ToHashSet(StringComparer.Ordinal);
    foreach (var call in residual.SelectMany(message => message.Contents).OfType<FunctionCallContent>().Where(call => !ordinaryResults.Contains(call.CallId)))
    {
      var captured = saved.PendingCalls.SingleOrDefault(item => item.Id == call.CallId);
      var arguments = Arguments(call.Arguments, limits.ArgumentBytes);
      if (captured is null || captured.Name != call.Name || !context.Registration.Catalog.HasVersion(captured) || context.Registration.Catalog.RequiresConfirmation(captured.Name) || !JsonNode.DeepEquals(arguments, JsonNode.Parse(captured.Arguments.GetRawText())) || !deferred.TryAdd(call.CallId, new(call.Name, arguments))) throw Refuse();
    }
    foreach (var id in current) originalIds.Add(id);
    if (held.Calls.Count + members.Count > limits.MaximumCalls) throw Refuse();
    foreach (var item in held.Calls)
    {
      var call = item.Value;
      if (item.Key != call.Id || originalIds.Contains(call.Id) || !context.Registration.Catalog.HasVersion(call) || context.Registration.Catalog.RequiresConfirmation(call.Name) || !saved.PendingCalls.Any(savedCall => SameDescriptor(call, savedCall))) throw Refuse();
      originalIds.Add(call.Id);
    }
    return new(context, template.AsReadOnly(), residual.AsReadOnly(), new System.Collections.ObjectModel.ReadOnlyDictionary<string, Member>(members), originalIds, protectedAnchor, events.AsReadOnly(), new System.Collections.ObjectModel.ReadOnlyDictionary<string, DeferredCall>(deferred), callGroups.AsReadOnly(), held, rejectedOrder.AsReadOnly(), approvedOrder.AsReadOnly());
  }

  /// <summary>Authenticates native settlements and returns independent canonical-string pairs without modifying FICC history.</summary>
  internal IReadOnlyList<ChatMessage> Project(IReadOnlyList<ChatMessage> received, NativeSessionContext context)
  {
    if (!ReferenceEquals(context, _owner) || context.PublicRequest != _publicRequest || context.Lease.Key.Id != _lease.Key.Id || context.Lease.Token != _lease.Token || context.Lease.Generation != _lease.Generation || context.Lease.Revision != _lease.Revision || received.Count > _limits.MaximumMessages) throw Refuse();
    var witnesses = context.ReadObservedRecoveryResults();
    var protectedIds = _members.Values.Where(member => !member.Browser).Select(member => member.Id).ToHashSet(StringComparer.Ordinal);
    if (!protectedIds.SetEquals(witnesses.Keys)) throw Refuse();
    var heldSeal = context.ReadSealedHeldRecovery(_held);
    var nativePlan = PlanHeld(heldSeal, context);
    var calls = new HashSet<string>(StringComparer.Ordinal);
    var results = new Dictionary<string, string>(StringComparer.Ordinal);
    var heldResults = new Dictionary<string, string>(StringComparer.Ordinal);
    var residual = new List<ChatMessage>();
    var nativeResultsStarted = false;
    var events = new List<string>();
    var resultGroups = new List<string[]>();
    var callGroupIndex = 0;
    foreach (var message in received)
    {
      var targeted = message.Contents.Where(content => CurrentId(content) is { } id && (_members.ContainsKey(id) || _held.Calls.ContainsKey(id))).ToArray();
      if (message.Contents.Any(content => content is ToolApprovalRequestContent or ToolApprovalResponseContent)) throw Refuse();
      if (targeted.Length == 0) { residual.Add(message); continue; }
      RequireMessage(message);
      if (targeted.Length != message.Contents.Count) throw Refuse();
      var hasCalls = targeted[0] is FunctionCallContent;
      if (targeted.Any(content => (content is FunctionCallContent) != hasCalls)) throw Refuse();
      if (message.Role != (hasCalls ? ChatRole.Assistant : ChatRole.Tool)) throw Refuse();
      var nativeContainer = targeted.Any(content => !_members.TryGetValue(CurrentId(content)!, out var item) || !item.Browser);
      if (nativeContainer && targeted.Any(content => _members.TryGetValue(CurrentId(content)!, out var item) && item.Browser)) throw Refuse();
      foreach (var content in targeted)
      {
        var id = CurrentId(content)!;
        _members.TryGetValue(id, out var member);
        var browser = member?.Browser == true;
        // Complete P and H actual-return/observation gates precede use of native informational markers.
        RequireContent(content, content is FunctionCallContent && !browser);
        events.Add((content is FunctionCallContent ? "call:" : "result:") + id);
        if (residual.Count != (browser ? member!.ResidualIndex : nativePlan.Anchor)) throw Refuse();
        if (content is FunctionCallContent call)
        {
          if (member is not null) RequireCall(call, member, _limits, completedProtected: !browser);
          else RequireHeldCall(call, _held.Calls[id]);
          if (!calls.Add(id) || !browser && nativeResultsStarted) throw Refuse();
          if (browser && (targeted.Length != 1 || Header(message) != member!.CallHeader)) throw Refuse();
        }
        else if (content is FunctionResultContent result)
        {
          if (!calls.Contains(id) || results.ContainsKey(id) || heldResults.ContainsKey(id)) throw Refuse();
          if (browser)
          {
            if (targeted.Length != 1 || Header(message) != member!.ResultHeader || !NativeBrowserRecoveryNormalization.ExactResult(result.Result, member.BrowserResult!)) throw Refuse();
            results.Add(id, member.BrowserResult!);
          }
          else if (member is not null)
          {
            nativeResultsStarted = true;
            var witness = witnesses[id];
            if (witness.CallId != id || witness.RequestId != member.RequestId || witness.OwnerToken != _lease.Token || witness.Generation != _lease.Generation || witness.BatchId != context.ApprovalEvidence?.Batch.Batch.BatchId || !witness.Snapshot.Matches(result.Result)) throw Refuse();
            results.Add(id, witness.Snapshot.WireContent);
          }
          else
          {
            nativeResultsStarted = true;
            var witness = heldSeal.Results[id];
            if (!witness.Snapshot.Matches(result.Result)) throw Refuse();
            heldResults.Add(id, witness.Snapshot.WireContent);
          }
        }
        else throw Refuse();
      }
      if (hasCalls && nativeContainer)
      {
        if (callGroupIndex >= nativePlan.Groups.Count) throw Refuse();
        var group = nativePlan.Groups[callGroupIndex++];
        var header = Header(message);
        if (!targeted.Select(content => CurrentId(content)!).SequenceEqual(group.Ids)) throw Refuse();
        if (group.Header.Id is null)
        {
          if (string.IsNullOrWhiteSpace(header.Id) || _originalIds.Contains(header.Id) || (header with { Id = null }) != group.Header) throw Refuse();
        }
        else if (header != group.Header) throw Refuse();
      }
      if (!hasCalls && nativeContainer)
      {
        if (message.AuthorName is not null || message.CreatedAt is not null) throw Refuse();
        resultGroups.Add(targeted.Select(content => CurrentId(content)!).ToArray());
      }
    }
    if (callGroupIndex != nativePlan.Groups.Count) throw Refuse();
    if (!events.SequenceEqual(nativePlan.Events)) throw Refuse();
    if (!calls.SetEquals(_members.Keys.Concat(_held.Calls.Keys))) throw Refuse();
    if (results.Count != _members.Count) throw Refuse();
    if (heldResults.Count != _held.Calls.Count) throw Refuse();
    if (residual.Count < _residual.Count) throw Refuse();
    if (_held.Calls.Count > 0 && (resultGroups.Count != nativePlan.ResultGroups.Count || resultGroups.Where((group, index) => !group.SequenceEqual(nativePlan.ResultGroups[index])).Any())) throw Refuse();
    for (var index = 0; index < _residual.Count; index++) RequireSame(residual[index], _residual[index], _limits);
    var suffix = residual.Skip(_residual.Count).ToArray();
    RequireFreshSuffix(suffix, context);
    var identities = received.Select(message => message.MessageId).OfType<string>().Concat(_originalIds).ToHashSet(StringComparer.Ordinal);
    var ordinal = 0;
    var output = new List<ChatMessage>();
    foreach (var message in _template)
    {
      if (message.Contents.Count == 1 && message.Contents[0] is FunctionCallContent call && _members.TryGetValue(call.CallId, out var member))
      {
        output.Add(Clone(message, [CopyCall(member)], Identity()));
        output.Add(new(ChatRole.Tool, [new FunctionResultContent(member.Id, results[member.Id])]) { MessageId = Identity() });
      }
      else output.Add(CloneOrdinary(message, _limits));
    }
    foreach (var id in nativePlan.HeldOrder)
    {
      var call = _held.Calls[id];
      output.Add(new(ChatRole.Assistant, [new FunctionCallContent(id, call.Name, JsonSerializer.Deserialize<Dictionary<string, object?>>(call.Arguments.GetRawText()))]) { MessageId = Identity() });
      output.Add(new(ChatRole.Tool, [new FunctionResultContent(id, heldResults[id])]) { MessageId = Identity() });
    }
    foreach (var message in suffix) output.Add(Clone(message, message.Contents.ToList()));
    return output.AsReadOnly();

    string Identity() { string id; do { id = "hashbrown-provider-recovery-" + ordinal++; } while (!identities.Add(id)); return id; }
  }

  /// <summary>Predicts native grouping from fixed preimage and sealed outward evidence, never provider input.</summary>
  private NativePlan PlanHeld(NativeHeldRecoverySeal seal, NativeSessionContext context)
  {
    if (!ReferenceEquals(seal.Manifest, _held) || _held.SessionKeyId != _lease.Key.Id || _held.CatalogIdentity != context.Registration.Catalog.Identity || _held.OwnerToken != _lease.Token || _held.Generation != _lease.Generation || _held.Revision != _lease.Revision || !_held.Calls.Keys.ToHashSet(StringComparer.Ordinal).SetEquals(seal.Results.Keys)) throw Refuse();
    if (_held.Calls.Count == 0)
    {
      if (seal.Groups.Count != 0) throw Refuse();
      return new(_callGroups, _events, _protectedAnchor, [], []);
    }
    var observed = new HashSet<string>(StringComparer.Ordinal);
    var heldOrder = new List<string>();
    long lastUpdate = -1;
    foreach (var group in seal.Groups)
    {
      if (group.UpdateOrdinal <= lastUpdate || group.Calls.Count == 0) throw Refuse();
      lastUpdate = group.UpdateOrdinal;
      var lastContent = -1;
      foreach (var item in group.Calls)
      {
        if (item.ContentOrdinal <= lastContent || !observed.Add(item.CallId)) throw Refuse();
        lastContent = item.ContentOrdinal;
        if (_held.Calls.ContainsKey(item.CallId)) heldOrder.Add(item.CallId);
        else if (!_members.TryGetValue(item.CallId, out var member) || member.Browser) throw Refuse();
      }
    }
    if (!observed.SetEquals(_rejected.Concat(_approved).Concat(_held.Calls.Keys))) throw Refuse();
    foreach (var item in seal.Results)
    {
      var witness = item.Value;
      if (!ReferenceEquals(witness.Manifest, _held) || item.Key != witness.CallId || !SameDescriptor(witness.Call, _held.Calls[item.Key]) || witness.SessionKeyId != _lease.Key.Id || witness.CatalogIdentity != _held.CatalogIdentity || witness.OwnerToken != _lease.Token || witness.Generation != _lease.Generation || witness.Revision != _lease.Revision) throw Refuse();
    }
    var groups = SimulateNativeGroups(_rejected.Concat(_approved).Concat(heldOrder));
    if (groups.Count != seal.Groups.Count) throw Refuse();
    var boundGroups = new List<CallGroup>();
    for (var index = 0; index < groups.Count; index++)
    {
      var expected = groups[index]; var observedGroup = seal.Groups[index];
      if (!expected.Ids.SequenceEqual(observedGroup.Calls.Select(item => item.CallId))) throw Refuse();
      if (expected.Header.Id is null)
      {
        if (string.IsNullOrWhiteSpace(observedGroup.NativeMessageId) || _originalIds.Contains(observedGroup.NativeMessageId)) throw Refuse();
        boundGroups.Add(expected with { Header = expected.Header with { Id = observedGroup.NativeMessageId } });
      }
      else
      {
        if (expected.Header.Id != observedGroup.NativeMessageId) throw Refuse();
        boundGroups.Add(expected);
      }
    }
    var browserEvents = _events.Where(IsBrowserEvent).ToList();
    var resultOrder = _rejected.Concat(_approved).Concat(heldOrder).ToArray();
    var nativeEvents = groups.SelectMany(group => group.Ids).Select(id => "call:" + id).Concat(resultOrder.Select(id => "result:" + id));
    // The automatic-approval helper hoists mixed P/H decisions to the captured P request
    // anchor. The separate browser-only invocable-bypass path appends decisions at END.
    // Both selection and placement come from the immutable preimage, never received input.
    var mixed = _rejected.Count + _approved.Count > 0;
    var eventAnchor = mixed ? _events.TakeWhile(IsBrowserEvent).Count() : browserEvents.Count;
    browserEvents.InsertRange(eventAnchor, nativeEvents);
    var resultGroups = new List<IReadOnlyList<string>>();
    if (_rejected.Count > 0) resultGroups.Add(_rejected);
    resultGroups.Add(Array.AsReadOnly(_approved.Concat(heldOrder).ToArray()));
    return new(boundGroups.AsReadOnly(), browserEvents.AsReadOnly(), mixed ? _protectedAnchor : _residual.Count, resultGroups.AsReadOnly(), heldOrder.AsReadOnly());

    bool IsBrowserEvent(string token) => _members.TryGetValue(token[(token.IndexOf(':') + 1)..], out var member) && member.Browser;
  }

  /// <summary>Models the pinned first-group and empty-key transitions for requestless held responses.</summary>
  private IReadOnlyList<CallGroup> SimulateNativeGroups(IEnumerable<string> ids)
  {
    var groups = new List<(MessageHeader Header, List<string> Ids)>();
    Dictionary<string, int>? byId = null;
    var current = -1;
    foreach (var id in ids)
    {
      var request = _members.TryGetValue(id, out var member) ? member.CallHeader : null;
      if (byId is null && current >= 0 && request is not null && (groups[current].Header.Id is null || groups[current].Header.Id != request.Id))
        byId = new(StringComparer.Ordinal) { [groups[current].Header.Id ?? string.Empty] = current };
      var key = request?.Id ?? string.Empty;
      if (byId is not null) current = byId.TryGetValue(key, out var existing) ? existing : -1;
      if (current < 0)
      {
        current = groups.Count;
        groups.Add((request ?? new(ChatRole.Assistant, null, null, null), []));
      }
      groups[current].Ids.Add(id);
      if (byId is not null) byId[key] = current;
    }
    return groups.Select(group => new CallGroup(group.Header, group.Ids.AsReadOnly())).ToArray();
  }

  private void RequireHeldCall(FunctionCallContent call, NativeToolCall expected)
  {
    RequireContent(call, completedProtected: true);
    if (call.CallId != expected.Id || call.Name != expected.Name || !JsonNode.DeepEquals(Arguments(call.Arguments, _limits.ArgumentBytes), JsonNode.Parse(expected.Arguments.GetRawText()))) throw Refuse();
  }
  private static bool SameDescriptor(NativeToolCall first, NativeToolCall second) => first.Id == second.Id && first.Name == second.Name && first.Version == second.Version && JsonNode.DeepEquals(JsonNode.Parse(first.Arguments.GetRawText()), JsonNode.Parse(second.Arguments.GetRawText()));

  private void RequireFreshSuffix(IReadOnlyList<ChatMessage> suffix, NativeSessionContext context)
  {
    var calls = new HashSet<string>(StringComparer.Ordinal);
    var results = new HashSet<string>(StringComparer.Ordinal);
    foreach (var message in suffix)
    {
      if (message.MessageId is { } id && _originalIds.Contains(id)) throw Refuse();
      foreach (var content in message.Contents)
      {
        if (content is FunctionCallContent call)
        {
          if (message.Role != ChatRole.Assistant || _originalIds.Contains(call.CallId) || !calls.Add(call.CallId) || !context.Registration.Catalog.Contains(call.Name)) throw Refuse();
          var arguments = Arguments(call.Arguments, _limits.ArgumentBytes);
          if (!context.MatchesCompletedCapturedCall(call.CallId, call.Name, arguments)) throw Refuse();
        }
        else if (content is FunctionResultContent result)
        {
          if (message.Role != ChatRole.Tool || !results.Add(result.CallId)) throw Refuse();
          if (_deferred.TryGetValue(result.CallId, out var deferred))
          {
            if (!context.MatchesCompletedCapturedCall(result.CallId, deferred.Name, deferred.Arguments)) throw Refuse();
          }
          else if (!calls.Contains(result.CallId)) throw Refuse();
        }
        else if (content is not TextContent) throw Refuse();
      }
    }
    if (!results.SetEquals(calls.Concat(_deferred.Keys))) throw Refuse();
  }

  private static bool IsCurrent(AIContent content, HashSet<string> current) => CurrentId(content) is { } id && current.Contains(id);
  private static string? CurrentId(AIContent content) => content switch { FunctionCallContent call => call.CallId, FunctionResultContent result => result.CallId, ToolApprovalRequestContent request => request.ToolCall.CallId, ToolApprovalResponseContent response => response.ToolCall.CallId, _ => null };
  private static MessageHeader Header(ChatMessage message) => new(message.Role, message.MessageId, message.AuthorName, message.CreatedAt);
  private static void RequireMessage(ChatMessage message) { if (message.GetType() != typeof(ChatMessage) || message.RawRepresentation is not null || message.AdditionalProperties?.Count > 0) throw Refuse(); }
  private static void RequireContent(AIContent content, bool completedProtected = false)
  {
    if (content.RawRepresentation is not null || content.AdditionalProperties?.Count > 0 || content.Annotations?.Count > 0 || content is FunctionCallContent { Exception: not null } or FunctionResultContent { Exception: not null } || content is FunctionCallContent marked && marked.InformationalOnly != completedProtected) throw Refuse();
    if (content.GetType() != typeof(TextContent) && content.GetType() != typeof(FunctionCallContent) && content.GetType() != typeof(FunctionResultContent) && content.GetType() != typeof(ToolApprovalRequestContent) && content.GetType() != typeof(ToolApprovalResponseContent)) throw Refuse();
  }
  private static void RequireCall(FunctionCallContent call, Member member, NativeSessionOptions limits, bool completedProtected = false)
  {
    RequireContent(call, completedProtected);
    if (call.CallId != member.Id || call.Name != member.Name || !JsonNode.DeepEquals(Arguments(call.Arguments, limits.ArgumentBytes), member.Arguments)) throw Refuse();
  }
  private static JsonNode Arguments(IDictionary<string, object?>? arguments, int maximumBytes)
  {
    RequireData(arguments, 0);
    return JsonNode.Parse(NativeSessionJson.SerializeArguments(arguments ?? new Dictionary<string, object?>(), maximumBytes).GetRawText())!;
  }
  private static void RequireData(object? value, int depth)
  {
    if (depth > 64) throw Refuse();
    switch (value)
    {
      case null: case string: case bool: case byte: case sbyte: case short: case ushort: case int: case uint: case long: case ulong: case decimal: return;
      case float number when float.IsFinite(number): return;
      case double number when double.IsFinite(number): return;
      case JsonElement element when element.ValueKind != JsonValueKind.Undefined: return;
      case Dictionary<string, object?> dictionary when dictionary.GetType() == typeof(Dictionary<string, object?>): foreach (var item in dictionary.Values) RequireData(item, depth + 1); return;
      case object?[] array: foreach (var item in array) RequireData(item, depth + 1); return;
      case List<object?> list when list.GetType() == typeof(List<object?>): foreach (var item in list) RequireData(item, depth + 1); return;
      default: throw Refuse();
    }
  }
  private static FunctionCallContent CopyCall(Member member) => new(member.Id, member.Name, JsonSerializer.Deserialize<Dictionary<string, object?>>(member.Arguments.ToJsonString()));
  private static ChatMessage Clone(ChatMessage source, IList<AIContent> contents, string? id = null) { var clone = source.Clone(); clone.Contents = contents; if (id is not null) clone.MessageId = id; return clone; }
  private static ChatMessage CloneOrdinary(ChatMessage source, NativeSessionOptions limits)
  {
    RequireMessage(source);
    var contents = new List<AIContent>();
    foreach (var content in source.Contents)
    {
      RequireContent(content);
      switch (content)
      {
        case TextContent text: contents.Add(new TextContent(text.Text)); break;
        case FunctionCallContent call: contents.Add(new FunctionCallContent(call.CallId, call.Name, JsonSerializer.Deserialize<Dictionary<string, object?>>(Arguments(call.Arguments, limits.ArgumentBytes).ToJsonString()))); break;
        case FunctionResultContent result when result.Result is string or JsonElement:
          contents.Add(new FunctionResultContent(result.CallId, result.Result is JsonElement json ? json.Clone() : result.Result)); break;
        default: throw Refuse();
      }
    }
    return Clone(source, contents);
  }
  private static void RequireSame(ChatMessage actual, ChatMessage expected, NativeSessionOptions limits)
  {
    RequireMessage(actual);
    if (Header(actual) != Header(expected) || actual.Contents.Count != expected.Contents.Count) throw Refuse();
    for (var index = 0; index < actual.Contents.Count; index++)
    {
      var first = actual.Contents[index]; var second = expected.Contents[index]; RequireContent(first);
      if (first is TextContent text && second is TextContent wanted && text.Text == wanted.Text) continue;
      if (first is FunctionCallContent call && second is FunctionCallContent wantedCall && call.CallId == wantedCall.CallId && call.Name == wantedCall.Name && JsonNode.DeepEquals(Arguments(call.Arguments, limits.ArgumentBytes), Arguments(wantedCall.Arguments, limits.ArgumentBytes))) continue;
      if (first is FunctionResultContent result && second is FunctionResultContent wantedResult && result.CallId == wantedResult.CallId && SameResult(result.Result, wantedResult.Result)) continue;
      throw Refuse();
    }
  }
  private static bool SameResult(object? first, object? second) => first is string text && second is string wanted ? text == wanted : first is JsonElement json && second is JsonElement other && json.ValueKind == other.ValueKind && json.GetRawText() == other.GetRawText();
  private static NativeSessionRequestException Refuse() => new(409);
  private sealed record NativePlan(IReadOnlyList<CallGroup> Groups, IReadOnlyList<string> Events, int Anchor, IReadOnlyList<IReadOnlyList<string>> ResultGroups, IReadOnlyList<string> HeldOrder);
  private sealed record CallGroup(MessageHeader Header, IReadOnlyList<string> Ids);
  private sealed record DeferredCall(string Name, JsonNode Arguments);
  private sealed record MessageHeader(ChatRole Role, string? Id, string? Author, DateTimeOffset? CreatedAt);
  private sealed class Member(string id, string name, JsonNode arguments, bool browser, string? browserResult, string? requestId)
  {
    internal string Id { get; } = id;
    internal string Name { get; } = name;
    internal JsonNode Arguments { get; } = arguments;
    internal bool Browser { get; } = browser;
    internal string? BrowserResult { get; } = browserResult;
    internal string? RequestId { get; } = requestId;
    internal MessageHeader? CallHeader { get; set; }
    internal MessageHeader? ResultHeader { get; set; }
    internal int ResidualIndex { get; set; }
  }
}
