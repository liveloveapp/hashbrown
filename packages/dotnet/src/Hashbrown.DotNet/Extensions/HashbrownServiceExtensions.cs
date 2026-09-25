using Hashbrown.DotNet.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Hashbrown.DotNet.Extensions;

/// <summary>
/// Extension methods for registering Hashbrown services in the DI container.
/// </summary>
public static class HashbrownServiceExtensions
{
    /// <summary>
    /// Registers Hashbrown core services required by <c>MapHashbrownAgent</c>.
    /// Call this in <c>Program.cs</c> before <c>app.MapHashbrownAgent(...)</c>.
    /// </summary>
    /// <example>
    /// <code>
    /// builder.Services.AddHashbrown();
    /// </code>
    /// </example>
    public static IServiceCollection AddHashbrown(this IServiceCollection services)
    {
        services.AddSingleton<IHashbrownAgentService, HashbrownAgentService>();
        return services;
    }
}
