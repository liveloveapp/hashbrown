using System.Security.Cryptography;
using System.Text.Json;
using NuGet.Packaging;
using NuGet.Packaging.Signing;

var hashes = new Dictionary<string, object>();
var publishedArchive = args.FirstOrDefault() == "--published-archive"
    ? args.ElementAtOrDefault(1) ?? throw new InvalidDataException("Published archive missing")
    : null;
foreach (var file in publishedArchive is null ? args : args.Skip(1))
{
    var bytes = await File.ReadAllBytesAsync(file);
    using var stream = new MemoryStream(bytes, writable: false);
    using var reader = new PackageArchiveReader(stream);
    string repositorySignatureUrl = null;
    if (await reader.IsSignedAsync(CancellationToken.None))
    {
        var signature = await reader.GetPrimarySignatureAsync(CancellationToken.None);
        await reader.ValidateIntegrityAsync(signature.SignatureContent, CancellationToken.None);
        if (signature is RepositoryPrimarySignature repositorySignature)
            repositorySignatureUrl = repositorySignature.V3ServiceIndexUrl.ToString();
    }
    if (file == publishedArchive && repositorySignatureUrl != "https://api.nuget.org/v3/index.json")
        throw new InvalidDataException("Published NuGet.org repository signature required");
    hashes.Add(file, new
    {
        repositorySignatureUrl,
        contentHash = reader.GetContentHash(CancellationToken.None),
        rawSha256 = Convert.ToHexStringLower(SHA256.HashData(bytes)),
        rawSha512 = Convert.ToBase64String(SHA512.HashData(bytes))
    });
}
Console.WriteLine(JsonSerializer.Serialize(hashes));
