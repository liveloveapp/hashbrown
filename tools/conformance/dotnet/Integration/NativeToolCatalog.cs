using System.Collections.Frozen;
using System.Security.Cryptography;
using System.Text.Json;

namespace Hashbrown.Conformance.Integration;

/// <summary>Immutable registered operation version and schema identity. Invocation permissions remain application-owned.</summary>
public sealed record NativeToolDefinition(string Name, int Version, JsonElement Schema, Func<JsonElement, bool>? Validate = null);

/// <summary>Immutable server catalog binding native descriptors and rejecting browser name collisions.</summary>
public sealed class NativeToolCatalog
{
    private readonly FrozenDictionary<string, NativeToolDefinition> _tools;
    /// <summary>Clones and validates versioned server definitions.</summary>
    public NativeToolCatalog(IEnumerable<NativeToolDefinition> tools)
    {
        _tools = tools.Select(tool => new NativeToolDefinition(NativeSessionKey.Required(tool.Name), tool.Version > 0 ? tool.Version : throw new ArgumentException("Operation versions must be positive."), tool.Schema.ValueKind == JsonValueKind.Object ? tool.Schema.Clone() : throw new ArgumentException("Operation schema must be an object."), tool.Validate)).ToFrozenDictionary(tool => tool.Name, StringComparer.Ordinal);
        Identity = Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(NativeSessionHistory.Canonical(JsonSerializer.SerializeToElement(_tools.Values.OrderBy(tool => tool.Name, StringComparer.Ordinal).Select(tool => new { tool.Name, tool.Version, tool.Schema }))))));
    }
    /// <summary>Stable canonical catalog identity, including explicit versions and schemas.</summary>
    public string Identity { get; }
    /// <summary>Clones an actual model call using the immutable registered version and pure argument validator.</summary>
    public NativeToolCall CreateCall(string id, string name, JsonElement arguments)
    {
        if (!_tools.TryGetValue(name, out var tool)) throw new ArgumentException("The native server operation is not registered.");
        var call = new NativeToolCall(id, name, tool.Version, arguments);
        if (!Matches(call)) throw new ArgumentException("The native server operation arguments are invalid.");
        return call;
    }
    /// <summary>Checks the complete native function name set and structural schema identity without invoking application validators.</summary>
    internal bool MatchesDefinitions(IEnumerable<KeyValuePair<string, JsonElement>> definitions)
    {
        var actual = definitions.ToArray();
        return actual.Length == _tools.Count && actual.Select(pair => pair.Key).Distinct(StringComparer.Ordinal).Count() == actual.Length &&
            actual.All(pair => _tools.TryGetValue(pair.Key, out var registered) &&
                System.Text.Json.Nodes.JsonNode.DeepEquals(System.Text.Json.Nodes.JsonNode.Parse(pair.Value.GetRawText()), System.Text.Json.Nodes.JsonNode.Parse(registered.Schema.GetRawText())));
    }
    /// <summary>Tests whether a name belongs to a registered server operation.</summary>
    public bool Contains(string name) => _tools.ContainsKey(name);
    /// <summary>Validates the stored descriptor against the exact registered version.</summary>
    public bool Matches(NativeToolCall call) => HasVersion(call) && (_tools[call.Name].Validate?.Invoke(call.Arguments) ?? true);
    /// <summary>Checks only immutable metadata, never invoking application code while a storage transaction is open.</summary>
    internal bool HasVersion(NativeToolCall call) => _tools.TryGetValue(call.Name, out var tool) && tool.Version == call.Version;
}
