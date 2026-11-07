using System.Net;
using System.Security.Claims;

namespace Hashbrown.Starter;

/// <summary>Application-owned local development policy. Replace with real authentication before production.</summary>
internal static class DevelopmentIdentityPolicy
{
  /// <summary>Refuses startup without an explicitly enabled loopback-only development identity.</summary>
  internal static void ValidateStartup(string environment, bool enabled, string boundOrigin)
  {
    if (environment != "Development") throw new InvalidOperationException("Integrate application authentication and authorization before running outside Development; the starter local identity is forbidden in production.");
    if (!enabled) throw new InvalidOperationException("Set DevelopmentIdentityEnabled=true explicitly in Development, or replace the local identity with your application authentication.");
    if (!TryOrigin(boundOrigin, out _)) throw new InvalidOperationException("LocalOrigin must be a single HTTP(S) loopback origin with an explicit port and no path, credentials, query or fragment.");
  }

  /// <summary>Checks actual peer, Host and Origin before granting a fixed server-owned identity.</summary>
  internal static ClaimsPrincipal? Authorize(string environment, bool enabled, string boundOrigin, string remote, string host, string? origin, string method, string? marker, string? callerScope)
  {
    if (environment != "Development" || !enabled || !TryOrigin(boundOrigin, out var expected) || !IPAddress.TryParse(remote, out var address) || !IsLoopback(address) || callerScope is not null) return null;
    if (!string.Equals(host, expected!.Authority, StringComparison.OrdinalIgnoreCase)) return null;
    if (origin is not null && !string.Equals(origin, expected.GetLeftPart(UriPartial.Authority), StringComparison.Ordinal)) return null;
    if (origin is null && method is not ("GET" or "HEAD" or "OPTIONS") && marker != "starter") return null;
    return new(new ClaimsIdentity([new(ClaimTypes.NameIdentifier, "starter-local-user"), new(ClaimTypes.Name, "Local developer"), new("hashbrown_scope", "starter-local-scope")], "starter-development"));
  }

  private static bool TryOrigin(string text, out Uri? origin)
  {
    if (!Uri.TryCreate(text, UriKind.Absolute, out origin) || origin.Scheme is not ("http" or "https") || origin.UserInfo.Length != 0 || origin.AbsolutePath != "/" || origin.Query.Length != 0 || origin.Fragment.Length != 0 || origin.IsDefaultPort) return false;
    return origin.Host == "localhost" || IPAddress.TryParse(origin.Host, out var address) && IsLoopback(address);
  }
  private static bool IsLoopback(IPAddress address) => IPAddress.IsLoopback(address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address);
}
