#pragma warning disable OPENAI001 // Pinned native Responses SDK API is experimental.
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
    public static IChatClient Create(IConfiguration configuration) => Create(configuration, null);

    /// <summary>Composes trusted server credentials and transport after validating configuration.</summary>
    public static IChatClient Create(IConfiguration configuration, ProviderClientComposition? composition)
    {
        var api = configuration["ModelApi"] ?? "chat-completions";
        if (api is not ("responses" or "chat-completions"))
            throw new InvalidOperationException("ModelApi must be responses or chat-completions.");
        var provider = configuration["Provider"];
        if (provider is not ("openai" or "azure"))
            throw new InvalidOperationException("Provider must be openai or azure.");
        var authentication = ProviderAuthentication.Parse(configuration, provider);
        if (!Uri.TryCreate(configuration["ModelEndpoint"], UriKind.Absolute, out var endpoint) ||
            endpoint.Scheme is not ("https" or "http") || !string.IsNullOrEmpty(endpoint.UserInfo) ||
            !string.IsNullOrEmpty(endpoint.Query) || !string.IsNullOrEmpty(endpoint.Fragment))
            throw new InvalidOperationException("ModelEndpoint must be an absolute HTTP(S) URL without credentials, query or fragment.");
        if (authentication.Mode != "api-key" && endpoint.Scheme != "https")
            throw new InvalidOperationException("Identity authentication requires an HTTPS ModelEndpoint.");
        var model = configuration["Model"];
        if (string.IsNullOrWhiteSpace(model)) throw new InvalidOperationException("Model is required.");
        var key = configuration["ApiKey"];
        if (authentication.Mode == "api-key" && string.IsNullOrWhiteSpace(key))
            throw new InvalidOperationException("ApiKey is required for api-key authentication.");

        var credential = authentication.Mode == "api-key" ? null :
            composition is null ? authentication.CreateCredential() : composition.CredentialFactory(authentication);
        if (authentication.Mode != "api-key" && credential is null)
            throw new InvalidOperationException("Identity authentication requires a token credential.");
        var transport = composition?.HttpClient is { } http ? new HttpClientPipelineTransport(http) : null;
        if (api == "responses")
        {
            if (provider == "azure" && endpoint.AbsolutePath.TrimEnd('/') == "")
                endpoint = new Uri(endpoint, "openai/v1/");
            var options = new OpenAIClientOptions { Endpoint = endpoint, RetryPolicy = new ClientRetryPolicy(0) };
            if (transport is not null) options.Transport = transport;
            var client = credential is null
                ? new OpenAIClient(new ApiKeyCredential(key!), options)
                : new OpenAIClient(new BearerTokenPolicy(credential, "https://ai.azure.com/.default"), options);
            return new StatelessResponsesClient(client.GetResponsesClient().AsIChatClient(model));
        }
        if (provider == "openai")
        {
            var options = new OpenAIClientOptions { Endpoint = endpoint, RetryPolicy = new ClientRetryPolicy(0) };
            if (transport is not null) options.Transport = transport;
            return new OpenAIClient(new ApiKeyCredential(key!), options).GetChatClient(model).AsIChatClient();
        }
        var azureOptions = new AzureOpenAIClientOptions
        {
            Audience = AzureOpenAIAudience.AzurePublicCloud,
            RetryPolicy = new ClientRetryPolicy(0)
        };
        if (transport is not null) azureOptions.Transport = transport;
        var azureClient = credential is null
            ? new AzureOpenAIClient(endpoint, new ApiKeyCredential(key!), azureOptions)
            : new AzureOpenAIClient(endpoint, credential, azureOptions);
        return azureClient.GetChatClient(model).AsIChatClient();
    }
}
