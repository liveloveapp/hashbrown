using System.Text.Json;

namespace Hashbrown.Conformance.Testing;

/// <summary>Observes actual native HTTPS Requests without replacing transport, TLS, entity bytes or authentication.</summary>
public sealed class FixtureLiveRecoveryHttpHandler(FixtureLiveRecoveryEvidence evidence, string model, string api = "responses", HttpMessageHandler? transport = null, Uri? expectedDestination = null)
    : DelegatingHandler(transport ?? new HttpClientHandler { AllowAutoRedirect = false })
{
    private readonly string _api = api == "responses" || api == "chat-completions" && evidence.Phase == "preflight"
        ? api : throw new InvalidOperationException("RECOVERY_WIRE_CONFIGURATION_INVALID");
    /// <inheritdoc />
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, evidence.Token);
        var path = request.RequestUri?.AbsolutePath ?? "";
        linked.Token.ThrowIfCancellationRequested();
        int index;
        try
        {
            if (request.Method != HttpMethod.Post || (request.RequestUri?.Scheme != "https" && !(evidence.DeterministicControl && request.RequestUri is { Scheme: "http", Host: "127.0.0.1", IsDefaultPort: false })) || request.Content is null ||
                (_api == "responses" ? path is not ("/v1/responses" or "/openai/v1/responses") : path != "/openai/deployments/gpt-4.1-mini/chat/completions"))
                throw new InvalidOperationException();
            if (expectedDestination is not null && (request.RequestUri.GetLeftPart(UriPartial.Authority) != expectedDestination.GetLeftPart(UriPartial.Authority) ||
                path != (_api == "responses" ? expectedDestination.AbsolutePath.TrimEnd('/') + "/responses" : "/openai/deployments/gpt-4.1-mini/chat/completions"))) throw new InvalidOperationException();
            if (_api == "responses" && request.RequestUri.Query.Length != 0) throw new InvalidOperationException();
            var bytes = await request.Content.ReadAsByteArrayAsync(linked.Token);
            if (bytes.Length > 1024 * 1024) throw new InvalidOperationException();
            using var parsed = JsonDocument.Parse(bytes);
            var root = parsed.RootElement;
            var tokenName = _api == "responses" ? "max_output_tokens" : root.TryGetProperty("max_completion_tokens", out _) ? "max_completion_tokens" : "max_tokens";
            var tokens = root.GetProperty(tokenName).GetInt32();
            if (tokens is <= 0 or > 384 || root.GetProperty("model").GetString() != model ||
                _api == "responses" && (!root.TryGetProperty("store", out var store) || store.ValueKind != JsonValueKind.False))
                throw new InvalidOperationException();
            var hasKey = request.Headers.TryGetValues("api-key", out var keys);
            var keyValues = keys?.ToArray() ?? [];
            var bearer = request.Headers.Authorization;
            if (hasKey && (keyValues.Length != 1 || string.IsNullOrWhiteSpace(keyValues[0]) || bearer is not null)) throw new InvalidOperationException();
            var authentication = hasKey ? "api-key" : bearer?.Scheme == "Bearer" && !string.IsNullOrWhiteSpace(bearer.Parameter) ? "bearer" : "missing";
            if (authentication == "missing") throw new InvalidOperationException();
            index = evidence.WireStarted(request.Method.Method, path, authentication, tokens, root.GetProperty(_api == "responses" ? "input" : "messages"));
        }
        catch (OperationCanceledException) when (linked.IsCancellationRequested) { throw; }
        catch { throw new InvalidOperationException("RECOVERY_WIRE_INVALID"); }
        var response = await base.SendAsync(request, linked.Token);
        evidence.WireFinished(index, (int)response.StatusCode);
        return response;
    }
}
