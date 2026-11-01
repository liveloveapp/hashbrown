using System.Text;
using System.Text.Json;
using Microsoft.Extensions.AI;

namespace Hashbrown.AspNetCore;

/// <summary>Owns an exact characterized native result without serializing arbitrary application values.</summary>
internal sealed class NativeBrowserRecoveryResultSnapshot
{
  private static readonly UTF8Encoding StrictUtf8 = new(false, true);
  private const string NativeNullSuccess = "Success: Function completed.";
  private readonly JsonValueKind? _jsonKind;
  private NativeBrowserRecoveryResultSnapshot(string wireContent, int bytes, JsonValueKind? jsonKind)
  { WireContent = wireContent; Bytes = bytes; _jsonKind = jsonKind; }
  internal string WireContent { get; }
  internal int Bytes { get; }

  /// <summary>Copies supported raw JSON, immutable strings or the characterized native null-return sentinel within byte/depth bounds.</summary>
  internal static NativeBrowserRecoveryResultSnapshot Create(object? value, int maximumBytes)
  {
    string content;
    JsonValueKind? kind = null;
    if (value is JsonElement json)
    {
      if (json.ValueKind == JsonValueKind.Undefined) throw new NativeSessionRequestException(503);
      // GetRawText materializes once before its actual UTF-8 size can be checked. Retained witnesses remain bounded.
      content = json.GetRawText(); kind = json.ValueKind;
    }
    else if (value is string text) content = text;
    else if (value is null) content = NativeNullSuccess;
    else throw new NativeSessionRequestException(503);
    int bytes;
    try { bytes = StrictUtf8.GetByteCount(content); }
    catch (EncoderFallbackException) { throw new NativeSessionRequestException(503); }
    if (bytes > maximumBytes) throw new NativeSessionRequestException(503);
    if (kind is not null)
    {
      try { using var validated = JsonDocument.Parse(content, new JsonDocumentOptions { MaxDepth = 64 }); }
      catch (JsonException) { throw new NativeSessionRequestException(503); }
    }
    return new(content, bytes, kind);
  }

  /// <summary>Requires the original native type tag and exact raw representation before an outward value can witness completion.</summary>
  internal bool Matches(object? value)
  {
    if (_jsonKind is { } kind) return value is JsonElement json && json.ValueKind == kind && string.Equals(json.GetRawText(), WireContent, StringComparison.Ordinal);
    return value is string text && string.Equals(text, WireContent, StringComparison.Ordinal);
  }

  /// <summary>Rejects unsupported result metadata before any current result is accepted or suppressed.</summary>
  internal static void RequirePlain(FunctionResultContent result)
  {
    if (result.RawRepresentation is not null || result.Exception is not null || result.AdditionalProperties?.Count > 0 || result.Annotations?.Count > 0) throw new NativeSessionRequestException(409);
  }
}

/// <summary>Binds one immutable result snapshot to its request-local durable completion lineage.</summary>
internal sealed record NativeBrowserRecoveryResultWitness(string CallId, string RequestId, string BatchId, string OwnerToken, long Generation, NativeBrowserRecoveryResultSnapshot Snapshot);
