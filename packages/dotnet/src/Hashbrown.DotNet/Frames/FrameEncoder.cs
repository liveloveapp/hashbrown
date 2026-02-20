using System.Text;
using System.Text.Json;
using Hashbrown.DotNet.Models;

namespace Hashbrown.DotNet.Frames;

/// <summary>
/// Encodes frames into length-prefixed binary format for streaming.
/// </summary>
public static class FrameEncoder
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    /// <summary>
    /// Encodes a frame object into a length-prefixed byte array.
    /// Format: 4-byte big-endian length + UTF-8 JSON content.
    /// </summary>
    /// <param name="frame">Frame object to encode.</param>
    /// <returns>Length-prefixed binary frame.</returns>
    public static byte[] Encode(object frame)
    {
        var json = JsonSerializer.Serialize(frame, JsonOptions);
        var jsonBytes = Encoding.UTF8.GetBytes(json);
        var length = jsonBytes.Length;

        var result = new byte[4 + length];

        // Big-endian length prefix
        result[0] = (byte)(length >> 24);
        result[1] = (byte)(length >> 16);
        result[2] = (byte)(length >> 8);
        result[3] = (byte)length;

        Buffer.BlockCopy(jsonBytes, 0, result, 4, length);

        return result;
    }

    /// <summary>
    /// Creates a generation-chunk frame.
    /// </summary>
    public static byte[] EncodeGenerationChunk(CompletionChunk chunk)
    {
        return Encode(new Frame
        {
            Type = "generation-chunk",
            Chunk = chunk
        });
    }

    /// <summary>
    /// Creates a thread-load-success frame.
    /// </summary>
    public static byte[] EncodeThreadLoadSuccess(List<Message> thread)
    {
        return Encode(new Frame
        {
            Type = "thread-load-success",
            Thread = thread
        });
    }

    /// <summary>
    /// Creates an error frame.
    /// </summary>
    public static byte[] EncodeError(string type, string error, string? stacktrace = null)
    {
        return Encode(new Frame
        {
            Type = type,
            Error = error,
            Stacktrace = stacktrace
        });
    }
}
