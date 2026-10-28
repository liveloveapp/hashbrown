using System.Security.Cryptography;
using System.Text.Json;

namespace Hashbrown.AspNetCore;

/// <summary>Builds a stable, secret-free compatibility binding from trusted model configuration.</summary>
public static class ServerConfigurationIdentity
{
  /// <summary>Hashes API, provider, effective endpoint and model; credentials are excluded. Ambiguous endpoint credentials or routing components are rejected.</summary>
  public static string Create(IConfiguration configuration)
  {
    var api = configuration["ModelApi"] ?? "chat-completions";
    if (api is not ("responses" or "chat-completions")) throw new InvalidOperationException("ModelApi must be responses or chat-completions.");
    var provider = configuration["Provider"];
    if (provider is not ("openai" or "azure")) throw new InvalidOperationException("Provider must be openai or azure.");
    var endpoint = new Uri(configuration["ModelEndpoint"] ?? throw new InvalidOperationException("ModelEndpoint is required."), UriKind.Absolute);
    if (endpoint.Scheme is not ("https" or "http") || endpoint.UserInfo.Length != 0 || endpoint.Query.Length != 0 || endpoint.Fragment.Length != 0)
      throw new InvalidOperationException("ModelEndpoint must be an HTTP endpoint without credentials, query or fragment.");
    if (provider == "azure" && api == "responses" && endpoint.AbsolutePath.TrimEnd('/') == "") endpoint = new Uri(endpoint, "openai/v1/");
    var canonical = new UriBuilder(endpoint) { Host = endpoint.IdnHost.ToLowerInvariant(), Path = endpoint.AbsolutePath.EndsWith('/') ? endpoint.AbsolutePath : endpoint.AbsolutePath + "/" }.Uri.AbsoluteUri;
    var model = configuration["Model"] ?? throw new InvalidOperationException("Model is required.");
    return Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new[] { "hashbrown-server-identity-v1", api, provider, canonical, model })));
  }
}
