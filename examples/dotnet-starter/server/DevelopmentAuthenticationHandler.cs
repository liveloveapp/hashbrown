using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Hashbrown.Starter;

/// <summary>Uses only the direct network peer and application policy; forwarded headers grant no authority.</summary>
internal sealed class DevelopmentAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, IHostEnvironment environment, IConfiguration configuration) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
  /// <inheritdoc />
  protected override Task<AuthenticateResult> HandleAuthenticateAsync()
  {
    var origin = Request.Headers.Origin;
    var marker = Request.Headers["Hashbrown-Starter"];
    var scope = Request.Headers["Hashbrown-Scope"];
    var forgedScope = Request.Headers.ContainsKey("X-Scope") || Request.Headers.ContainsKey("X-User") || Request.Headers.ContainsKey("X-Fixture-Principal") || scope.Count != 0;
    var principal = origin.Count > 1 || marker.Count > 1 ? null : DevelopmentIdentityPolicy.Authorize(environment.EnvironmentName, configuration.GetValue<bool>("DevelopmentIdentityEnabled"), configuration["LocalOrigin"]!, Context.Connection.RemoteIpAddress?.ToString() ?? "", Request.Host.Value ?? "", origin.Count == 0 ? null : origin.ToString(), Request.Method, marker.Count == 0 ? null : marker.ToString(), forgedScope ? "caller-controlled" : null);
    return Task.FromResult(principal is null ? AuthenticateResult.Fail("Local development request is not permitted.") : AuthenticateResult.Success(new AuthenticationTicket(principal, Scheme.Name)));
  }
}
