using System.Text.Json;
using System.Text.Json.Serialization;

namespace Hashbrown.DotNet.Models;

/// <summary>
/// Converts a JSON value that may be either a string or an object/array into a C# string.
/// Objects and arrays are serialized to their JSON representation, matching TypeScript's
/// <c>JSON.stringify(message.content)</c> behaviour for tool result messages.
/// </summary>
internal sealed class StringOrObjectToStringConverter : JsonConverter<string>
{
    public override string Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
            return reader.GetString() ?? string.Empty;

        // Object / array / number / bool — serialize back to JSON string
        using var doc = JsonDocument.ParseValue(ref reader);
        return doc.RootElement.GetRawText();
    }

    public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
      => writer.WriteStringValue(value);
}

/// <summary>
/// Represents a message in a conversation thread.
/// </summary>
public class Message
{
    /// <summary>
    /// Role of the message sender (user, assistant, system, tool).
    /// </summary>
    [JsonPropertyName("role")]
    public required string Role { get; set; }

    /// <summary>
    /// Content of the message. Accepts both a JSON string and a JSON object/array;
    /// objects are serialized to their JSON string representation.
    /// </summary>
    [JsonPropertyName("content")]
    [JsonConverter(typeof(StringOrObjectToStringConverter))]
    public required string Content { get; set; }

    /// <summary>
    /// Tool calls made by the assistant (if any).
    /// </summary>
    [JsonPropertyName("toolCalls")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<ToolCall>? ToolCalls { get; set; }

    /// <summary>
    /// Tool call ID for tool response messages.
    /// </summary>
    [JsonPropertyName("toolCallId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ToolCallId { get; set; }
}

/// <summary>
/// Represents a tool call made by the AI assistant.
/// </summary>
public class ToolCall
{
    /// <summary>
    /// Index of the tool call in streaming context.
    /// </summary>
    [JsonPropertyName("index")]
    public int Index { get; set; }

    /// <summary>
    /// Unique identifier for the tool call.
    /// </summary>
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    /// <summary>
    /// Type of tool call (always "function").
    /// </summary>
    [JsonPropertyName("type")]
    public string Type { get; set; } = "function";

    /// <summary>
    /// Function call details.
    /// </summary>
    [JsonPropertyName("function")]
    public required FunctionCall Function { get; set; }
}

/// <summary>
/// Represents a function call within a tool call.
/// </summary>
public class FunctionCall
{
    /// <summary>
    /// Name of the function to call.
    /// </summary>
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    /// <summary>
    /// JSON-serialized arguments for the function.
    /// </summary>
    [JsonPropertyName("arguments")]
    public string? Arguments { get; set; }
}
