using System.Security.Cryptography;
using System.Text.Json;
using NuGet.Packaging;

var hashes = new Dictionary<string, object>();
foreach (var file in args)
{
    var bytes = await File.ReadAllBytesAsync(file);
    using var stream = new MemoryStream(bytes, writable: false);
    using var reader = new PackageArchiveReader(stream);
    if (await reader.IsSignedAsync(CancellationToken.None))
    {
        var signature = await reader.GetPrimarySignatureAsync(CancellationToken.None);
        await reader.ValidateIntegrityAsync(signature.SignatureContent, CancellationToken.None);
    }
    hashes.Add(file, new
    {
        contentHash = reader.GetContentHash(CancellationToken.None),
        rawSha256 = Convert.ToHexStringLower(SHA256.HashData(bytes)),
        rawSha512 = Convert.ToBase64String(SHA512.HashData(bytes))
    });
}
Console.WriteLine(JsonSerializer.Serialize(hashes));
