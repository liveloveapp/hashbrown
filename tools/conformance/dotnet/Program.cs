using Hashbrown.Conformance.Integration;
using Microsoft.Extensions.AI;
using Hashbrown.Conformance.Testing;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
HashbrownEndpointConfiguration.Configure(builder.Services);
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins((builder.Configuration["FixtureOrigins"] ?? "http://127.0.0.1:4431,http://127.0.0.1:4432").Split(',', StringSplitOptions.RemoveEmptyEntries))
    .WithMethods("GET", "POST", "OPTIONS").AllowAnyHeader()));
builder.Services.AddAuthentication("fixture").AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, FixtureAuthenticationHandler>("fixture", _ => { });
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("recovery", policy => policy.RequireAuthenticatedUser());
    options.AddPolicy("checkpoint-operator", policy => policy.RequireAuthenticatedUser().RequireRole("checkpoint-operator"));
});
var app = builder.Build();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
if (builder.Configuration["FixtureAcknowledgement"] == "observe")
    new FixtureAcknowledgement().Map(app);
app.MapGet("/health", () => Results.Ok());
var clock = new FixtureClock();
var connectionString = builder.Configuration["InterruptConnectionString"];
await using var source = connectionString is null ? null : NpgsqlDataSource.Create(connectionString);
var schema = builder.Configuration["InterruptSchema"] ?? "hashbrown";
var options = new InterruptStoreOptions
{
    CompatibilityIdentity = ServerConfigurationIdentity.Create(builder.Configuration),
    Capacity = int.Parse(builder.Configuration["InterruptCapacity"] ?? "128"),
    PreparationLease = TimeSpan.FromSeconds(double.Parse(builder.Configuration["PreparationLeaseSeconds"] ?? "30", System.Globalization.CultureInfo.InvariantCulture)),
    ApprovalTtl = TimeSpan.FromSeconds(double.Parse(builder.Configuration["ApprovalTtlSeconds"] ?? "600", System.Globalization.CultureInfo.InvariantCulture))
};
var tools = new FixtureTools(builder.Configuration["Workflow"] ?? "", source, schema);
var registry = tools.Registry(int.Parse(builder.Configuration["RegistryVersion"] ?? "1"));
IInterruptStore underlying;
if (source is not null)
{
    var postgres = new PostgresInterruptStore(source, registry, schema, options);
    await postgres.InitializeAsync();
    await using var fixtureConnection = await source.OpenConnectionAsync();
    await using var fixtureTransaction = await fixtureConnection.BeginTransactionAsync();
    await using var fixtureLock = new NpgsqlCommand("SELECT pg_advisory_xact_lock(hashtextextended(@schema, 1))", fixtureConnection);
    fixtureLock.Parameters.AddWithValue("schema", schema);
    await fixtureLock.ExecuteNonQueryAsync();
    await using var command = new NpgsqlCommand($"CREATE TABLE IF NOT EXISTS \"{schema}\".fixture_effects(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,effect_id text NOT NULL,code text NOT NULL)", fixtureConnection);
    await command.ExecuteNonQueryAsync();
    await fixtureTransaction.CommitAsync();
    underlying = postgres;
}
else underlying = new PendingInterruptStore(clock, registry, options);
var captureGate = new FixtureCaptureGate(builder.Configuration["CaptureGate"] ?? "");
var pending = new FixtureInterruptStore(underlying, tools, captureGate);
app.MapGet("/__test/capture-stage", () => Results.Json(new { stage = captureGate.Stage }));
app.MapPost("/__test/release-capture", () => { captureGate.Release(); return Results.Ok(); });
FixtureRecoveryControls.Map(app, source, schema, pending);
FixtureServerIdentityControls.Map(app, source, schema, registry);
RecoveryEndpointConfiguration.MapRecovery(app, "/threads/{threadId}/recovery", pending, "recovery",
    context => context.User.FindFirst("scope")?.Value, options);
RecoveryEndpointConfiguration.MapOperations(app, "/checkpoints", pending, "checkpoint-operator",
    context => context.User.FindAll("operator-scope").Select(claim => claim.Value).ToHashSet(StringComparer.Ordinal),
    context => context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value);
