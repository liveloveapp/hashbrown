namespace Hashbrown.AspNetCore;

/// <summary>One explicit browser settlement descriptor. The result value exists only in its canonical tool message.</summary>
public sealed class NativeBrowserRecoveryOutcome
{
  /// <summary>Creates an immutable descriptor for a known result or an explicitly unavailable result.</summary>
  public NativeBrowserRecoveryOutcome(string toolCallId, string status)
  {
    ToolCallId = NativeSessionKey.Required(toolCallId);
    Status = status is "result" or "unavailable" ? status : throw new ArgumentException("Unsupported browser recovery outcome.");
  }
  /// <summary>Original browser call identity.</summary>
  public string ToolCallId { get; }
  /// <summary>Exact wire status: result or unavailable.</summary>
  public string Status { get; }
}

/// <summary>Immutable request-local evidence, never a substitute for authoritative journal validation.</summary>
public sealed class NativeBrowserRecoveryRequest
{
  /// <summary>Copies a complete unique bounded settlement set with its captured positive safe server revision.</summary>
  public NativeBrowserRecoveryRequest(int protocolVersion, long serverRevision, IReadOnlyList<NativeBrowserRecoveryOutcome> outcomes)
  {
    if (protocolVersion != 1 || serverRevision is < 1 or > 9007199254740991L) throw new ArgumentException("Unsupported browser recovery version or revision.");
    ArgumentNullException.ThrowIfNull(outcomes);
    if (outcomes.Count is < 1 or > 256 || outcomes.Any(item => item is null) || outcomes.Select(item => item.ToolCallId).Distinct(StringComparer.Ordinal).Count() != outcomes.Count) throw new ArgumentException("Complete unique browser outcomes are required.");
    ProtocolVersion = protocolVersion; ServerRevision = serverRevision; Outcomes = Array.AsReadOnly(outcomes.ToArray());
  }
  /// <summary>Supported settlement protocol version, currently one.</summary>
  public int ProtocolVersion { get; }
  /// <summary>Exact captured durable revision; retries must never substitute a newer revision.</summary>
  public long ServerRevision { get; }
  /// <summary>Copied complete browser outcomes, carrying no duplicate result values.</summary>
  public IReadOnlyList<NativeBrowserRecoveryOutcome> Outcomes { get; }
}

/// <summary>Read-only V2 capability backed by validated durable browser bindings.</summary>
public sealed class PendingBrowserRecovery
{
  /// <summary>Copies the complete distinct browser call identities and the captured positive safe revision.</summary>
  public PendingBrowserRecovery(int protocolVersion, long serverRevision, IReadOnlyList<string> callIds)
  {
    if (protocolVersion != 1 || serverRevision is < 1 or > 9007199254740991L) throw new ArgumentException("Unsupported browser recovery capability.");
    ArgumentNullException.ThrowIfNull(callIds);
    var copied = callIds.Select(NativeSessionKey.Required).ToArray();
    if (copied.Length is < 1 or > 256 || copied.Distinct(StringComparer.Ordinal).Count() != copied.Length) throw new ArgumentException("Complete unique browser call identities are required.");
    ProtocolVersion = protocolVersion; ServerRevision = serverRevision; CallIds = Array.AsReadOnly(copied);
  }
  /// <summary>Supported capability protocol version, currently one.</summary>
  public int ProtocolVersion { get; }
  /// <summary>Captured durable revision matching the enclosing recovery response.</summary>
  public long ServerRevision { get; }
  /// <summary>Complete copied browser identities; names and arguments come from canonical messages.</summary>
  public IReadOnlyList<string> CallIds { get; }
}

/// <summary>Optional opt-in to atomic explicit cold browser recovery. Existing journals retain their original contract.</summary>
public interface INativeSessionBrowserRecoveryJournal : INativeSessionJournal
{
  /// <summary>Independently validates bounded strict original JSON, including resume and recovery, against the typed envelope; binds the complete trusted key, unchanged stored configuration and complete message prefix, durable browser and protected evidence, and complete genuine decisions. Requires an exact appended tool-result suffix with one result per pending browser call in original announcement order and fresh distinct message IDs; results cannot be inserted into the stored prefix or reordered. Compares the captured server revision exactly, never rebasing it on Publishing or Ready observations, and acquires ownership under the existing effect fences. A successful existing saved snapshot supplies the trusted original configuration. All admission and complete decision reservation must precede native session preparation, callbacks and provider work. Refusals grant no authority and must never fall back to ordinary acquisition.</summary>
  ValueTask<NativeSessionAdmission> TryAcquireBrowserRecoveryAsync(NativeSessionKey key, string originalRawRequestJson,
      NativeBrowserRecoveryRequest recovery, CancellationToken cancellationToken = default);
}
