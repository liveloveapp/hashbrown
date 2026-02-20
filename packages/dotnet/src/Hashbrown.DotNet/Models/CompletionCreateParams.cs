using System.Text.Json.Serialization;

namespace Hashbrown.DotNet.Models;

/// <summary>
/// Parameters for creating a chat completion.
/// </summary>
public class CompletionCreateParams
{
    /// <summary>
    /// Operation type: "generate" or "load-thread".
    /// </summary>
    [JsonPropertyName("operation")]
    public string Operation { get; set; } = "generate";

    /// <summary>
    /// Model identifier (e.g., "gpt-4o", "gpt-4o-mini").
    /// </summary>
    [JsonPropertyName("model")]
    public required string Model { get; set; }

    /// <summary>
    /// System instructions for the AI assistant.
    /// </summary>
    [JsonPropertyName("system")]
    public string? System { get; set; }

    /// <summary>
    /// Conversation messages.
    /// </summary>
    [JsonPropertyName("messages")]
    public List<Message> Messages { get; set; } = new();

    /// <summary>
    /// Available tools for the assistant to call.
    /// </summary>
    [JsonPropertyName("tools")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<Tool>? Tools { get; set; }

    /// <summary>
    /// Tool choice strategy ("auto", "required", or specific tool).
    /// </summary>
    [JsonPropertyName("toolChoice")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public object? ToolChoice { get; set; }

    /// <summary>
    /// Response format schema for structured output.
    /// </summary>
    [JsonPropertyName("responseFormat")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public object? ResponseFormat { get; set; }

    /// <summary>
    /// Thread ID for conversation persistence.
    /// </summary>
    [JsonPropertyName("threadId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ThreadId { get; set; }
}

/// <summary>
/// Defines a tool/function that the AI can call.
/// </summary>
public class Tool
{
    /// <summary>
    /// Name of the tool.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// Description of what the tool does.
    /// </summary>
    [JsonPropertyName("description")]
    public required string Description { get; set; }

    /// <summary>
    /// JSON Schema for tool parameters.
    /// </summary>
    [JsonPropertyName("parameters")]
    public required object Parameters { get; set; }
}
