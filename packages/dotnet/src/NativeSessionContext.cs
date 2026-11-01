#pragma warning disable MAAI001, MEAI001 // Pinned MAF 1.26.0 public native-session boundary is experimental.
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using AGUI.Abstractions;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;

namespace Hashbrown.AspNetCore;

/// <summary>Request-local native capability. Only the authenticated composition can create or admit one.</summary>
internal sealed class NativeSessionContext : IAsyncDisposable
{
  /// <summary>Maximum pre-work grace period for a current publisher to finish its reserved write.</summary>
  private static readonly TimeSpan PublicationAdmissionWait = TimeSpan.FromSeconds(1);
  private static readonly TimeSpan PublicationAdmissionPoll = TimeSpan.FromMilliseconds(25);
  private readonly CancellationTokenSource _work;
  private readonly Action<string>? _observer;
  private readonly CancellationTokenSource _heartbeatStop = new();
  private readonly ConcurrentDictionary<string, NativeToolCall> _pending = new(StringComparer.Ordinal);
  private readonly ConcurrentDictionary<string, NativeToolCall> _witnesses = new(StringComparer.Ordinal);
  private Task? _heartbeat;
  private AgentSession? _session;
  private readonly RunAgentInput _originalInput;
  private bool _closed;
  private bool _disposed;
  private bool? _cleanupResult;
  internal NativeSessionContext(NativeSessionRegistration registration, HttpContext http, RunAgentInput input, string scope, string isolation, string originalRaw, NativeApprovalAdmissionEnvelope? decisions, NativeBrowserRecoveryRequest? recovery, Action<string>? observer = null)
  {
    _observer = observer;
    Registration = registration; Http = http; _originalInput = input; Scope = scope; Isolation = isolation;
    OriginalRaw = originalRaw; Decisions = decisions; Recovery = recovery;
    Input = recovery is null ? input : JsonSerializer.Deserialize(NativeBrowserRecoveryAdmission.Sanitize(originalRaw, removeResume: false).ToJsonString(), AGUIJsonSerializerContext.Default.RunAgentInput)!;
    var publicInput = recovery is null ? System.Text.Json.Nodes.JsonNode.Parse(originalRaw)!.AsObject() : NativeBrowserRecoveryAdmission.Sanitize(originalRaw);
    publicInput.Remove("resume");
    PublicRequest = publicInput.ToJsonString();
    _work = CancellationTokenSource.CreateLinkedTokenSource(http.RequestAborted);
  }
  internal NativeSessionRegistration Registration { get; }
  internal HttpContext Http { get; }
  internal RunAgentInput Input { get; }
  internal string Scope { get; }
  internal string Isolation { get; }
  internal string PublicRequest { get; private set; }
  internal RunAgentInput? TransportInput { get; set; }
  /// <summary>Emits immutable diagnostic values only; callbacks never grant native authority.</summary>
  internal void Observe(string stage, string? value = null) => NativeSessionObservation.Record(_observer, stage, value);
  /// <summary>Snapshots public input only when the internal passive observer is installed.</summary>
  internal void ObserveInput(string stage, RunAgentInput input)
  {
    if (_observer is not null) Observe(stage, JsonSerializer.Serialize(input, AGUIJsonSerializerContext.Default.RunAgentInput));
  }
  internal string OriginalRaw { get; }
  internal NativeApprovalAdmissionEnvelope? Decisions { get; private set; }
  internal NativeBrowserRecoveryRequest? Recovery { get; }
  internal NativeApprovalEvidence? ApprovalEvidence { get; private set; }
  internal NativeRecoveredProviderInputProjection? RecoveredProviderInput { get; private set; }
  /// <summary>Captures the fixed current recovery layout after restoration and before native execution.</summary>
  internal void PrepareRecoveredProviderInput(IReadOnlyList<ChatMessage> prepared)
  {
    if (Recovery is null) return;
    RequireSession(_session);
    if (RecoveredProviderInput is not null) throw new NativeSessionRequestException(409);
    RecoveredProviderInput = NativeRecoveredProviderInputProjection.Create(prepared, this);
  }
  private readonly List<NativeApprovalDescriptor> _protectedRequests = [];
  private readonly List<NativeBrowserRequestBinding> _browserRequests = [];
  private readonly object _recoveryResultLock = new();
  private readonly Dictionary<string, NativeBrowserRecoveryResultWitness> _pendingRecoveryResults = new(StringComparer.Ordinal);
  private readonly Dictionary<string, NativeBrowserRecoveryResultWitness> _completedRecoveryResults = new(StringComparer.Ordinal);
  private readonly HashSet<string> _observedRecoveryResults = new(StringComparer.Ordinal);
  private readonly HashSet<string> _durablyCompletedRecoveryCalls = new(StringComparer.Ordinal);
  private readonly ConcurrentDictionary<string, (NativeToolCall Call, string Token, long Generation)> _completedCurrentDispatches = new(StringComparer.Ordinal);
  private long _recoveryResultBytes;
  private long _heldRecoveryEvidenceBytes;
  private int _heldRecoveryResultReservations;
  private NativeHeldRecoveryRegistry? _heldRecovery;
  internal object RecoveryEvidenceSync => _recoveryResultLock;
  private readonly string _batchId = Guid.NewGuid().ToString("N");
  internal NativeApprovalBatch? CapturedApprovalBatch => _protectedRequests.Count == 0 ? null : new(_batchId, _protectedRequests, _browserRequests);
  internal NativeSessionAdmission? Admission { get; private set; }
  internal NativeSessionLease Lease => Admission?.Lease ?? throw new NativeSessionRequestException(409);
  internal NativeSavedReceipt? Receipt { get; set; }
  internal NativeSessionProjection? Projection { get; set; }
  internal CancellationToken Cancellation => _work.Token;
  internal bool Bound => !_closed && _session is not null && !_work.IsCancellationRequested;
  internal static NativeSessionContext? Get(HttpContext? context) => context?.Items[typeof(NativeSessionContext)] as NativeSessionContext;
  internal async ValueTask AdmitAsync(AIAgent agent, AgentSessionStoreKey key, CancellationToken cancellationToken)
  {
    if (_closed || Admission is not null || agent.Name != Registration.AgentName || key.SessionId != Input.ThreadId ||
        key.Partitions is null || !key.Partitions.TryGetValue("isolation", out var isolation) || isolation != Isolation) throw new NativeSessionRequestException(409);
    Observe("Store.Key", JsonSerializer.Serialize(new { key.SessionId, key.Partitions }));
    var ownedKey = new NativeSessionKey(Registration.AgentName, Scope, key.SessionId, key.Partitions);
    Observe("Acquire.Start");
    Admission = await AcquireAsync(ownedKey, cancellationToken);
    Observe("Acquire.Completed", Admission.Status.ToString(System.Globalization.CultureInfo.InvariantCulture));
    if (Admission.Status != 200 || Admission.Lease is null) throw new NativeSessionRequestException(Admission.Status);
    if (Recovery is not null)
    {
      if (Admission.IsNew || Admission.Snapshot is not { NativeJson: not null } saved) throw new NativeSessionRequestException(503);
      try
      {
        var sanitized = NativeBrowserRecoveryAdmission.Sanitize(OriginalRaw, saved.PublicRequest);
        PublicRequest = sanitized.ToJsonString();
        Input.ForwardedProperties = JsonSerializer.Deserialize(PublicRequest, AGUIJsonSerializerContext.Default.RunAgentInput)!.ForwardedProperties?.Clone();
        if (TransportInput is not null) TransportInput.ForwardedProperties = Input.ForwardedProperties?.Clone();
        if (Decisions is not null) Decisions = new(NativeSessionHistory.Normalize(PublicRequest, ownedKey, Registration.Catalog, Registration.Options), Decisions.Decisions);
      }
      catch (Exception exception) when (exception is ArgumentException or JsonException or InvalidOperationException) { throw new NativeSessionRequestException(503); }
    }
    foreach (var call in Admission.Snapshot?.PendingCalls ?? []) { _pending[call.Id] = call; _witnesses[call.Id] = call; }
    _heartbeat = HeartbeatAsync();
    if (Decisions is not null)
    {
      Observe("Evidence.Start");
      var evidence = await Registration.Journal.GetOwnedApprovalEvidenceAsync(Lease, cancellationToken);
      Observe("Reserve.Start");
      if (evidence is null || !await Registration.Journal.TryAdmitApprovalBatchAsync(Lease, evidence.Batch.Batch.BatchId, Decisions, cancellationToken)) throw new NativeSessionRequestException(409);
      Observe("Reserve.Committed");
      ApprovalEvidence = await Registration.Journal.GetOwnedApprovalEvidenceAsync(Lease, cancellationToken) ?? throw new NativeSessionRequestException(409);
      if (ApprovalEvidence.State != NativeApprovalState.DecisionAdmitted || ApprovalEvidence.AdmittedGeneration != Lease.Generation) throw new NativeSessionRequestException(409);
      Observe("Admission.Completed");
    }
    if (Recovery is not null)
    {
      Projection?.AdoptAdmittedForwardedProperties(PublicRequest);
      ObserveInput("Executable.Typed.Admitted", Input);
      if (TransportInput is not null) ObserveInput("Transport.Typed.Admitted", TransportInput);
      Observe("Public.Admitted", PublicRequest);
    }
  }
  /// <summary>Resolves finalization races with authoritative retries, waiting briefly only on a live Publishing observation.</summary>
  private async ValueTask<NativeSessionAdmission> AcquireAsync(NativeSessionKey key, CancellationToken cancellationToken)
  {
    if (Recovery is not null)
      return Registration.Journal is INativeSessionBrowserRecoveryJournal capable
          ? await capable.TryAcquireBrowserRecoveryAsync(key, OriginalRaw, Recovery, cancellationToken)
          : new NativeSessionAdmission(406);
    var admission = await Registration.Journal.TryAcquireAsync(key, OriginalRaw, cancellationToken);
    if (admission.Status != 409) return admission;
    var started = Stopwatch.GetTimestamp();
    using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, Cancellation);
    budget.CancelAfter(PublicationAdmissionWait);
    try
    {
      while (admission.Status == 409)
      {
        if (Stopwatch.GetElapsedTime(started) >= PublicationAdmissionWait) return admission;
        var status = await Registration.Journal.ReadStatusAsync(key, budget.Token);
        if (status.Status != 200) return new NativeSessionAdmission(status.Status);
        if (status.State == "Ready") return await Registration.Journal.TryAcquireAsync(key, OriginalRaw, budget.Token);
        // Expiry can only refuse this wait. Actual ownership always comes from the journal's database-clock acquisition.
        if (status.State != "Publishing" || status.LeaseUntil is null || status.LeaseUntil <= DateTimeOffset.UtcNow) return admission;
        var remaining = PublicationAdmissionWait - Stopwatch.GetElapsedTime(started);
        if (remaining <= TimeSpan.Zero) return admission;
        await Task.Delay(remaining < PublicationAdmissionPoll ? remaining : PublicationAdmissionPoll, budget.Token);
        admission = await Registration.Journal.TryAcquireAsync(key, OriginalRaw, budget.Token);
      }
      return admission;
    }
    catch (OperationCanceledException) when (budget.IsCancellationRequested && !cancellationToken.IsCancellationRequested && !Cancellation.IsCancellationRequested)
    { return admission; }
  }
  /// <summary>Requires successful actual-key ownership and any complete decision reservation before native session preparation.</summary>
  internal void RequireSessionPreparation(bool creating)
  {
    Cancellation.ThrowIfCancellationRequested();
    if (_closed || _session is not null || Admission?.Status != 200 || Admission.Lease is null || Admission.IsNew != creating || Decisions is not null && (ApprovalEvidence?.State != NativeApprovalState.DecisionAdmitted || ApprovalEvidence.AdmittedGeneration != Lease.Generation)) throw new NativeSessionRequestException(409);
  }
  internal void Bind(AgentSession session)
  {
    Cancellation.ThrowIfCancellationRequested();
    if (_closed || Admission?.Lease is null || _session is not null) throw new NativeSessionRequestException(409);
    _session = session;
    if (Recovery is not null) _heldRecovery = NativeHeldRecoveryRegistry.Create(this);
  }
  internal void Require(AIAgent agent, AgentSessionStoreKey key, AgentSession session)
  {
    RequireSession(session);
    if (agent.Name != Registration.AgentName || new NativeSessionKey(Registration.AgentName, Scope, key.SessionId, key.Partitions ?? throw new NativeSessionRequestException(409)).Id != Lease.Key.Id) throw new NativeSessionRequestException(409);
  }
  internal void RequireSession(AgentSession? session)
  {
    Cancellation.ThrowIfCancellationRequested();
    if (!Bound || !ReferenceEquals(session, _session)) throw new NativeSessionRequestException(409);
  }
  internal async ValueTask CaptureAsync(Microsoft.Extensions.AI.FunctionCallContent content, CancellationToken cancellationToken)
  {
    try
    {
      if (!Bound) throw new NativeSessionRequestException(409);
      var call = Registration.Catalog.CreateCall(content.CallId, content.Name, NativeSessionJson.SerializeArguments(content.Arguments ?? new Dictionary<string, object?>(), Registration.Options.ArgumentBytes));
      if (!await Registration.Journal.CaptureModelCallAsync(Lease, call, cancellationToken)) throw new NativeSessionRequestException(409);
      if (!_pending.TryAdd(call.Id, call)) throw new NativeSessionRequestException(409);
      _witnesses[call.Id] = call;
    }
    catch { await CancelWorkAsync(); throw; }
  }
  /// <summary>Captures genuine native requests before public projection against independently captured model calls.</summary>
  internal void ObserveApproval(ToolApprovalRequestContent request, string? messageId, int contentIndex)
  {
    RequireSession(_session);
    if (request.ToolCall is not FunctionCallContent call || request.AdditionalProperties?.Count > 0 || request.Annotations?.Count > 0 || call.AdditionalProperties?.Count > 0 || call.Annotations?.Count > 0 || _protectedRequests.Count + _browserRequests.Count >= Registration.Options.MaximumCalls)
      throw new NativeSessionRequestException(503);
    var location = new NativeRequestLocation(messageId, null, contentIndex);
    if (_protectedRequests.Any(item => item.RequestId == request.RequestId || item.Call.Id == call.CallId) || _browserRequests.Any(item => item.RequestId == request.RequestId || item.CallId == call.CallId)) throw new NativeSessionRequestException(503);
    if (request.RequiresConfirmation)
    {
      if (!_witnesses.TryGetValue(call.CallId, out var owned) || !Registration.Catalog.RequiresConfirmation(call.Name) || !MatchesOwnedCall(call.CallId, call.Name, System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(call.Arguments)))) throw new NativeSessionRequestException(409);
      _protectedRequests.Add(new(request.RequestId, owned, location));
    }
    else
    {
      if (!(Input.Tools ?? []).Any(tool => tool.Name == call.Name) || Registration.Catalog.Contains(call.Name)) throw new NativeSessionRequestException(409);
      _browserRequests.Add(new(request.RequestId, call.CallId, call.Name, NativeSessionJson.SerializeArguments(call.Arguments ?? new Dictionary<string, object?>(), Registration.Options.ArgumentBytes), location));
    }
  }
  /// <summary>Persists the complete genuine observation before the upstream terminal can be saved.</summary>
  internal async ValueTask CaptureApprovalBatchAsync()
  {
    if (CapturedApprovalBatch is { } batch && !await Registration.Journal.CaptureApprovalBatchAsync(Lease, batch, Cancellation)) throw new NativeSessionRequestException(409);
  }
  /// <summary>Requires the already bound admitted recovery session without invoking application code.</summary>
  internal void RequireHeldRecoveryAccess()
  {
    RequireSession(_session);
    if (Recovery is null || Admission is not { Status: 200, Lease: not null, Snapshot: not null }) throw new NativeSessionRequestException(409);
  }
  /// <summary>Charges retained hidden descriptor/observation bytes against the same protected/held result budget.</summary>
  internal void ChargeHeldRecoveryEvidence(long bytes)
  {
    lock (_recoveryResultLock)
    {
      if (bytes < 0 || bytes > Registration.Options.PublicBytes - _recoveryResultBytes - _heldRecoveryEvidenceBytes) throw new NativeSessionRequestException(409);
      _heldRecoveryEvidenceBytes += bytes;
    }
  }
  /// <summary>Reserves one held actual-return record in the shared protected/held aggregate budget.</summary>
  internal void ReserveHeldRecoveryResult(int bytes)
  {
    lock (_recoveryResultLock)
    {
      if (_pendingRecoveryResults.Count + _completedRecoveryResults.Count + _heldRecoveryResultReservations >= Registration.Options.MaximumCalls) throw new NativeSessionRequestException(503);
      ChargeHeldRecoveryEvidence(bytes); _heldRecoveryResultReservations++;
    }
  }
  /// <summary>Stages an independent fixed held actual return before native durable completion.</summary>
  internal NativeHeldRecoveryResultWitness? SnapshotHeldRecoveryResult(NativeToolCall call, object? result) => _heldRecovery?.Snapshot(call, result);
  /// <summary>Publishes only a same-claim durably completed staged held return.</summary>
  internal void PublishHeldRecoveryResult(NativeToolCall call, NativeHeldRecoveryResultWitness? witness) => _heldRecovery?.Publish(call, witness);
  /// <summary>Observes genuine fixed P/H call groups before public output filtering.</summary>
  internal void ObserveHeldRecoveryCalls(AgentResponseUpdate update) => _heldRecovery?.ObserveCalls(update);

  /// <summary>Returns only the fixed hidden manifest captured at this session's Bind boundary.</summary>
  internal NativeHeldRecoveryManifest ReadHeldRecoveryManifest() => (_heldRecovery ?? throw new NativeSessionRequestException(409)).ReadManifest();
  /// <summary>Returns only complete immutable hidden evidence bound to the exact owning manifest.</summary>
  internal NativeHeldRecoverySeal ReadSealedHeldRecovery(NativeHeldRecoveryManifest manifest) => (_heldRecovery ?? throw new NativeSessionRequestException(409)).ReadSeal(manifest);

  /// <summary>Snapshots an actual current approved invocation return before completion, without publishing result authority.</summary>
  internal NativeBrowserRecoveryResultWitness? SnapshotRecoveryResult(NativeToolCall call, object? result)
  {
    if (Recovery is null) return null;
    RequireSession(_session);
    var evidence = ApprovalEvidence;
    var descriptor = evidence?.Batch.Batch.ProtectedRequests.SingleOrDefault(item => item.Call.Id == call.Id);
    if (descriptor is null) return null;
    if (evidence!.State != NativeApprovalState.DecisionAdmitted || evidence.AdmittedGeneration != Lease.Generation || evidence.Decisions.Single(item => item.RequestId == descriptor.RequestId).Kind != NativeApprovalDecisionKind.Approved) throw new NativeSessionRequestException(409);
    var snapshot = NativeBrowserRecoveryResultSnapshot.Create(result, Registration.Options.PublicBytes);
    var witness = new NativeBrowserRecoveryResultWitness(call.Id, descriptor.RequestId, evidence.Batch.Batch.BatchId, Lease.Token, Lease.Generation, snapshot);
    lock (_recoveryResultLock)
    {
      if (_pendingRecoveryResults.ContainsKey(call.Id) || _completedRecoveryResults.ContainsKey(call.Id) || _pendingRecoveryResults.Count + _completedRecoveryResults.Count + _heldRecoveryResultReservations >= Registration.Options.MaximumCalls || _recoveryResultBytes + _heldRecoveryEvidenceBytes + snapshot.Bytes > Registration.Options.PublicBytes) throw new NativeSessionRequestException(503);
      _pendingRecoveryResults.Add(call.Id, witness); _recoveryResultBytes += snapshot.Bytes;
    }
    return witness;
  }

  /// <summary>Publishes only the exact staged snapshot after the same owned call has durably completed dispatch.</summary>
  internal void PublishRecoveryResult(NativeToolCall call, NativeBrowserRecoveryResultWitness? witness)
  {
    if (witness is null) return;
    RequireSession(_session);
    lock (_recoveryResultLock)
    {
      if (!_durablyCompletedRecoveryCalls.Contains(call.Id) || witness.CallId != call.Id || witness.OwnerToken != Lease.Token || witness.Generation != Lease.Generation || ApprovalEvidence?.Batch.Batch.BatchId != witness.BatchId || !_pendingRecoveryResults.TryGetValue(call.Id, out var pending) || !ReferenceEquals(pending, witness) || _completedRecoveryResults.ContainsKey(call.Id)) throw new NativeSessionRequestException(409);
      _pendingRecoveryResults.Remove(call.Id); _completedRecoveryResults.Add(call.Id, witness);
    }
  }

  /// <summary>Recognizes only an exact already-admitted browser observation, never a new native settlement.</summary>
  internal bool IsRecoveredBrowserResultEcho(FunctionResultContent result)
  {
    if (Recovery is null || !Recovery.Outcomes.Any(item => item.ToolCallId == result.CallId)) return false;
    RequireSession(_session);
    NativeBrowserRecoveryResultSnapshot.RequirePlain(result);
    var original = System.Text.Json.Nodes.JsonNode.Parse(PublicRequest)!["messages"]!.AsArray().SingleOrDefault(item => item?["role"]?.GetValue<string>() == "tool" && item["toolCallId"]?.GetValue<string>() == result.CallId);
    if (original is null || result.Result is not string text || !string.Equals(text, original["content"]!.GetValue<string>(), StringComparison.Ordinal)) throw new NativeSessionRequestException(409);
    return true;
  }

  /// <summary>Returns an owned immutable copy only after every original protected result is independently completed, observed and bound to this active claim.</summary>
  internal IReadOnlyDictionary<string, NativeBrowserRecoveryResultWitness> ReadObservedRecoveryResults()
  {
    RequireSession(_session);
    if (Recovery is null || Admission is not { Status: 200, Lease: not null, Snapshot: { } saved }) throw new NativeSessionRequestException(409);
    var evidence = ApprovalEvidence;
    if (evidence is null && saved.Approvals.PendingBatch is not null) throw new NativeSessionRequestException(409);
    if (evidence is not null && (evidence.State != NativeApprovalState.DecisionAdmitted || evidence.AdmittedGeneration != Lease.Generation || evidence.AdmittedRevision is null || evidence.SessionKeyId != Lease.Key.Id || evidence.CatalogIdentity != Registration.Catalog.Identity || evidence.CurrentOwner.Key.Id != Lease.Key.Id || evidence.CurrentOwner.Token != Lease.Token || evidence.CurrentOwner.Generation != Lease.Generation || evidence.CurrentOwner.Revision != Lease.Revision)) throw new NativeSessionRequestException(409);
    var descriptors = evidence?.Batch.Batch.ProtectedRequests ?? [];
    lock (_recoveryResultLock)
    {
      if (_pendingRecoveryResults.Count != 0 || _completedRecoveryResults.Count != descriptors.Count || _observedRecoveryResults.Count != descriptors.Count || _recoveryResultBytes + _heldRecoveryEvidenceBytes > Registration.Options.PublicBytes) throw new NativeSessionRequestException(409);
      var owned = new Dictionary<string, NativeBrowserRecoveryResultWitness>(StringComparer.Ordinal);
      foreach (var descriptor in descriptors)
      {
        if (!_completedRecoveryResults.TryGetValue(descriptor.Call.Id, out var witness) || !_observedRecoveryResults.Contains(descriptor.Call.Id) || witness.CallId != descriptor.Call.Id || witness.RequestId != descriptor.RequestId || witness.BatchId != evidence!.Batch.Batch.BatchId || witness.OwnerToken != Lease.Token || witness.Generation != Lease.Generation || witness.Snapshot.Bytes > Registration.Options.PublicBytes || evidence.Decisions.Single(item => item.RequestId == descriptor.RequestId).Kind == NativeApprovalDecisionKind.Approved && !_durablyCompletedRecoveryCalls.Contains(descriptor.Call.Id)) throw new NativeSessionRequestException(409);
        owned.Add(descriptor.Call.Id, witness);
      }
      return new System.Collections.ObjectModel.ReadOnlyDictionary<string, NativeBrowserRecoveryResultWitness>(owned);
    }
  }

  /// <summary>Checks a fresh completed captured descriptor against the received ordinary call without granting current recovery authority.</summary>
  internal bool MatchesCompletedCapturedCall(string? id, string? name, System.Text.Json.Nodes.JsonNode? arguments)
  {
    return MatchesCapturedRecoveryCall(id, name, arguments) && IsCompletedCurrentDispatch(id!);
  }

  /// <summary>Compares only independently captured immutable descriptor metadata without invoking application validation.</summary>
  internal bool MatchesCapturedRecoveryCall(string? id, string? name, System.Text.Json.Nodes.JsonNode? arguments)
  {
    RequireSession(_session);
    return id is not null && _witnesses.TryGetValue(id, out var captured) && Registration.Catalog.HasVersion(captured) && captured.Name == name && System.Text.Json.Nodes.JsonNode.DeepEquals(System.Text.Json.Nodes.JsonNode.Parse(captured.Arguments.GetRawText()), arguments);
  }

  /// <summary>Permits ordinary fresh native results only after independent model capture and the same request's durable dispatch completion.</summary>
  private bool IsCompletedCurrentDispatch(string callId)
  {
    if (!_witnesses.TryGetValue(callId, out var captured) || !_completedCurrentDispatches.TryGetValue(callId, out var completed) || completed.Token != Lease.Token || completed.Generation != Lease.Generation) return false;
    return captured.Name == completed.Call.Name && captured.Version == completed.Call.Version && Registration.Catalog.HasVersion(completed.Call) && System.Text.Json.Nodes.JsonNode.DeepEquals(System.Text.Json.Nodes.JsonNode.Parse(captured.Arguments.GetRawText()), System.Text.Json.Nodes.JsonNode.Parse(completed.Call.Arguments.GetRawText()));
  }

  /// <summary>Accepts an approved outward result only once against its independent completed actual-return snapshot.</summary>
  private void ObserveCompletedRecoveryResult(NativeApprovalDescriptor descriptor, FunctionResultContent result)
  {
    NativeBrowserRecoveryResultSnapshot.RequirePlain(result);
    lock (_recoveryResultLock)
    {
      if (!_completedRecoveryResults.TryGetValue(result.CallId, out var witness) || witness.RequestId != descriptor.RequestId || witness.OwnerToken != Lease.Token || witness.Generation != Lease.Generation || witness.BatchId != ApprovalEvidence?.Batch.Batch.BatchId || !witness.Snapshot.Matches(result.Result) || !_observedRecoveryResults.Add(result.CallId)) throw new NativeSessionRequestException(409);
    }
  }

  /// <summary>Records a genuine rejection only after its existing exact durable settlement has succeeded.</summary>
  private void ObserveSettledRecoveryRejection(NativeApprovalDescriptor descriptor, FunctionResultContent result)
  {
    var snapshot = NativeBrowserRecoveryResultSnapshot.Create(result.Result, Registration.Options.PublicBytes);
    lock (_recoveryResultLock)
    {
      if (_pendingRecoveryResults.ContainsKey(result.CallId) || _completedRecoveryResults.ContainsKey(result.CallId) || _pendingRecoveryResults.Count + _completedRecoveryResults.Count + _heldRecoveryResultReservations >= Registration.Options.MaximumCalls || _recoveryResultBytes + _heldRecoveryEvidenceBytes + snapshot.Bytes > Registration.Options.PublicBytes) throw new NativeSessionRequestException(409);
      var witness = new NativeBrowserRecoveryResultWitness(result.CallId, descriptor.RequestId, ApprovalEvidence!.Batch.Batch.BatchId, Lease.Token, Lease.Generation, snapshot);
      _completedRecoveryResults.Add(result.CallId, witness); _observedRecoveryResults.Add(result.CallId); _recoveryResultBytes += snapshot.Bytes;
    }
  }

  /// <summary>Settles only a genuine native no-dispatch rejection against its consumed owned decision.</summary>
  internal async ValueTask ObserveApprovalResultAsync(FunctionResultContent result)
  {
    if (IsRecoveredBrowserResultEcho(result)) return;
    if (_heldRecovery?.ObserveResult(result) == true) return;
    if (Recovery is not null && ApprovalEvidence?.Batch.Batch.ProtectedRequests.Any(item => item.Call.Id == result.CallId) != true)
    {
      RequireSession(_session);
      if (!IsCompletedCurrentDispatch(result.CallId)) throw new NativeSessionRequestException(409);
    }
    if (ApprovalEvidence is not { } evidence) return;
    var descriptor = evidence.Batch.Batch.ProtectedRequests.SingleOrDefault(item => item.Call.Id == result.CallId);
    if (descriptor is null)
    {
      var browser = evidence.Batch.Batch.BrowserBindings.SingleOrDefault(item => item.CallId == result.CallId);
      if (browser is not null && !await Registration.Journal.SettleBrowserBypassResultAsync(Lease, evidence.Batch.Batch.BatchId, browser.RequestId, browser.CallId, JsonSerializer.SerializeToElement(result.Result), Cancellation)) throw new NativeSessionRequestException(409);
      return;
    }
    var decision = evidence.Decisions.Single(item => item.RequestId == descriptor.RequestId);
    if (decision.Kind == NativeApprovalDecisionKind.Approved)
    {
      if (Recovery is not null) ObserveCompletedRecoveryResult(descriptor, result);
      return;
    }
    if (Recovery is not null)
    {
      NativeBrowserRecoveryResultSnapshot.RequirePlain(result);
      var expected = decision.Kind == NativeApprovalDecisionKind.Declined ? "Tool call invocation rejected." : "Tool call invocation rejected. Cancelled by caller.";
      if (result.Result is not string text || !string.Equals(text, expected, StringComparison.Ordinal)) throw new NativeSessionRequestException(409);
      lock (_recoveryResultLock)
        if (_pendingRecoveryResults.ContainsKey(result.CallId) || _completedRecoveryResults.ContainsKey(result.CallId) || _observedRecoveryResults.Contains(result.CallId)) throw new NativeSessionRequestException(409);
    }
    var serialized = Recovery is null ? JsonSerializer.SerializeToElement(result.Result) : JsonSerializer.SerializeToElement((string)result.Result!);
    if (!await Registration.Journal.SettleApprovalRejectionAsync(Lease, new(evidence.Batch.Batch.BatchId, descriptor.RequestId, descriptor.Call.Id, decision.Kind, serialized), Cancellation)) throw new NativeSessionRequestException(409);
    _pending.TryRemove(descriptor.Call.Id, out _);
    if (Recovery is not null) ObserveSettledRecoveryRejection(descriptor, result);
  }
  /// <summary>Projects only server-owned captured or admitted witnesses; provider diagnostics grant no approval authority.</summary>
  internal IReadOnlyList<NativeProjectionApproval> ProjectionApprovals()
  {
    var pending = CapturedApprovalBatch;
    var bound = ApprovalEvidence?.Batch;
    var result = new List<NativeProjectionApproval>();
    if (pending is not null) Add(pending, true, null);
    else foreach (var item in _browserRequests)
      result.Add(new(item.RequestId, item.CallId, item.Name, item.Arguments.Clone(), false, true, item.NativeLocation.MessageId, item.NativeLocation.ContentIndex));
    if (bound is not null) Add(bound.Batch, false, bound);
    return result.AsReadOnly();
    void Add(NativeApprovalBatch batch, bool isPending, NativeBoundApprovalBatch? locations)
    {
      foreach (var item in batch.ProtectedRequests) AddItem(item.RequestId, item.Call.Id, item.Call.Name, item.Call.Arguments, true, item.NativeLocation);
      foreach (var item in batch.BrowserBindings) AddItem(item.RequestId, item.CallId, item.Name, item.Arguments, false, item.NativeLocation);
      void AddItem(string request, string call, string name, JsonElement arguments, bool protectedCall, NativeRequestLocation native)
      {
        var location = locations?.PublicLocations[request];
        result.Add(new(request, call, name, arguments.Clone(), protectedCall, isPending, native.MessageId, native.ContentIndex, location?.AssistantMessageId, location?.MessageIndex, location?.CallIndex));
      }
    }
  }
  internal async ValueTask<NativeToolCall> StartAsync(string callId, string name, JsonElement arguments, AgentSession? session, CancellationToken cancellationToken)
  {
    RequireSession(session);
    var call = await Registration.Journal.GetOwnedCallAsync(Lease, callId, cancellationToken);
    if (call is null || name != call.Name || !Registration.Catalog.Matches(call) || !System.Text.Json.Nodes.JsonNode.DeepEquals(System.Text.Json.Nodes.JsonNode.Parse(call.Arguments.GetRawText()), System.Text.Json.Nodes.JsonNode.Parse(arguments.GetRawText())) ||
        !await Registration.Journal.TryStartDispatchAsync(Lease, call, cancellationToken)) throw new NativeSessionRequestException(409);
    Cancellation.ThrowIfCancellationRequested();
    return call;
  }
  internal async ValueTask CompleteAsync(NativeToolCall call, CancellationToken cancellationToken)
  {
    if (!await Registration.Journal.CompleteDispatchAsync(Lease, call, cancellationToken)) throw new NativeSessionRequestException(409);
    if (Recovery is not null && !_completedCurrentDispatches.TryAdd(call.Id, (call, Lease.Token, Lease.Generation))) throw new NativeSessionRequestException(409);
    lock (_recoveryResultLock)
      if (_pendingRecoveryResults.ContainsKey(call.Id) && !_durablyCompletedRecoveryCalls.Add(call.Id)) throw new NativeSessionRequestException(409);
    _pending.TryRemove(call.Id, out _);
  }
  internal async ValueTask CancelWorkAsync()
  {
    try { await _work.CancelAsync(); }
    catch (Exception exception) { Http.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("NativeSessionCancellation").LogWarning(exception, "Native work cancellation callback failed; authority remains fenced."); }
  }
  internal IReadOnlyList<NativeToolCall> PendingCalls() => _pending.Values.OrderBy(call => call.Id, StringComparer.Ordinal).ToArray();
  internal bool MatchesOwnedCall(string? id, string? name, System.Text.Json.Nodes.JsonNode? arguments) =>
      id is not null && _witnesses.TryGetValue(id, out var call) && call.Name == name && Registration.Catalog.Matches(call) &&
      System.Text.Json.Nodes.JsonNode.DeepEquals(System.Text.Json.Nodes.JsonNode.Parse(call.Arguments.GetRawText()), arguments);
  private async Task HeartbeatAsync()
  {
    try
    {
      using var timer = new PeriodicTimer(TimeSpan.FromTicks(Math.Max(TimeSpan.FromMilliseconds(10).Ticks, Registration.Options.Lease.Ticks / 3)));
      while (await timer.WaitForNextTickAsync(_heartbeatStop.Token))
        if (!await Registration.Journal.RenewAsync(Lease, _heartbeatStop.Token)) { await CancelWorkAsync(); return; }
    }
    catch (OperationCanceledException) when (_heartbeatStop.IsCancellationRequested) { }
    catch (Exception exception)
    {
      Http.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("NativeSessionLease").LogWarning(exception, "Native session renewal failed; request authority is cancelled.");
      await CancelWorkAsync();
    }
  }
  internal async ValueTask<bool> CleanupAsync()
  {
    if (_cleanupResult is { } completed) return completed;
    _closed = true;
    await _heartbeatStop.CancelAsync();
    if (_heartbeat is not null) await _heartbeat;
    if (Admission?.Lease is null) return (_cleanupResult = true).Value;
    using var budget = new CancellationTokenSource(TimeSpan.FromSeconds(3));
    try { return (_cleanupResult = await Registration.Journal.FailureCleanupAsync(Lease, budget.Token)).Value; }
    catch (Exception exception)
    {
      Http.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("NativeSessionCleanup").LogWarning(exception, "Native session cleanup failed; durable fences remain retained.");
      return (_cleanupResult = false).Value;
    }
  }
  public async ValueTask DisposeAsync()
  {
    if (_disposed) return;
    _disposed = true;
    try { await CleanupAsync(); }
    finally
    {
      Observe("Original.Raw.After", OriginalRaw);
      ObserveInput("Original.Typed.After", _originalInput);
      if (TransportInput is not null) ObserveInput("Transport.Typed.After", TransportInput);
      Observe("Context.Disposed");
      lock (_recoveryResultLock) { _pendingRecoveryResults.Clear(); _completedRecoveryResults.Clear(); _observedRecoveryResults.Clear(); _durablyCompletedRecoveryCalls.Clear(); _completedCurrentDispatches.Clear(); RecoveredProviderInput = null; _heldRecovery = null; _recoveryResultBytes = 0; _heldRecoveryEvidenceBytes = 0; _heldRecoveryResultReservations = 0; }
      _heartbeatStop.Dispose(); _work.Dispose();
    }
  }
}

/// <summary>Server-owned immutable configuration shared by one named native composition.</summary>
internal sealed record NativeSessionRegistration(string AgentName, INativeSessionJournal Journal, NativeToolCatalog Catalog, Func<HttpContext, string?> Scope, NativeSessionOptions Options);
/// <summary>Bounded pre-work native admission failure; never includes private session data.</summary>
internal sealed class NativeSessionRequestException(int status) : InvalidOperationException("Native session admission or ownership is unavailable.")
{
  internal int Status { get; } = status;
}
