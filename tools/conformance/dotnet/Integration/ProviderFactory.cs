using System.ClientModel;
using System.ClientModel.Primitives;
using Azure.AI.OpenAI;
using Microsoft.Extensions.AI;
using OpenAI;

namespace Hashbrown.Conformance.Integration;

/// <summary>Creates a native provider client from trusted server configuration.</summary>
public static class ProviderFactory
{
    /// <summary>Uses the genuine OpenAI or Azure client while retaining its native request shape.</summary>
    public static IChatClient Create(IConfiguration configuration)
    {
        var endpoint = new Uri(configuration["ModelEndpoint"] ?? throw new InvalidOperationException("ModelEndpoint is required."));
        var credential = new ApiKeyCredential(configuration["ApiKey"] ?? throw new InvalidOperationException("ApiKey is required."));
        var model = configuration["Model"] ?? throw new InvalidOperationException("Model is required.");
        return configuration["Provider"] switch
        {
            "openai" => new OpenAIClient(credential, new OpenAIClientOptions
            {
                Endpoint = endpoint,
                RetryPolicy = new ClientRetryPolicy(0)
            }).GetChatClient(model).AsIChatClient(),
            "azure" => new AzureOpenAIClient(endpoint, credential, new AzureOpenAIClientOptions
            {
                RetryPolicy = new ClientRetryPolicy(0)
            }).GetChatClient(model).AsIChatClient(),
            _ => throw new InvalidOperationException("Provider must be openai or azure.")
        };
    }
}
