using Hashbrown.DotNet.Models;
using System.Text.Json;

namespace Hashbrown.DotNet.Tests.Models;

public class FrameTests
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    [Fact]
    public void Serialize_Should_ExcludeNullFields()
    {
        var frame = new Frame { Type = "generation-start" };

        var json = JsonSerializer.Serialize(frame, Options);

        json.Should().Contain("\"type\"");
        json.Should().NotContain("\"thread\"");
        json.Should().NotContain("\"chunk\"");
        json.Should().NotContain("\"error\"");
        json.Should().NotContain("\"stacktrace\"");
        json.Should().NotContain("\"threadId\"");
    }

    [Fact]
    public void Serialize_Should_IncludeThreadField_WhenSet()
    {
        var frame = new Frame
        {
            Type = "thread-load-success",
            Thread = new List<Message>
            {
                new() { Role = "user", Content = "Hello" }
            }
        };

        var json = JsonSerializer.Serialize(frame, Options);

        json.Should().Contain("\"thread\"");
        json.Should().Contain("\"user\"");
        json.Should().Contain("\"Hello\"");
    }

    [Fact]
    public void Serialize_Should_IncludeErrorField_WhenSet()
    {
        var frame = new Frame { Type = "error", Error = "Something went wrong" };

        var json = JsonSerializer.Serialize(frame, Options);

        json.Should().Contain("\"error\"");
        json.Should().Contain("Something went wrong");
    }

    [Fact]
    public void Deserialize_Should_MapTypeProperty()
    {
        var json = """{"type":"generation-finish"}""";

        var result = JsonSerializer.Deserialize<Frame>(json);

        result.Should().NotBeNull();
        result!.Type.Should().Be("generation-finish");
    }
}
