using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using AGUI.Abstractions;

namespace Hashbrown.AspNetCore;

/// <summary>Captures bounded original native JSON inside authorized endpoint execution, before the generated body binder.</summary>
internal static class NativeSessionRawRequest
{
  private static readonly UTF8Encoding Utf8 = new(false, true);
  /// <summary>Returns exact validated original JSON captured by the route delegate.</summary>
  internal static string Get(HttpContext http) => http.Items[typeof(NativeSessionRawRequest)] as string ?? throw new NativeSessionRequestException(503);
  /// <summary>Refuses any Web-binder interpretation differing from the canonical pinned raw AGUI input.</summary>
  internal static void RequireEquivalentBinding(HttpContext http, RunAgentInput bound)
  {
    var original = JsonSerializer.Deserialize(Get(http), AGUIJsonSerializerContext.Default.RunAgentInput) ?? throw new JsonException("Missing original native input.");
    var rawTyped = JsonSerializer.Serialize(original, AGUIJsonSerializerContext.Default.RunAgentInput);
    var actualTyped = JsonSerializer.Serialize(bound, AGUIJsonSerializerContext.Default.RunAgentInput);
    if (!JsonNode.DeepEquals(JsonNode.Parse(rawTyped), JsonNode.Parse(actualTyped))) throw new ArgumentException("Native raw and bound input interpretations disagree.");
  }
  /// <summary>Wraps only the named native endpoint; authorization middleware has already run.</summary>
  internal static RequestDelegate Wrap(RequestDelegate next, string name) => async http =>
  {
    if (http.User.Identity?.IsAuthenticated != true) { http.Response.StatusCode = 401; return; }
    var options = http.RequestServices.GetRequiredKeyedService<NativeSessionRegistration>(name).Options;
    if (http.Request.ContentLength > options.PublicBytes) { http.Response.StatusCode = 413; return; }
    var original = http.Request.Body;
    using var captured = new MemoryStream();
    try
    {
      var buffer = new byte[Math.Min(16384, options.PublicBytes)];
      while (true)
      {
        var remaining = (long)options.PublicBytes + 1 - captured.Length;
        var count = await original.ReadAsync(buffer.AsMemory(0, (int)Math.Min(buffer.Length, remaining)), http.RequestAborted);
        if (count == 0) break;
        captured.Write(buffer, 0, count);
        if (captured.Length > options.PublicBytes) { http.Response.StatusCode = 413; return; }
      }
      string raw;
      try
      {
        raw = Utf8.GetString(captured.GetBuffer(), 0, checked((int)captured.Length));
        Validate(raw);
      }
      catch (Exception exception) when (exception is JsonException or DecoderFallbackException)
      { http.Response.StatusCode = 400; return; }
      http.Items[typeof(NativeSessionRawRequest)] = raw;
      captured.Position = 0;
      http.Request.Body = captured;
      await next(http);
    }
    finally
    {
      http.Request.Body = original;
      http.Items.Remove(typeof(NativeSessionRawRequest));
    }
  };
  /// <summary>Independently checks strict bounded-depth protocol syntax before any sanitizer or journal parser.</summary>
  internal static void Validate(string raw)
  {
    using var document = JsonDocument.Parse(raw, new JsonDocumentOptions { MaxDepth = 64 });
    if (document.RootElement.ValueKind != JsonValueKind.Object) throw new JsonException();
    RejectDuplicates(document.RootElement);
    RejectProtocolAliases(document.RootElement);
  }
  private static void RejectProtocolAliases(JsonElement root)
  {
    Check(root, ["threadId", "runId", "messages", "tools", "context", "state", "forwardedProps", "resume"]);
    if (root.TryGetProperty("resume", out var resume) && resume.ValueKind == JsonValueKind.Array)
      foreach (var decision in resume.EnumerateArray())
      {
        Check(decision, ["interruptId", "status", "payload"]);
        if (decision.ValueKind == JsonValueKind.Object && decision.TryGetProperty("payload", out var payload)) Check(payload, ["approved"]);
      }
    if (root.TryGetProperty("messages", out var messages) && messages.ValueKind == JsonValueKind.Array)
      foreach (var message in messages.EnumerateArray())
      {
        Check(message, ["id", "role", "content", "toolCalls", "toolCallId", "metadata", "error", "name"]);
        if (message.ValueKind == JsonValueKind.Object && message.TryGetProperty("toolCalls", out var calls) && calls.ValueKind == JsonValueKind.Array)
          foreach (var call in calls.EnumerateArray())
          {
            Check(call, ["id", "type", "function", "metadata"]);
            if (call.ValueKind == JsonValueKind.Object && call.TryGetProperty("function", out var function)) Check(function, ["name", "arguments"]);
          }
      }
    if (root.TryGetProperty("tools", out var tools) && tools.ValueKind == JsonValueKind.Array)
      foreach (var tool in tools.EnumerateArray()) Check(tool, ["name", "description", "parameters"]);
    static void Check(JsonElement value, string[] fields)
    {
      if (value.ValueKind != JsonValueKind.Object) return;
      foreach (var property in value.EnumerateObject())
        if (fields.Any(field => string.Equals(field, property.Name, StringComparison.OrdinalIgnoreCase) && field != property.Name)) throw new JsonException("Ambiguous native protocol property alias.");
    }
  }
  private static void RejectDuplicates(JsonElement value)
  {
    if (value.ValueKind == JsonValueKind.Object)
    {
      var names = new HashSet<string>(StringComparer.Ordinal);
      foreach (var property in value.EnumerateObject())
      {
        if (!names.Add(property.Name)) throw new JsonException("Duplicate native JSON property.");
        RejectDuplicates(property.Value);
      }
    }
    else if (value.ValueKind == JsonValueKind.Array)
      foreach (var item in value.EnumerateArray()) RejectDuplicates(item);
  }
}
