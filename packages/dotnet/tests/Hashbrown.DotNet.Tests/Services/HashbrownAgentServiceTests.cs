using Hashbrown.DotNet.Models;
using Hashbrown.DotNet.Services;
using Microsoft.AspNetCore.Http;
using System.Text;
using System.Text.Json;

namespace Hashbrown.DotNet.Tests.Services;

public class HashbrownAgentServiceTests
{
    private static DefaultHttpContext CreateHttpContext(string? requestBody = null)
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        if (requestBody != null)
            context.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(requestBody));

        return context;
    }

    private static List<Frame> ReadFrames(MemoryStream body)
    {
        var frames = new List<Frame>();
        var bytes = body.ToArray();
        var pos = 0;

        while (pos + 4 <= bytes.Length)
        {
            var length = (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
            pos += 4;

            if (pos + length > bytes.Length)
                break;

            var json = Encoding.UTF8.GetString(bytes, pos, length);
            pos += length;

            var frame = JsonSerializer.Deserialize<Frame>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (frame != null)
                frames.Add(frame);
        }

        return frames;
    }

    [Fact]
    public async Task HandleRequestAsync_Should_Return400_When_BodyDeserializesToNull()
    {
        var service = new HashbrownAgentService();
        var context = CreateHttpContext("null");

        var result = await service.HandleRequestAsync(context, null!, null, CancellationToken.None);

        result.Should().BeFalse();
        context.Response.StatusCode.Should().Be(400);
    }

    [Fact]
    public async Task HandleRequestAsync_Should_Return400_When_BodyIsInvalidJson()
    {
        var service = new HashbrownAgentService();
        var context = CreateHttpContext("{not valid json}");

        var result = await service.HandleRequestAsync(context, null!, null, CancellationToken.None);

        result.Should().BeFalse();
        context.Response.StatusCode.Should().Be(400);
    }

    [Fact]
    public async Task HandleLoadThreadAsync_Should_WriteFailureFrame_When_ThreadIdIsNull()
    {
        var service = new HashbrownAgentService();
        var context = CreateHttpContext();
        var request = new CompletionCreateParams
        {
            Model = "gpt-4o",
            Operation = "load-thread",
            Messages = new List<Message>()
            // ThreadId intentionally omitted
        };

        await service.HandleLoadThreadAsync(context, request, null!, null, CancellationToken.None);

        var responseBody = (MemoryStream)context.Response.Body;
        var frames = ReadFrames(responseBody);

        frames.Should().HaveCountGreaterThanOrEqualTo(2);
        frames[0].Type.Should().Be("thread-load-start");
        frames[1].Type.Should().Be("thread-load-failure");
        frames[1].Error.Should().Contain("Thread ID");
    }

    [Fact]
    public async Task HandleLoadThreadAsync_Should_WriteFailureFrame_When_MessageStoreIsNull()
    {
        var service = new HashbrownAgentService();
        var context = CreateHttpContext();
        var request = new CompletionCreateParams
        {
            Model = "gpt-4o",
            Operation = "load-thread",
            ThreadId = "thread-abc",
            Messages = new List<Message>()
        };

        await service.HandleLoadThreadAsync(context, request, null!, messageStore: null, CancellationToken.None);

        var responseBody = (MemoryStream)context.Response.Body;
        var frames = ReadFrames(responseBody);

        frames.Should().HaveCountGreaterThanOrEqualTo(2);
        frames[0].Type.Should().Be("thread-load-start");
        frames[1].Type.Should().Be("thread-load-failure");
        frames[1].Error.Should().Contain("ChatHistoryProvider");
    }

    [Fact]
    public async Task HandleRequestAsync_Should_SetStreamingHeaders_BeforeDispatch()
    {
        var service = new HashbrownAgentService();
        var context = CreateHttpContext("""{"model":"gpt-4o","operation":"load-thread","messages":[]}""");

        await service.HandleRequestAsync(context, null!, null, CancellationToken.None);

        context.Response.ContentType.Should().Be("application/octet-stream");
        context.Response.Headers["Cache-Control"].ToString().Should().Be("no-cache");
        context.Response.Headers["X-Content-Type-Options"].ToString().Should().Be("nosniff");
    }
}