app.MapPost("/__test/advance-clock", () => { clock.Advance(); return Results.Ok(); });
app.MapPost("/__test/release-checkpoint", () => { tools.Release(); return Results.Ok(); });
app.MapPost("/__test/database-unavailable", async (bool enabled) =>
{
    if (source is null) pending.Unavailable = enabled;
    else
    {
        await using var command = source.CreateCommand(enabled
            ? $"ALTER TABLE \"{schema}\".interrupt_batches RENAME TO unavailable_batches"
            : $"ALTER TABLE \"{schema}\".unavailable_batches RENAME TO interrupt_batches");
        await command.ExecuteNonQueryAsync();
    }
    return Results.Ok();
});
if (source is not null)
{
    app.MapPost("/__test/expire-lease", async () =>
    {
        await using var command = source.CreateCommand($"UPDATE \"{schema}\".interrupt_batches SET lease_until=clock_timestamp()-interval '1 second' WHERE state='Claimed'");
        await command.ExecuteNonQueryAsync(); return Results.Ok();
    });
    app.MapPost("/__test/expire-approval", async () =>
    {
        await using var command = source.CreateCommand($"UPDATE \"{schema}\".interrupt_batches SET expires_at=clock_timestamp()-interval '1 second'");
        await command.ExecuteNonQueryAsync(); return Results.Ok();
    });
    app.MapPost("/__test/corrupt-operation", async (string kind) =>
    {
        await using var command = source.CreateCommand(kind == "version" ? $"UPDATE \"{schema}\".interrupt_batches SET operation_version=999" : $"UPDATE \"{schema}\".interrupt_batches SET parameters='{{\"code\":123}}'::jsonb");
        await command.ExecuteNonQueryAsync(); return Results.Ok();
    });
    app.MapPost("/__test/fail-dispatch", async () =>
    {
        await using var command = source.CreateCommand($"""
            CREATE OR REPLACE FUNCTION "{schema}".fixture_fail_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            IF NEW.state='EffectStarted' THEN RAISE EXCEPTION 'Fixture dispatch persistence failure'; END IF; RETURN NEW; END $$;
            CREATE TRIGGER fixture_fail_dispatch BEFORE UPDATE ON "{schema}".interrupt_batches FOR EACH ROW EXECUTE FUNCTION "{schema}".fixture_fail_dispatch();
            """);
        await command.ExecuteNonQueryAsync(); return Results.Ok();
    });
    app.MapPost("/__test/drop-schema", async () =>
    {
        if (!schema.StartsWith("durable_", StringComparison.Ordinal)) return Results.BadRequest();
        await using var command = source.CreateCommand($"DROP SCHEMA IF EXISTS \"{schema}\" CASCADE");
        await command.ExecuteNonQueryAsync(); return Results.Ok();
    });
}
var accessor = app.Services.GetRequiredService<IHttpContextAccessor>();
string Scope() => accessor.HttpContext?.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "local-fixture";
IChatClient client = new InterruptWorkflowClient(new HashbrownRequestClient(ProviderFactory.Create(builder.Configuration)),
    pending, registry, input => builder.Configuration["Workflow"]?.StartsWith("confirm", StringComparison.Ordinal) == true ||
        builder.Configuration["Workflow"] == "after-tool" && input.Messages.Any(message => message.Role == "tool")
        ? tools.Checkpoint(builder.Configuration["CheckpointCode"] ?? "PDX") : null, Scope, () => HashbrownEndpointConfiguration.GetClaim(accessor.HttpContext));
if (builder.Configuration["FixtureProgressPrelude"] == "true")
    client = new FixtureProgressClient(client, () => accessor.HttpContext is { } context &&
        HashbrownEndpointConfiguration.GetClaim(context) is not null && context.Items.TryAdd(typeof(FixtureProgressClient), true));
app.MapGet("/__test/counters", async () =>
{
    long durableProtected = 0;
    string? durableProtectedCode = null;
    if (source is not null)
    {
        await using var command = source.CreateCommand($"SELECT count(*),(SELECT code FROM \"{schema}\".fixture_effects ORDER BY id DESC LIMIT 1) FROM \"{schema}\".fixture_effects");
        await using var reader = await command.ExecuteReaderAsync();
        await reader.ReadAsync();
        durableProtected = reader.GetInt64(0);
        durableProtectedCode = reader.IsDBNull(1) ? null : reader.GetString(1);
    }
    return Results.Ok(new { server = tools.Server, @protected = tools.Protected, protectedCode = tools.ProtectedCode, checkpointStage = tools.CheckpointStage, checkpointCancelled = tools.CheckpointCancelled, durableProtected, durableProtectedCode });
});
HashbrownEndpointConfiguration.Map(app, "/run",
    client.AsAIAgent(name: "Hashbrown", tools: [AIFunctionFactory.Create(tools.LookupAirport, "lookupAirport")]),
    pending, Scope, new HashSet<string>(["lookupAirport"], StringComparer.Ordinal));
await app.RunAsync();
