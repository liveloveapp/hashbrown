using Hashbrown.DotNet.Extensions;
using Hashbrown.DotNet.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Hashbrown.DotNet.Tests.Extensions;

public class HashbrownServiceExtensionsTests
{
    [Fact]
    public void AddHashbrown_Should_RegisterIHashbrownAgentService()
    {
        var services = new ServiceCollection();

        services.AddHashbrown();

        var descriptor = services.FirstOrDefault(d => d.ServiceType == typeof(IHashbrownAgentService));
        descriptor.Should().NotBeNull();
    }

    [Fact]
    public void AddHashbrown_Should_RegisterIHashbrownAgentService_AsSingleton()
    {
        var services = new ServiceCollection();

        services.AddHashbrown();

        var descriptor = services.First(d => d.ServiceType == typeof(IHashbrownAgentService));
        descriptor.Lifetime.Should().Be(ServiceLifetime.Singleton);
    }

    [Fact]
    public void AddHashbrown_Should_RegisterHashbrownAgentService_AsImplementation()
    {
        var services = new ServiceCollection();

        services.AddHashbrown();

        var descriptor = services.First(d => d.ServiceType == typeof(IHashbrownAgentService));
        descriptor.ImplementationType.Should().Be(typeof(HashbrownAgentService));
    }

    [Fact]
    public void AddHashbrown_Should_ResolveIHashbrownAgentService()
    {
        var services = new ServiceCollection();
        services.AddHashbrown();
        var provider = services.BuildServiceProvider();

        var service = provider.GetService<IHashbrownAgentService>();

        service.Should().NotBeNull();
        service.Should().BeOfType<HashbrownAgentService>();
    }

    [Fact]
    public void AddHashbrown_Should_ReturnSameServiceCollection()
    {
        var services = new ServiceCollection();

        var result = services.AddHashbrown();

        result.Should().BeSameAs(services);
    }
}
