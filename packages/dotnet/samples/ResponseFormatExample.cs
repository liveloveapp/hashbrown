using Azure.AI.OpenAI;
using Hashbrown.DotNet.Extensions;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.AI;

namespace Hashbrown.DotNet.Samples;

/// <summary>
/// Example demonstrating how to use structured output with responseFormat
/// </summary>
public class ResponseFormatExample
{
    public static void ConfigureApp(WebApplication app, IChatClient chatClient)
    {
        // Option 1: Use MapHashbrownChatClient for full control with responseFormat support
        app.MapHashbrownChatClient(
            pattern: "/chat-structured",
            chatClient: chatClient,
            messageProvider: null
        );

        // Example payload that would be sent to this endpoint:
        /*
        {
            "operation": "generate",
            "model": "gpt-4o@2024-05-01-preview",
            "system": "You are a helpful assistant",
            "messages": [{"role": "user", "content": "hi"}],
            "tools": [],
            "responseFormat": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "ui": {
                        "type": "array",
                        "items": {
                            "anyOf": [{
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["app-markdown-renderer"],
                                "properties": {
                                    "app-markdown-renderer": {
                                        "type": "object",
                                        "properties": {
                                            "$props": {
                                                "type": "object",
                                                "properties": {
                                                    "data": {
                                                        "type": "string",
                                                        "description": "The markdown content to render"
                                                    }
                                                },
                                                "required": ["data"],
                                                "additionalProperties": false,
                                                "description": "Component Props"
                                            }
                                        },
                                        "required": ["$props"],
                                        "additionalProperties": false,
                                        "description": "Renders markdown content in assistant messages"
                                    }
                                }
                            }]
                        }
                    }
                },
                "required": ["ui"],
                "additionalProperties": false,
                "description": "UI"
            }
        }
        */
    }

    public static IChatClient CreateChatClient(string apiKey, string endpoint, string deploymentName)
    {
        var azureClient = new AzureOpenAIClient(
            new Uri(endpoint),
            new System.ClientModel.ApiKeyCredential(apiKey)
        );

        return azureClient.GetChatClient(deploymentName).AsIChatClient();
    }
}
