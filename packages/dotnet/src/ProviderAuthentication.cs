using Azure.Core;
using Azure.Identity;

namespace Hashbrown.AspNetCore;

/// <summary>Trusted, validated Azure authentication settings. Credentials own token caching.</summary>
public sealed record ProviderAuthentication(string Mode, string? ManagedIdentityClientId)
{
  /// <summary>Constructs only the explicitly selected identity, without requesting a token.</summary>
  public TokenCredential CreateCredential() => Mode switch
  {
    "azure-cli" => new AzureCliCredential(new AzureCliCredentialOptions { ProcessTimeout = TimeSpan.FromSeconds(10) }),
    "managed-identity" => new ManagedIdentityCredential(ManagedIdentityClientId is null
        ? ManagedIdentityId.SystemAssigned
        : ManagedIdentityId.FromUserAssignedClientId(ManagedIdentityClientId)),
    _ => throw new InvalidOperationException("Token credentials require an identity authentication mode.")
  };

  internal static ProviderAuthentication Parse(IConfiguration configuration, string provider)
  {
    var mode = configuration["AzureAuthentication"] ?? "api-key";
    if (mode is not ("api-key" or "azure-cli" or "managed-identity"))
      throw new InvalidOperationException("AzureAuthentication must be api-key, azure-cli or managed-identity.");
    if (provider != "azure" && mode != "api-key")
      throw new InvalidOperationException("OpenAI supports only api-key authentication.");
    var clientId = configuration["ManagedIdentityClientId"];
    if (clientId is not null && (mode != "managed-identity" || string.IsNullOrWhiteSpace(clientId)))
      throw new InvalidOperationException("ManagedIdentityClientId requires managed-identity authentication and a nonempty value.");
    return new ProviderAuthentication(mode, clientId);
  }
}

/// <summary>Server-only composition for credential construction and native SDK HTTP transport.</summary>
public sealed record ProviderClientComposition(Func<ProviderAuthentication, TokenCredential> CredentialFactory, HttpClient? HttpClient = null);
