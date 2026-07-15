using Hashbrown.DotNet.Frames;
using Hashbrown.DotNet.Models;
using Microsoft.Agents.AI;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.AI;
using System.Text.Json;
using static Microsoft.Agents.AI.ChatHistoryProvider;

namespace Hashbrown.DotNet.Services;

/// <summary>
/// Default implementation of <see cref="IHashbrownAgentService"/> that handles
/// thread loading and streaming generation against an <see cref="AIAgent"/>.
/// </summary>
public class HashbrownAgentService : IHashbrownAgentService
{
    /// <inheritdoc/>
    public async Task HandleLoadThreadAsync(
        HttpContext context,
        CompletionCreateParams request,
        AIAgent agent,
        ChatHistoryProvider? messageStore,
        CancellationToken cancellationToken = default)
    {
        await WriteFrame(context, new Frame { Type = "thread-load-start" }, cancellationToken);

        if (string.IsNullOrEmpty(request.ThreadId))
        {
            await WriteFrame(context, new Frame
            {
                Type = "thread-load-failure",
                Error = "Thread ID is required for load-thread operation"
            }, cancellationToken);
            return;
        }

        if (messageStore == null)
        {
            await WriteFrame(context, new Frame
            {
                Type = "thread-load-failure",
                Error = "Thread loading is not available - no ChatHistoryProvider configured"
            }, cancellationToken);
            return;
        }

        try
        {
            var invokingContext = new InvokingContext(agent, null!, null!);
            IEnumerable<ChatMessage> messages = await messageStore.InvokingAsync(invokingContext, cancellationToken);

            var threadMessages = messages.Select(m => new Message
            {
                Role = m.Role.ToString().ToLowerInvariant(),
                Content = m.Text ?? string.Empty
            }).ToList();

            await WriteFrame(context, new Frame
            {
                Type = "thread-load-success",
                Thread = threadMessages
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            await WriteFrame(context, new Frame
            {
                Type = "thread-load-failure",
                Error = ex.Message,
                Stacktrace = ex.StackTrace
            }, cancellationToken);
        }
    }

    /// <inheritdoc/>
    public async Task HandleGenerateAsync(
        HttpContext context,
        CompletionCreateParams request,
        AIAgent agent,
        ChatHistoryProvider? messageStore,
        CancellationToken cancellationToken = default)
    {
        List<ChatMessage> conversation = new();

        // Build conversation from request messages
        foreach (var msg in request.Messages)
        {
            ChatMessage chatMessage;
            switch (msg.Role)
            {
                case "user":
                    chatMessage = new ChatMessage(ChatRole.User, msg.Content);
                    break;
                case "assistant":
                    if (msg.ToolCalls != null && msg.ToolCalls.Count > 0)
                    {
                        var contents = new List<AIContent>();
                        if (!string.IsNullOrEmpty(msg.Content))
                            contents.Add(new TextContent(msg.Content));
                        foreach (var tc in msg.ToolCalls)
                        {
                            IDictionary<string, object?>? args = null;
                            if (!string.IsNullOrEmpty(tc.Function.Arguments))
                                args = JsonSerializer.Deserialize<Dictionary<string, object?>>(tc.Function.Arguments);
                            contents.Add(new FunctionCallContent(tc.Id ?? string.Empty, tc.Function.Name ?? string.Empty, args));
                        }
                        chatMessage = new ChatMessage(ChatRole.Assistant, contents);
                    }
                    else
                    {
                        chatMessage = new ChatMessage(ChatRole.Assistant, msg.Content);
                    }
                    break;
                case "system":
                    chatMessage = new ChatMessage(ChatRole.System, msg.Content);
                    break;
                case "tool":
                    chatMessage = new ChatMessage(ChatRole.Tool,
                        [new FunctionResultContent(msg.ToolCallId ?? string.Empty, msg.Content)]);
                    break;
                default:
                    throw new ArgumentException($"Unknown role: {msg.Role}");
            }
            conversation.Add(chatMessage);
        }

        // Prepend system message if provided
        if (!string.IsNullOrEmpty(request.System))
            conversation.Insert(0, new ChatMessage(ChatRole.System, request.System));

        await WriteFrame(context, new Frame { Type = "generation-start" }, cancellationToken);

        Message? assistantMessage = null;
        string threadId = request.ThreadId ?? Guid.NewGuid().ToString();

        try
        {
            bool isFirstChunk = true;

            // Build ChatOptions from request (responseFormat, tools, toolChoice)
            ChatResponseFormat? responseFormat = null;
            if (request.ResponseFormat != null)
            {
                var responseFormatJson = JsonSerializer.SerializeToElement(request.ResponseFormat);
                responseFormat = ChatResponseFormat.ForJsonSchema(
                    responseFormatJson,
                    schemaName: "schema",
                    schemaDescription: string.Empty);
            }

            List<AITool> aiTools = new();
            if (request.Tools != null && request.Tools.Count > 0)
            {
                foreach (var tool in request.Tools)
                {
                    aiTools.Add(AIFunctionFactory.CreateDeclaration(
                        name: tool.Name,
                        description: tool.Description,
                        jsonSchema: (JsonElement)tool.Parameters));
                }
            }

            ChatOptions? chatOptions = null;
            if (responseFormat != null || aiTools.Count > 0 || request.ToolChoice != null)
            {
                chatOptions = new ChatOptions
                {
                    ResponseFormat = responseFormat,
                    Tools = aiTools.Count > 0 ? aiTools : null,
                };

                if (request.ToolChoice != null)
                {
                    chatOptions.ToolMode = request.ToolChoice.ToString() switch
                    {
                        "required" => ChatToolMode.RequireAny,
                        "none" => null,
                        _ => ChatToolMode.Auto
                    };
                }
            }

            var runOptions = new ChatClientAgentRunOptions { ChatOptions = chatOptions };

            await foreach (var update in agent.RunStreamingAsync(
                conversation,
                options: runOptions,
                cancellationToken: cancellationToken))
            {
                var toolCallDeltas = update.Contents
                    .OfType<FunctionCallContent>()
                    .Select((fc, i) => new ToolCall
                    {
                        Index = i,
                        Id = fc.CallId,
                        Type = "function",
                        Function = new FunctionCall
                        {
                            Name = fc.Name,
                            Arguments = fc.Arguments != null ? JsonSerializer.Serialize(fc.Arguments) : null
                        }
                    })
                    .ToList();

                bool hasText = !string.IsNullOrEmpty(update.Text);
                bool hasToolCalls = toolCallDeltas.Count > 0;

                if (!hasText && !hasToolCalls)
                    continue;

                var chunk = new CompletionChunk
                {
                    Choices = new[]
                    {
                        new Choice
                        {
                            Index = 0,
                            Delta = new Delta
                            {
                                Role = isFirstChunk ? "assistant" : null,
                                Content = hasText ? update.Text : null,
                                ToolCalls = hasToolCalls ? toolCallDeltas : null
                            },
                            FinishReason = null
                        }
                    }
                };

                await WriteFrame(context, new Frame { Type = "generation-chunk", Chunk = chunk }, cancellationToken);

                // Accumulate assistant message (content + tool calls)
                if (assistantMessage == null)
                {
                    assistantMessage = new Message
                    {
                        Role = "assistant",
                        Content = update.Text ?? string.Empty,
                        ToolCalls = hasToolCalls ? new List<ToolCall>(toolCallDeltas) : null
                    };
                }
                else
                {
                    if (hasText)
                        assistantMessage.Content += update.Text;
                    if (hasToolCalls)
                    {
                        assistantMessage.ToolCalls ??= new List<ToolCall>();
                        assistantMessage.ToolCalls.AddRange(toolCallDeltas);
                    }
                }

                isFirstChunk = false;
            }

            await WriteFrame(context, new Frame { Type = "generation-finish" }, cancellationToken);
        }
        catch (Exception ex)
        {
            await WriteFrame(context, new Frame
            {
                Type = "generation-error",
                Error = ex.Message,
                Stacktrace = ex.StackTrace
            }, cancellationToken);
            return;
        }

        // Save thread if a store is configured
        if (messageStore != null)
        {
            await WriteFrame(context, new Frame { Type = "thread-save-start" }, cancellationToken);
            try
            {
                await WriteFrame(context, new Frame
                {
                    Type = "thread-save-success",
                    ThreadId = threadId
                }, cancellationToken);
            }
            catch (Exception ex)
            {
                await WriteFrame(context, new Frame
                {
                    Type = "thread-save-failure",
                    Error = ex.Message,
                    Stacktrace = ex.StackTrace
                }, cancellationToken);
            }
        }
    }

    /// <inheritdoc/>
    public async Task<bool> HandleRequestAsync(
        HttpContext context,
        AIAgent agent,
        ChatHistoryProvider? messageStore = null,
        CancellationToken cancellationToken = default)
    {
        CompletionCreateParams? request;
        try
        {
            request = await JsonSerializer.DeserializeAsync<CompletionCreateParams>(
                context.Request.Body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true },
                cancellationToken);

            if (request == null)
            {
                context.Response.StatusCode = 400;
                await context.Response.WriteAsJsonAsync(new { error = "Request body is required" }, cancellationToken);
                return false;
            }
        }
        catch (JsonException ex)
        {
            context.Response.StatusCode = 400;
            await context.Response.WriteAsJsonAsync(new { error = $"Invalid JSON: {ex.Message}" }, cancellationToken);
            return false;
        }

        context.Response.ContentType = "application/octet-stream";
        context.Response.Headers.CacheControl = "no-cache";
        context.Response.Headers.Append("X-Content-Type-Options", "nosniff");

        if (request.Operation == "load-thread")
            await HandleLoadThreadAsync(context, request, agent, messageStore, cancellationToken);
        else
            await HandleGenerateAsync(context, request, agent, messageStore, cancellationToken);

        return true;
    }

    private static async Task WriteFrame(HttpContext context, Frame frame, CancellationToken cancellationToken)
    {
        var encoded = FrameEncoder.Encode(frame);
        await context.Response.Body.WriteAsync(encoded, cancellationToken);
        await context.Response.Body.FlushAsync(cancellationToken);
    }
}
