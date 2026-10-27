using Hashbrown.Conformance.Integration;
using Microsoft.Extensions.AI;
using Hashbrown.Conformance.Testing;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
if (await FixtureLiveCleanup.TryRunAsync(builder)) return;
if (builder.Configuration["FixtureNativeSessions"] != "true") HashbrownEndpointConfiguration.Configure(builder.Services);
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins((builder.Configuration["FixtureOrigins"] ?? "http://127.0.0.1:4431,http://127.0.0.1:4432").Split(',', StringSplitOptions.RemoveEmptyEntries))
    .WithMethods("GET", "POST", "OPTIONS").AllowAnyHeader()));
builder.Services.AddAuthentication("fixture").AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, FixtureAuthenticationHandler>("fixture", _ => { });
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("recovery", policy => policy.RequireAuthenticatedUser());
    options.AddPolicy("checkpoint-operator", policy => policy.RequireAuthenticatedUser().RequireRole("checkpoint-operator"));
});
var nativeEnabled = builder.Configuration["FixtureNativeSessions"] == "true";
var connectionString = builder.Configuration["InterruptConnectionString"];
await using var source = connectionString is null ? null : NpgsqlDataSource.Create(connectionString);
var schema = builder.Configuration["InterruptSchema"] ?? "hashbrown";
var nativeGate = new FixtureNativeGate(builder.Configuration["NativeGate"] ?? "");
var tools = new FixtureTools(builder.Configuration["Workflow"] ?? "", source, schema, nativeGate);
var nativeName = builder.Configuration["NativeAgentName"] ?? "HashbrownNative";
var nativeFunction = AIFunctionFactory.Create(tools.LookupNativeAirport, "lookupAirport");
var nativeCatalog = new NativeToolCatalog([new("lookupAirport", int.Parse(builder.Configuration["RegistryVersion"] ?? "1"), nativeFunction.JsonSchema)]);
var nativeOptions = new NativeSessionOptions { Lease = TimeSpan.FromSeconds(double.Parse(builder.Configuration["NativeLeaseSeconds"] ?? "30", System.Globalization.CultureInfo.InvariantCulture)) };
INativeSessionJournal? nativeJournal = null;
if (nativeEnabled)
{
    if (source is null || !string.IsNullOrEmpty(builder.Configuration["Workflow"])) throw new InvalidOperationException("Native fixture requires PostgreSQL and an empty workflow.");
    nativeJournal = new FixtureNativeJournal(new PostgresNativeSessionJournal(source, nativeCatalog,
        ServerConfigurationIdentity.Create(builder.Configuration), schema, nativeOptions), nativeGate, builder.Configuration["NativeFailSave"] == "true");
    await nativeJournal.InitializeAsync();
    await using var nativeEffects = source.CreateCommand($"CREATE TABLE IF NOT EXISTS \"{schema}\".fixture_native_effects(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,code text NOT NULL)");
    await nativeEffects.ExecuteNonQueryAsync();
    NativeSessionEndpointConfiguration.Configure(builder.Services, nativeName, nativeJournal, nativeCatalog,
        context => context.User.FindFirst("scope")?.Value, nativeOptions);
}
var app = builder.Build();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
if (builder.Configuration["FixtureAcknowledgement"] == "observe")
    new FixtureAcknowledgement().Map(app);
app.MapGet("/health", () => Results.Ok());
var clock = new FixtureClock();
var options = new InterruptStoreOptions
{
    CompatibilityIdentity = ServerConfigurationIdentity.Create(builder.Configuration),
    Capacity = int.Parse(builder.Configuration["InterruptCapacity"] ?? "128"),
    PreparationLease = TimeSpan.FromSeconds(double.Parse(builder.Configuration["PreparationLeaseSeconds"] ?? "30", System.Globalization.CultureInfo.InvariantCulture)),
    ApprovalTtl = TimeSpan.FromSeconds(double.Parse(builder.Configuration["ApprovalTtlSeconds"] ?? "600", System.Globalization.CultureInfo.InvariantCulture))
};
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
using var liveState = builder.Configuration["FixtureLive"] == "true"
    ? new FixtureLiveGate(builder.Configuration["FixtureLiveGroup"] ?? "") : null;
using var liveHttp = liveState is null ? null : new HttpClient(new FixtureLiveHttpHandler(liveState,
    builder.Configuration["Model"]!, builder.Configuration["ModelApi"] ?? "responses"));
