using Hashbrown.DotNet.Models;
using System.Text.Json;

namespace Hashbrown.DotNet.Tests.Models;

public class CompletionCreateParamsTests
{
    private static readonly JsonSerializerOptions Options = new() { PropertyNameCaseInsensitive = true };

    [Fact]
    public void DefaultOperation_Should_BeGenerate()
    {
        var json = """{"model":"gpt-4o","messages":[]}""";

        var result = JsonSerializer.Deserialize<CompletionCreateParams>(json, Options);

        result.Should().NotBeNull();
        result!.Operation.Should().Be("generate");
    }

    [Fact]
    public void Operation_Should_Deserialize_ToLoadThread()
    {
        var json = """{"model":"gpt-4o","operation":"load-thread","threadId":"abc123","messages":[]}""";

        var result = JsonSerializer.Deserialize<CompletionCreateParams>(json, Options);

        result.Should().NotBeNull();
        result!.Operation.Should().Be("load-thread");
        result.ThreadId.Should().Be("abc123");
    }

    [Fact]
    public void Messages_Should_Deserialize_Correctly()
    {
        var json = """
            {
                "model": "gpt-4o",
                "messages": [
                    {"role":"user","content":"Hello"},
                    {"role":"assistant","content":"Hi there"}
                ]
            }
            """;

        var result = JsonSerializer.Deserialize<CompletionCreateParams>(json, Options);

        result.Should().NotBeNull();
        result!.Messages.Should().HaveCount(2);
        result.Messages[0].Role.Should().Be("user");
        result.Messages[0].Content.Should().Be("Hello");
        result.Messages[1].Role.Should().Be("assistant");
        result.Messages[1].Content.Should().Be("Hi there");
    }

    [Fact]
    public void System_Should_Deserialize_WhenPresent()
    {
        var json = """{"model":"gpt-4o","system":"You are helpful.","messages":[]}""";

        var result = JsonSerializer.Deserialize<CompletionCreateParams>(json, Options);

        result.Should().NotBeNull();
        result!.System.Should().Be("You are helpful.");
    }

    [Fact]
    public void OptionalFields_Should_BeNull_WhenAbsent()
    {
        var json = """{"model":"gpt-4o","messages":[]}""";

        var result = JsonSerializer.Deserialize<CompletionCreateParams>(json, Options);

        result.Should().NotBeNull();
        result!.System.Should().BeNull();
        result.ThreadId.Should().BeNull();
        result.Tools.Should().BeNull();
        result.ToolChoice.Should().BeNull();
        result.ResponseFormat.Should().BeNull();
    }
}
