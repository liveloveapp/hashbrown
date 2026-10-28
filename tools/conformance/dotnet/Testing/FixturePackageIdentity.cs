using System.Security.Cryptography;
using System.Text.Json;
using Hashbrown.AspNetCore;

namespace Hashbrown.Conformance.Testing;

/// <summary>Reports the actual loaded package assembly for the external fixture launch guard.</summary>
internal static class FixturePackageIdentity
{
    [System.Runtime.CompilerServices.ModuleInitializer]
    internal static void Emit()
    {
        if (Environment.GetEnvironmentVariable("HASHBROWN_DOTNET_PACKAGE_IDENTITY") != "true") return;
        var assembly = typeof(NativeSessionKey).Assembly;
        Console.WriteLine("HASHBROWN_PACKAGE_IDENTITY:" + JsonSerializer.Serialize(new
        {
            identity = assembly.FullName,
            location = assembly.Location,
            sha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(assembly.Location))).ToLowerInvariant()
        }));
        Console.Out.Flush();
    }
}
