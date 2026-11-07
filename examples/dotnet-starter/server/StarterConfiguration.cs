namespace Hashbrown.Starter;

/// <summary>Validates server-owned provider routing; credentials are never sent to clients.</summary>
internal static class StarterConfiguration
{
  /// <summary>Defaults deliberately to Responses and selects only the configured provider's API key.</summary>
  internal static void Configure(ConfigurationManager configuration)
  {
    configuration["ModelApi"] ??= "responses";
    if (configuration["Provider"] is not ("openai" or "azure")) throw new InvalidOperationException("Set Provider=openai or azure and configure ModelEndpoint and Model on the server.");
    if (string.IsNullOrWhiteSpace(configuration["ModelEndpoint"]) || string.IsNullOrWhiteSpace(configuration["Model"])) throw new InvalidOperationException("ModelEndpoint and Model (Azure deployment name) are required server configuration.");
    if ((configuration["AzureAuthentication"] ?? "api-key") == "api-key" && string.IsNullOrWhiteSpace(configuration["ApiKey"])) configuration["ApiKey"] = Environment.GetEnvironmentVariable(configuration["Provider"] == "openai" ? "OPENAI_API_KEY" : "AZURE_OPENAI_API_KEY");
  }
}