IChatClient native = liveState is null ? ProviderFactory.Create(builder.Configuration)
    : new FixtureLiveModelClient(ProviderFactory.Create(builder.Configuration,
        new ProviderClientComposition(authentication => authentication.CreateCredential(), liveHttp!)), liveState);
if (liveState is not null)
{
    app.MapGet("/__test/live-stats", () => Results.Json(liveState.Snapshot()));
    app.MapPost("/__test/live-release", () => { liveState.Release(); return Results.Ok(); });
    if (liveState.Group == "preflight")
        app.MapPost("/__test/live-preflight", async (HttpContext context) =>
        {
            try
            {
                await foreach (var update in native.GetStreamingResponseAsync([new ChatMessage(ChatRole.User, "Reply with OK.")], cancellationToken: context.RequestAborted)) { }
                return Results.Ok(liveState.Snapshot());
            }
            catch { return Results.Json(new { code = "LIVE_PROVIDER_FAILED" }, statusCode: 502); }
        });
}
IChatClient client = new InterruptWorkflowClient(new HashbrownRequestClient(native),
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
    long durableNative = 0; string? nativeCode = null;
    if (nativeEnabled)
    {
        await using var command = source!.CreateCommand($"SELECT count(*),(SELECT code FROM \"{schema}\".fixture_native_effects ORDER BY id DESC LIMIT 1) FROM \"{schema}\".fixture_native_effects");
        await using var reader = await command.ExecuteReaderAsync(); await reader.ReadAsync();
        durableNative = reader.GetInt64(0); nativeCode = reader.IsDBNull(1) ? null : reader.GetString(1);
    }
    return Results.Ok(new { durableNative, nativeCode, server = tools.Server, @protected = tools.Protected, protectedCode = tools.ProtectedCode, checkpointStage = tools.CheckpointStage, checkpointCancelled = tools.CheckpointCancelled, durableProtected, durableProtectedCode });
});
if (nativeJournal is not null)
{
    NativeSessionKey Key(string scope, string selector) => new(nativeName, scope, selector, new Dictionary<string, string> { ["isolation"] = scope });
    NativeSessionRecoveryEndpointConfiguration.MapRecovery(app, "/threads/{threadId}/native-session", nativeJournal, "recovery",
        (context, selector) => context.User.FindFirst("scope") is { } claim ? Key(claim.Value, selector) : null, nativeOptions);
    NativeSessionRecoveryEndpointConfiguration.MapOperations(app, "/native-sessions", nativeJournal, "checkpoint-operator",
        context => context.User.FindAll("operator-scope").Select(claim => claim.Value).ToHashSet(StringComparer.Ordinal),
        context => context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, Key);
    app.MapGet("/__test/native-stage", () => Results.Json(new { stage = nativeGate.Stage }));
    app.MapPost("/__test/release-native", () => { nativeGate.Release(); return Results.Ok(); });
    app.MapPost("/__test/expire-native-lease", async () =>
    {
        await using var command = source!.CreateCommand($"UPDATE \"{schema}\".native_sessions SET lease_until=clock_timestamp()-interval '1 second' WHERE state IN ('Owned','Saved','Publishing')");
        await command.ExecuteNonQueryAsync(); return Results.Ok();
    });
    app.MapPost("/__test/native-database-unavailable", async (bool enabled) =>
    {
        await using var command = source!.CreateCommand(enabled ? $"ALTER TABLE \"{schema}\".native_sessions RENAME TO unavailable_native_sessions" : $"ALTER TABLE \"{schema}\".unavailable_native_sessions RENAME TO native_sessions");
        await command.ExecuteNonQueryAsync(); return Results.Ok();
    });
    app.MapGet("/__test/native-effects", async () =>
    {
        await using var command = source!.CreateCommand($"SELECT id,code,count(*) OVER() FROM \"{schema}\".fixture_native_effects ORDER BY id LIMIT 100");
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<object>(); long count = 0;
        while (await reader.ReadAsync()) { count = reader.GetInt64(2); rows.Add(new { id = reader.GetInt64(0), code = reader.GetString(1) }); }
        return Results.Json(new { count, rows });
    });
    NativeSessionEndpointConfiguration.Map(app, "/run", NativeSessionAgentFactory.Create(native, nativeName, [nativeFunction], nativeCatalog, accessor), "recovery");
}
else HashbrownEndpointConfiguration.Map(app, "/run",
    client.AsAIAgent(name: "Hashbrown", tools: [AIFunctionFactory.Create(tools.LookupAirport, "lookupAirport")]),
    pending, Scope, new HashSet<string>(["lookupAirport"], StringComparer.Ordinal));
await app.RunAsync();
