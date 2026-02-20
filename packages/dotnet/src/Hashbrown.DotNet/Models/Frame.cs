using System.Text.Json.Serialization;

namespace Hashbrown.DotNet.Models;

/// <summary>
/// Represents a frame in the Hashbrown streaming protocol.
/// </summary>
public class Frame
{
    /// <summary>
    /// Type of frame (e.g., "generation-chunk", "thread-load-success").
    /// </summary>
    [JsonPropertyName("type")]
    public required string Type { get; set; }

    /// <summary>
    /// Thread data for thread-related frames.
    /// </summary>
    [JsonPropertyName("thread")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<Message>? Thread { get; set; }

    /// <summary>
    /// Thread ID for thread-save-success frames.
    /// </summary>
    [JsonPropertyName("threadId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ThreadId { get; set; }

    /// <summary>
    /// Chunk data for generation-chunk frames.
    /// </summary>
    [JsonPropertyName("chunk")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public CompletionChunk? Chunk { get; set; }

    /// <summary>
    /// Error message for error frames.
    /// </summary>
    [JsonPropertyName("error")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Error { get; set; }

    /// <summary>
    /// Stack trace for error frames.
    /// </summary>
    [JsonPropertyName("stacktrace")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Stacktrace { get; set; }
}

/// <summary>
/// Represents a streaming completion chunk from the AI provider.
/// </summary>
public class CompletionChunk
{
    /// <summary>
    /// Array of choice objects (typically one element).
    /// </summary>
    [JsonPropertyName("choices")]
    public Choice[] Choices { get; set; } = Array.Empty<Choice>();
}

/// <summary>
/// Represents a choice in a completion chunk.
/// </summary>
public class Choice
{
    /// <summary>
    /// Index of the choice.
    /// </summary>
    [JsonPropertyName("index")]
    public int Index { get; set; }

    /// <summary>
    /// Delta content for this chunk.
    /// </summary>
    [JsonPropertyName("delta")]
    public required Delta Delta { get; set; }

    /// <summary>
    /// Finish reason (null for streaming, "stop"/"length"/"tool_calls" when complete).
    /// </summary>
    [JsonPropertyName("finishReason")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? FinishReason { get; set; }
}

/// <summary>
/// Represents delta content in a streaming chunk.
/// </summary>
public class Delta
{
    /// <summary>
    /// Role of the message (typically "assistant").
    /// </summary>
    [JsonPropertyName("role")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Role { get; set; }

    /// <summary>
    /// Text content delta.
    /// </summary>
    [JsonPropertyName("content")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Content { get; set; }

    /// <summary>
    /// Tool call deltas.
    /// </summary>
    [JsonPropertyName("toolCalls")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<ToolCall>? ToolCalls { get; set; }
}
