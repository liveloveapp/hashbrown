using System.Text.Json;
using System.Runtime.CompilerServices;
using AGUI.Abstractions;
using AGUI.Server;
using Microsoft.Extensions.AI;

namespace Hashbrown.AspNetCore;

/// <summary>Applies Hashbrown output semantics without modifying upstream request options.</summary>
public sealed class HashbrownRequestClient : DelegatingChatClient
{
  private readonly Func<NativeSessionContext?>? _nativeContext;
  /// <summary>Creates the existing stateless request adapter.</summary>
  public HashbrownRequestClient(IChatClient innerClient) : base(innerClient) { }
  internal HashbrownRequestClient(IChatClient innerClient, Func<NativeSessionContext?> nativeContext) : base(innerClient) => _nativeContext = nativeContext;
  /// <inheritdoc />
  public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
      IEnumerable<ChatMessage> messages, ChatOptions? options = null,
      [EnumeratorCancellation] CancellationToken cancellationToken = default)
  {
    var configured = options?.Clone() ?? new ChatOptions();
    if (configured.TryGetRunAgentInput(out var input) && ReadSchema(input) is { } schema)
    {
      configured.ResponseFormat = ChatResponseFormat.ForJsonSchema(schema.Clone(), "hashbrown");
      configured.AdditionalProperties = new AdditionalPropertiesDictionary(configured.AdditionalProperties ?? [])
      {
        ["strict"] = true
      };
    }
    var browserTools = configured.TryGetRunAgentInput(out var run)
        ? (_nativeContext?.Invoke()?.Input.Tools ?? run.Tools ?? []).Select(tool => tool.Name).ToHashSet(StringComparer.Ordinal)
        : [];
    if (browserTools.Count > 0)
    {
      // Native agent history can synthesize name-only declarations. Restore the current
      // request's schema while preserving server function instances and their handlers.
      configured.Tools = (configured.Tools ?? [])
          .Where(tool => tool is not AIFunctionDeclaration declaration || !browserTools.Contains(declaration.Name))
          .Concat((_nativeContext?.Invoke()?.Input.Tools ?? run!.Tools ?? []).Select(tool => AIFunctionFactory.CreateDeclaration(
              tool.Name, tool.Description, tool.Parameters?.Clone() ?? JsonSerializer.SerializeToElement(new { type = "object" }), null)))
          .ToList();
    }
    var sawBrowser = false;
    var sawServer = false;
    await foreach (var update in base.GetStreamingResponseAsync(messages, configured, cancellationToken).WithCancellation(cancellationToken))
    {
      foreach (var call in update.Contents.OfType<FunctionCallContent>())
      {
        sawBrowser |= browserTools.Contains(call.Name);
        sawServer |= !browserTools.Contains(call.Name);
        if (!browserTools.Contains(call.Name) && _nativeContext?.Invoke() is { Bound: true } native)
          await native.CaptureAsync(call, cancellationToken);
      }
      if (sawBrowser && sawServer && _nativeContext?.Invoke() is not { Bound: true })
        throw new NotSupportedException("Request browser and server tools in separate model turns.");
      yield return update;
    }
  }

  /// <summary>Reads the optional native output schema from AG-UI forwarded properties.</summary>
  public static JsonElement? ReadSchema(RunAgentInput input)
  {
    if (input.ForwardedProperties is not { ValueKind: JsonValueKind.Object } forwarded ||
        !forwarded.TryGetProperty("hashbrown", out var hashbrown)) return null;
    if (hashbrown.ValueKind != JsonValueKind.Object) throw new ArgumentException("hashbrown must be an object.");
    if (!hashbrown.TryGetProperty("responseSchema", out var schema)) return null;
    if (schema.ValueKind != JsonValueKind.Object) throw new ArgumentException("responseSchema must be a JSON schema object.");
    return schema;
  }
}
