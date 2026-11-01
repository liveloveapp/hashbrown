#pragma warning disable MAAI001 // Fixture forwards pinned native keyed-store/partition APIs without replacing authority.
using Microsoft.Agents.AI;
using Hashbrown.AspNetCore;
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
var nativeApprovals = builder.Configuration["FixtureNativeApprovals"] == "true";
var nativeEnabled = builder.Configuration["FixtureNativeSessions"] == "true";
var connectionString = builder.Configuration["InterruptConnectionString"];
await using var source = connectionString is null ? null : NpgsqlDataSource.Create(connectionString);
var schema = builder.Configuration["InterruptSchema"] ?? "hashbrown";
var nativeGate = new FixtureNativeGate(builder.Configuration["NativeGate"] ?? "");
IHttpContextAccessor? nativeAccessor = null;
var tools = new FixtureTools(builder.Configuration["Workflow"] ?? "", source, schema, nativeGate, () => nativeAccessor?.HttpContext);
var nativeName = builder.Configuration["NativeAgentName"] ?? "HashbrownNative";
AIFunction nativeFunction = AIFunctionFactory.Create(nativeApprovals ? tools.LookupProtectedNativeAirport : tools.LookupNativeAirport, "lookupAirport");
if (nativeApprovals) nativeFunction = new ApprovalRequiredAIFunction(nativeFunction);
if (nativeApprovals && !nativeEnabled) throw new InvalidOperationException("Protected native fixture requires native sessions.");
var nativeCatalog = new NativeToolCatalog([new("lookupAirport", int.Parse(builder.Configuration["RegistryVersion"] ?? "1"), nativeFunction.JsonSchema, RequiresConfirmation: nativeApprovals)]);
var nativeOptions = new NativeSessionOptions { PayloadCapacity = int.Parse(builder.Configuration["NativePayloadCapacity"] ?? "128"), SelectorCapacity = int.Parse(builder.Configuration["NativeSelectorCapacity"] ?? "4096"), MaximumCalls = int.Parse(builder.Configuration["NativeMaximumCalls"] ?? "256"), Lease = TimeSpan.FromSeconds(double.Parse(builder.Configuration["NativeLeaseSeconds"] ?? "30", System.Globalization.CultureInfo.InvariantCulture)) };
var liveApproval = builder.Configuration["FixtureLive"] == "true" && builder.Configuration["FixtureLiveGroup"] == "native-approval" ? new FixtureLiveApprovalProof(nativeCatalog.Identity) : null;
INativeSessionJournal? nativeJournal = null;
if (nativeEnabled)
{
    if (source is null || !string.IsNullOrEmpty(builder.Configuration["Workflow"])) throw new InvalidOperationException("Native fixture requires PostgreSQL and an empty workflow.");
    nativeJournal = new FixtureNativeJournal(new PostgresNativeSessionJournal(source, nativeCatalog,
        ServerConfigurationIdentity.Create(builder.Configuration), schema, nativeOptions), nativeGate, builder.Configuration["NativeFailSave"] == "true", liveApproval);
    await nativeJournal.InitializeAsync();
    await using var nativeEffects = source.CreateCommand($"CREATE TABLE IF NOT EXISTS \"{schema}\".fixture_native_effects(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,code text NOT NULL)");
    await nativeEffects.ExecuteNonQueryAsync();
    await using var approvalEffects = source.CreateCommand($"CREATE TABLE IF NOT EXISTS \"{schema}\".fixture_native_approval_effects(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,session_id text NOT NULL,call_id text NOT NULL,request_id text NOT NULL,batch_id text NOT NULL,admitted_generation bigint NOT NULL,admitted_revision bigint NOT NULL,code text NOT NULL)");
    await approvalEffects.ExecuteNonQueryAsync();
    NativeSessionEndpointConfiguration.Configure(builder.Services, nativeName, nativeJournal, nativeCatalog,
        context => context.User.FindFirst("scope")?.Value, nativeOptions);
}
if (nativeEnabled && (builder.Configuration["NativeTenant"] is not null || builder.Configuration["NativeRegion"] is not null))
{
    var descriptor = builder.Services.Last(item => item.IsKeyedService && item.ServiceType == typeof(AgentSessionStore) && Equals(item.ServiceKey, nativeName));
    builder.Services.AddKeyedSingleton<AgentSessionStore>(nativeName, (services, key) => new FixtureNativePartitionStore((AgentSessionStore)descriptor.KeyedImplementationFactory!(services, key), builder.Configuration["NativeTenant"], builder.Configuration["NativeRegion"]));
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
nativeAccessor = accessor;
string Scope() => accessor.HttpContext?.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "local-fixture";
using var liveState = builder.Configuration["FixtureLive"] == "true"
    ? new FixtureLiveGate(builder.Configuration["FixtureLiveGroup"] ?? "", approval: liveApproval) : null;
using var liveHttp = liveState is null ? null : new HttpClient(new FixtureLiveHttpHandler(liveState,
    builder.Configuration["Model"]!, builder.Configuration["ModelApi"] ?? "responses"));
IChatClient native = liveState is null ? ProviderFactory.Create(builder.Configuration)
    : new FixtureLiveModelClient(ProviderFactory.Create(builder.Configuration,
        new ProviderClientComposition(authentication => authentication.CreateCredential(), liveHttp!)), liveState);
if (liveState is not null)
{
    app.MapGet("/__test/live-stats", async (HttpContext context) =>
    {
        if (liveApproval is not null) await liveApproval.ObserveDatabaseAsync(source!, schema, context.RequestAborted);
        return Results.Json(liveState.Snapshot());
    });
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
    long durableNativeProtected = 0;
    if (nativeEnabled)
    {
        await using var command = source!.CreateCommand($"SELECT count(*) FROM \"{schema}\".fixture_native_approval_effects");
        durableNativeProtected = (long)(await command.ExecuteScalarAsync())!;
    }
    return Results.Ok(new { durableNativeProtected, durableNative, nativeCode, server = tools.Server, @protected = tools.Protected, protectedCode = tools.ProtectedCode, checkpointStage = tools.CheckpointStage, checkpointCancelled = tools.CheckpointCancelled, durableProtected, durableProtectedCode });
});
if (nativeJournal is not null)
{
    NativeSessionKey Key(string scope, string selector)
    {
        var partitions = new Dictionary<string, string> { ["isolation"] = scope };
        if (builder.Configuration["NativeTenant"] is { } tenant) partitions.Add("tenant", tenant);
        if (builder.Configuration["NativeRegion"] is { } region) partitions.Add("region", region);
        return new(nativeName, scope, selector, partitions);
    }
    FixtureNativeRecoveryControls.Map(app, source!, schema, Key);
    NativeSessionRecoveryEndpointConfiguration.MapRecovery(app, "/threads/{threadId}/native-session", nativeJournal, "recovery",
        (context, selector) => context.User.FindFirst("scope") is { } claim ? Key(claim.Value, selector) : null, nativeOptions);
    NativeSessionRecoveryEndpointConfiguration.MapOperations(app, "/native-sessions", nativeJournal, "checkpoint-operator",
        context => context.User.FindAll("operator-scope").Select(claim => claim.Value).ToHashSet(StringComparer.Ordinal),
        context => context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, Key);
    app.MapGet("/__test/native-stage", () => Results.Json(new { stage = nativeGate.Stage, renewalFailed = nativeGate.RenewalFailed, cleanupCompleted = nativeGate.CleanupCompleted, counts = nativeGate.Counts }));
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
    app.MapPost("/__test/maintain-native", async () => Results.Json(new { count = await nativeJournal.MaintainAsync() }));
    app.MapGet("/__test/native-recovery-state", async (HttpContext context, string threadId) =>
    {
        if (context.User.FindFirst("scope")?.Value is not { } scope) return Results.Unauthorized();
        if (threadId.Length > 1024) return Results.BadRequest();
        await using var command = source!.CreateCommand($"""
            SELECT jsonb_build_object(
              'session',(SELECT to_jsonb(s) FROM "{schema}".native_sessions s WHERE id=@id),
              'batches',COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY batch_id) FROM "{schema}".native_approval_batches b WHERE session_id=@id),'[]'::jsonb),
              'members',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY request_id) FROM "{schema}".native_approvals a WHERE session_id=@id),'[]'::jsonb),
              'invocations',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY call_id) FROM "{schema}".native_invocations c WHERE session_id=@id),'[]'::jsonb),
              'effects',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM "{schema}".fixture_native_approval_effects e WHERE session_id=@id),'[]'::jsonb))::text
            """);
        command.Parameters.AddWithValue("id", Key(scope, threadId).Id);
        return Results.Content((string)(await command.ExecuteScalarAsync())!, "application/json");
    }).RequireAuthorization("recovery");
    if (nativeApprovals)
    {
        app.MapPost("/__test/expire-native-payload", async () =>
        {
            await using var connection = await source!.OpenConnectionAsync();
            await using var transaction = await connection.BeginTransactionAsync();
            await using var command = new NpgsqlCommand($"""
                UPDATE "{schema}".native_approvals SET expires_at=clock_timestamp()-interval '3 seconds';
                UPDATE "{schema}".native_approval_batches SET expires_at=clock_timestamp()-interval '2 seconds';
                UPDATE "{schema}".native_sessions SET expires_at=clock_timestamp()-interval '1 second';
                """, connection, transaction);
            await command.ExecuteNonQueryAsync();
            await transaction.CommitAsync();
            return Results.Ok();
        });
        app.MapGet("/__test/native-approval-state", async (HttpContext context, string threadId) =>
        {
            if (context.User.FindFirst("scope")?.Value is not { } scope) return Results.Unauthorized();
            if (threadId.Length > 1024) return Results.BadRequest();
            await using var command = source!.CreateCommand($"""
                SELECT jsonb_build_object(
                  'schemaVersion',(SELECT version FROM "{schema}".native_metadata WHERE id=1),
                  'session',(SELECT jsonb_build_object('id',id,'state',state,'generation',generation,'revision',revision,'claim_revision',claim_revision,'payloadNull',payload IS NULL,'expires_at',expires_at) FROM "{schema}".native_sessions WHERE id=@id),
                  'batches',COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY batch_id) FROM (SELECT batch_id,state,published_revision,member_count,member_digest,admitted_generation,admitted_revision,expires_at FROM "{schema}".native_approval_batches WHERE session_id=@id LIMIT 100) b),'[]'::jsonb),
                  'members',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY request_id) FROM (SELECT request_id,call_id,batch_id,kind,state,decision,captured_generation,admitted_generation,admitted_revision,result_digest IS NOT NULL AS "resultDigestPresent",private_descriptor IS NULL AS "privateDescriptorNull",expires_at FROM "{schema}".native_approvals WHERE session_id=@id LIMIT 100) a),'[]'::jsonb),
                  'invocations',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY call_id) FROM (SELECT call_id,name,version,state,captured_generation,dispatch_generation,descriptor IS NULL AS "descriptorNull" FROM "{schema}".native_invocations WHERE session_id=@id LIMIT 100) c),'[]'::jsonb),
                  'effects',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM (SELECT id,session_id,call_id,request_id,batch_id,admitted_generation,admitted_revision,code FROM "{schema}".fixture_native_approval_effects WHERE session_id=@id ORDER BY id LIMIT 100) e),'[]'::jsonb))::text
                """);
            command.Parameters.AddWithValue("id", Key(scope, threadId).Id);
            return Results.Content((string)(await command.ExecuteScalarAsync())!, "application/json");
        }).RequireAuthorization("recovery");
    }
    var observedAgent = (AIAgent)FixtureIntegrationReflection.Call(null, typeof(NativeSessionAgentFactory), "CreateObservedForTests", native, nativeName, new[] { nativeFunction }, nativeCatalog, accessor, (Action<string>)nativeGate.Observe)!;
    NativeSessionEndpointConfiguration.Map(app, "/run", observedAgent, "recovery");
}
else HashbrownEndpointConfiguration.Map(app, "/run",
    client.AsAIAgent(name: "Hashbrown", tools: [AIFunctionFactory.Create(tools.LookupAirport, "lookupAirport")]),
    pending, Scope, new HashSet<string>(["lookupAirport"], StringComparer.Ordinal));
await app.RunAsync();
