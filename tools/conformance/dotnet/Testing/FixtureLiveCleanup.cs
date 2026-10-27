using System.Text.RegularExpressions;
using Npgsql;

namespace Hashbrown.Conformance.Testing;

/// <summary>Runs a provider-free cleanup worker for one strictly owned live schema after its worker has quiesced.</summary>
public static class FixtureLiveCleanup
{
    /// <summary>Handles only explicit cleanup mode, before model, tool, or journal initialization.</summary>
    public static async Task<bool> TryRunAsync(WebApplicationBuilder builder)
    {
        if (builder.Configuration["FixtureDropSchemaOnly"] != "true") return false;
        var schema = builder.Configuration["InterruptSchema"] ?? "";
        var connection = builder.Configuration["InterruptConnectionString"];
        var urls = builder.Configuration["urls"] ?? builder.Configuration["ASPNETCORE_URLS"] ?? "";
        if (!Regex.IsMatch(schema, @"\Adurable_live_[a-f0-9]{32}\z", RegexOptions.CultureInvariant) ||
            string.IsNullOrWhiteSpace(connection) || !Uri.TryCreate(urls, UriKind.Absolute, out var listener) ||
            listener.Scheme != "http" || listener.Host != "127.0.0.1" || listener.AbsolutePath != "/" ||
            listener.UserInfo.Length != 0 || listener.Query.Length != 0 || listener.Fragment.Length != 0)
            throw new InvalidOperationException("LIVE_CLEANUP_CONFIGURATION_INVALID");
        await using var source = NpgsqlDataSource.Create(connection);
        var app = builder.Build();
        app.MapGet("/health", () => Results.Ok());
        app.MapPost("/__test/drop-schema", async (HttpContext context) =>
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
            deadline.CancelAfter(TimeSpan.FromSeconds(5));
            await using var command = source.CreateCommand($"DROP SCHEMA IF EXISTS \"{schema}\" CASCADE");
            await command.ExecuteNonQueryAsync(deadline.Token);
            return Results.Ok();
        });
        await app.RunAsync();
        return true;
    }
}
