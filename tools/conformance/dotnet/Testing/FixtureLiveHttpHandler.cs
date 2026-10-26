using System.Text.Json;

namespace Hashbrown.Conformance.Testing;

/// <summary>Audits native request metadata in memory and forwards unchanged through normal HTTPS transport.</summary>
public sealed class FixtureLiveHttpHandler(FixtureLiveGate state, string model, string api, HttpMessageHandler? transport = null)
    : DelegatingHandler(transport ?? new HttpClientHandler { AllowAutoRedirect = false })
{
    /// <inheritdoc />
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, state.Token);
        int tokens;
        bool store;
        var path = request.RequestUri?.AbsolutePath;
        try
        {
            var expected = api == "responses"
                ? path is "/v1/responses" or "/openai/v1/responses"
                : path is "/openai/deployments/gpt-4.1-mini/chat/completions";
            if (request.Method != HttpMethod.Post || request.RequestUri?.Scheme != "https" || !expected || request.Content is null)
                throw new InvalidOperationException();
            using var body = JsonDocument.Parse(await request.Content.ReadAsByteArrayAsync(linked.Token));
            var root = body.RootElement;
            var tokenProperty = api == "responses" ? "max_output_tokens" : root.TryGetProperty("max_completion_tokens", out _) ? "max_completion_tokens" : "max_tokens";
            tokens = root.GetProperty(tokenProperty).GetInt32();
            store = root.TryGetProperty("store", out var storeProperty) && storeProperty.GetBoolean();
            if (root.GetProperty("model").GetString() != model || tokens <= 0 || tokens > 384 || store ||
                api == "responses" && (!root.TryGetProperty("store", out _) || storeProperty.ValueKind != JsonValueKind.False))
                throw new InvalidOperationException();
        }
        catch { throw new InvalidOperationException("LIVE_WIRE_INVALID"); }
        var authentication = request.Headers.Contains("api-key") ? "api-key" : request.Headers.Authorization?.Scheme == "Bearer" ? "bearer" : "missing";
        if (authentication == "missing") throw new InvalidOperationException("LIVE_WIRE_INVALID");
        var index = state.WireStarted(request.Method.Method, path!, authentication, tokens, store);
        try
        {
            var response = await base.SendAsync(request, linked.Token);
            state.WireFinished(index, (int)response.StatusCode);
            return response;
        }
        catch { throw new InvalidOperationException(linked.IsCancellationRequested ? "LIVE_CANCELLED" : "LIVE_PROVIDER_FAILED"); }
    }
}
