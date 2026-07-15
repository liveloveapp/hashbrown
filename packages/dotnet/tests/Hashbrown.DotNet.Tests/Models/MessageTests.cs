using Hashbrown.DotNet.Models;
using System.Text.Json;

namespace Hashbrown.DotNet.Tests.Models;

public class MessageTests
{
    private static readonly JsonSerializerOptions Options = new() { PropertyNameCaseInsensitive = true };

    [Fact]
    public void Content_Should_Deserialize_FromString()
    {
        var json = """{"role":"user","content":"Hello, world!"}""";

        var result = JsonSerializer.Deserialize<Message>(json, Options);

        result.Should().NotBeNull();
        result!.Role.Should().Be("user");
        result.Content.Should().Be("Hello, world!");
    }

    [Fact]
    public void Content_Should_Deserialize_FromObjectAsJsonString()
    {
        var json = """{"role":"tool","content":{"result":42},"toolCallId":"call_1"}""";

        var result = JsonSerializer.Deserialize<Message>(json, Options);

        result.Should().NotBeNull();
        result!.Role.Should().Be("tool");
        result.Content.Should().Be("""{"result":42}""");
        result.ToolCallId.Should().Be("call_1");
    }

    [Fact]
    public void Content_Should_Deserialize_FromArrayAsJsonString()
    {
        var json = """{"role":"tool","content":[1,2,3],"toolCallId":"call_2"}""";

        var result = JsonSerializer.Deserialize<Message>(json, Options);

        result.Should().NotBeNull();
        result!.Content.Should().Be("[1,2,3]");
    }

    [Fact]
    public void ToolCalls_Should_Deserialize_Correctly()
    {
        var json = """
            {
                "role": "assistant",
                "content": "",
                "toolCalls": [
                    {
                        "index": 0,
                        "id": "call_abc",
                        "type": "function",
                        "function": { "name": "get_weather", "arguments": "{\"city\":\"Seattle\"}" }
                    }
                ]
            }
            """;

        var result = JsonSerializer.Deserialize<Message>(json, Options);

        result.Should().NotBeNull();
        result!.ToolCalls.Should().HaveCount(1);
        result.ToolCalls![0].Id.Should().Be("call_abc");
        result.ToolCalls[0].Function.Name.Should().Be("get_weather");
    }

    [Fact]
    public void OptionalFields_Should_BeNull_WhenAbsent()
    {
        var json = """{"role":"user","content":"Test"}""";

        var result = JsonSerializer.Deserialize<Message>(json, Options);

        result.Should().NotBeNull();
        result!.ToolCalls.Should().BeNull();
        result.ToolCallId.Should().BeNull();
    }
}
