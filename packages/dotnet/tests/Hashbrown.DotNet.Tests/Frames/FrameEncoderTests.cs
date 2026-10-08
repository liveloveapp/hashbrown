using Hashbrown.DotNet.Frames;
using Hashbrown.DotNet.Models;
using System.Text;
using System.Text.Json;

namespace Hashbrown.DotNet.Tests.Frames;

public class FrameEncoderTests
{
    [Fact]
    public void Encode_Should_IncludeLengthPrefix()
    {
        var frame = new Frame { Type = "ping" };
        var json = JsonSerializer.Serialize(frame);

        var encoded = FrameEncoder.Encode(frame);

        var expectedLength = Encoding.UTF8.GetByteCount(json);
        var actualLength = BitConverter.ToInt32(encoded.Take(4).Reverse().ToArray());

        Assert.Equal(expectedLength, actualLength);
    }

    [Fact]
    public void Encode_Should_IncludeJsonPayload()
    {
        var frame = new Frame { Type = "ping" };
        var json = JsonSerializer.Serialize(frame);

        var encoded = FrameEncoder.Encode(frame);

        var payload = Encoding.UTF8.GetString(encoded.Skip(4).ToArray());

        Assert.Equal(json, payload);
    }

    [Fact]
    public void EncodeGenerationChunk_Should_CreateCorrectFrame()
    {
        var chunk = new CompletionChunk
        {
            Choices = new List<Choice>
            {
                new() { Delta = new Delta { Content = "Hello" } }
            }.ToArray()
        };

        var encoded = FrameEncoder.EncodeGenerationChunk(chunk);
        var json = Encoding.UTF8.GetString(encoded.Skip(4).ToArray());
        var frame = JsonSerializer.Deserialize<Frame>(json);

        Assert.Equal("generation-chunk", frame?.Type);
        Assert.NotNull(frame?.Chunk);
    }

    [Fact]
    public void EncodeThreadLoadSuccess_Should_CreateCorrectFrame()
    {
        var thread = new List<Message>();

        var encoded = FrameEncoder.EncodeThreadLoadSuccess(thread);
        var json = Encoding.UTF8.GetString(encoded.Skip(4).ToArray());
        var frame = JsonSerializer.Deserialize<Frame>(json);

        Assert.Equal("thread-load-success", frame?.Type);
        Assert.NotNull(frame?.Thread);
        Assert.Empty(frame?.Thread!);
    }

    [Fact]
    public void EncodeError_Should_CreateCorrectFrame()
    {
        var errorType = "error";
        var errorMessage = "Test error";

        var encoded = FrameEncoder.EncodeError(errorType, errorMessage);
        var json = Encoding.UTF8.GetString(encoded.Skip(4).ToArray());
        var frame = JsonSerializer.Deserialize<Frame>(json);

        Assert.Equal("error", frame?.Type);
        Assert.Equal(errorMessage, frame?.Error);
    }

    [Fact]
    public void Encode_Should_UseBigEndianByteOrder()
    {
        var frame = new Frame { Type = "test" };
        var json = JsonSerializer.Serialize(frame);

        var encoded = FrameEncoder.Encode(frame);

        var lengthBytes = encoded.Take(4).ToArray();
        var expectedLength = Encoding.UTF8.GetByteCount(json);

        // Big endian: most significant byte first
        var decodedLength = (lengthBytes[0] << 24) | (lengthBytes[1] << 16) | (lengthBytes[2] << 8) | lengthBytes[3];

        Assert.Equal(expectedLength, decodedLength);
    }
}
