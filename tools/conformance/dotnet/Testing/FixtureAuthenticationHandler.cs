using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Hashbrown.Conformance.Testing;

/// <summary>Test-only fixed credentials exercising real ASP.NET authentication and policy authorization.</summary>
public sealed class FixtureAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    /// <inheritdoc />
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var credential = Request.Headers["X-Fixture-Principal"].FirstOrDefault();
        if (credential is not ("alice" or "bob" or "operator" or "operator-bob")) return Task.FromResult(AuthenticateResult.NoResult());
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, credential), new("scope", credential) };
        if (credential is "operator" or "operator-bob")
        {
            claims.Add(new(ClaimTypes.Role, "checkpoint-operator"));
            foreach (var scope in credential == "operator" ? new[] { "alice", "bob", "local-fixture" } : new[] { "bob" }) claims.Add(new("operator-scope", scope));
        }
        return Task.FromResult(AuthenticateResult.Success(new(new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name)), Scheme.Name)));
    }
}
