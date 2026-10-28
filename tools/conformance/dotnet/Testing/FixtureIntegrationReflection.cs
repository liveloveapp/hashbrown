using System.Reflection;
using Hashbrown.AspNetCore;

namespace Hashbrown.Conformance.Testing;

/// <summary>Test-host-only access to existing internal library diagnostics.</summary>
internal static class FixtureIntegrationReflection
{
    /// <summary>Reads an existing diagnostic property without changing its visibility.</summary>
    internal static T Read<T>(object instance, string property) =>
        (T)instance.GetType().GetProperty(property, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(instance)!;

    /// <summary>Clones an internal record before replacing fixture-only diagnostic values.</summary>
    internal static object Copy(object instance, params (string Property, object? Value)[] changes)
    {
        var clone = instance.GetType().GetMethod("<Clone>$")!.Invoke(instance, null)!;
        foreach (var (property, value) in changes) clone.GetType().GetProperty(property, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)!.SetValue(clone, value);
        return clone;
    }

    /// <summary>Constructs an existing internal diagnostic object in the test host.</summary>
    internal static object Create(Type type, params object?[] arguments) => Activator.CreateInstance(type, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic, null, arguments, null)!;

    /// <summary>Invokes an existing diagnostic method in the test host.</summary>
    internal static object? Call(object? instance, Type type, string method, params object?[] arguments) => type.GetMethod(method, BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)!.Invoke(instance, arguments);

    /// <summary>Resolves a diagnostic type from the public library anchor assembly.</summary>
    internal static Type Type(string name) => typeof(PendingInterruptStore).Assembly.GetType("Hashbrown.AspNetCore." + name, throwOnError: true)!;
}
