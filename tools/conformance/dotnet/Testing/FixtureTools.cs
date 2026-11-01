using System.ComponentModel;
using System.Text.Json;
using Hashbrown.AspNetCore;
using Npgsql;

namespace Hashbrown.Conformance.Testing;

/// <summary>Deterministic server effects used only by the integration fixture.</summary>
public sealed class FixtureTools(string workflow, NpgsqlDataSource? source = null, string schema = "hashbrown", FixtureNativeGate? nativeGate = null, Func<HttpContext?>? nativeContext = null)
{
    /// <summary>Optional passive candidate-only sink; normal fixture compositions perform no handler snapshot work.</summary>
    internal FixtureCandidateResultEvidence? CandidateEvidence { get; init; }
    private int _server;
    private int _protected;
    private readonly TaskCompletionSource _release = new(TaskCreationOptions.RunContinuationsAsynchronously);
    /// <summary>Observed fixture checkpoint stage.</summary>
    public string CheckpointStage { get; private set; } = "pending";
    /// <summary>Whether cancellation reached the protected checkpoint.</summary>
    public bool CheckpointCancelled { get; private set; }
    /// <summary>Number of protected effects in this process.</summary>
    public int Protected => Volatile.Read(ref _protected);
    /// <summary>Server-owned parameter used by the protected effect.</summary>
    public string? ProtectedCode { get; private set; }
    /// <summary>Releases the deterministic cancellation gate.</summary>
    public void Release() => _release.TrySetResult();
    /// <summary>Selects immutable parameters on the server before interruption.</summary>
    public WorkflowCheckpoint Checkpoint(string code) => new("confirm-airport", 1, JsonSerializer.SerializeToElement(new { code }));
    /// <summary>Reconstructs this deployment's versioned operation registry.</summary>
    public WorkflowOperationRegistry Registry(int version = 1) => new([new("confirm-airport", version, parameters =>
        parameters.ValueKind == JsonValueKind.Object && parameters.EnumerateObject().Count() == 1 &&
        parameters.TryGetProperty("code", out var code) && code.ValueKind == JsonValueKind.String && code.GetString()?.Length == 3,
        async (_, cancellationToken) =>
        {
            if (workflow is "confirm-before" or "confirm-stale" or "confirm-expired-prepare-failure")
            {
                CheckpointStage = "before";
                await WaitAsync(workflow == "confirm-stale" ? CancellationToken.None : cancellationToken);
            }
            if (workflow is "confirm-prepare-failure" or "confirm-expired-prepare-failure")
                throw new InvalidOperationException("Fixture pure preparation failure.");
        }, async (parameters, effectId, cancellationToken) =>
        {
            ProtectedCode = parameters.GetProperty("code").GetString();
            Interlocked.Increment(ref _protected);
            if (source is not null)
            {
                await using var command = source.CreateCommand($"INSERT INTO \"{schema}\".fixture_effects(effect_id,code) VALUES(@effect,@code)");
                command.Parameters.AddWithValue("effect", effectId);
                command.Parameters.AddWithValue("code", ProtectedCode!);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            CheckpointStage = "after";
            if (workflow == "confirm-after") await WaitAsync(cancellationToken);
        })]);

    /// <summary>Pauses only after the authoritative store committed the marker.</summary>
    public async ValueTask AfterMarkerAsync(CancellationToken cancellationToken)
    {
        if (workflow != "confirm-marker") return;
        CheckpointStage = "marker";
        await WaitAsync(cancellationToken);
    }

    private async Task WaitAsync(CancellationToken cancellationToken)
    {
        try { await _release.Task.WaitAsync(cancellationToken); }
        catch (OperationCanceledException) { CheckpointCancelled = true; throw; }
    }

    /// <summary>Executes a real native fixture effect in PostgreSQL without a uniqueness mask.</summary>
    [Description("Look up an airport by its IATA code.")]
    public async Task<object> LookupNativeAirport(string code, CancellationToken cancellationToken = default)
    {
        if (source is null) throw new InvalidOperationException("Native fixture requires PostgreSQL.");
        await using (var command = source.CreateCommand($"INSERT INTO \"{schema}\".fixture_native_effects(code) VALUES(@code)"))
        {
            command.Parameters.AddWithValue("code", code);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        Interlocked.Increment(ref _server);
        if (nativeGate is not null) await nativeGate.ReachAsync("effect-persisted", cancellationToken);
        return new { code, name = "Portland International Airport" };
    }

    /// <summary>Appends every genuine protected executor entry without a uniqueness or idempotency mask.</summary>
    [Description("Look up an airport by its IATA code.")]
    public async Task<object> LookupProtectedNativeAirport(string code, CancellationToken cancellationToken = default)
    {
        if (source is null) throw new InvalidOperationException("Native fixture requires PostgreSQL.");
        var contextType = FixtureIntegrationReflection.Type("NativeSessionContext");
        var context = FixtureIntegrationReflection.Call(null, contextType, "Get", nativeContext?.Invoke()) ?? throw new InvalidOperationException("Owned native fixture context required.");
        var evidence = FixtureIntegrationReflection.Read<NativeApprovalEvidence?>(context, "ApprovalEvidence") ?? throw new InvalidOperationException("Admitted native fixture evidence required.");
        // Fixture scripts use distinct codes, correlating an actual executor to an immutable trusted captured call.
        var descriptor = evidence.Batch.Batch.ProtectedRequests.Single(item => item.Call.Name == "lookupAirport" && item.Call.Arguments.GetProperty("code").GetString() == code);
        await using (var command = source.CreateCommand($"INSERT INTO \"{schema}\".fixture_native_approval_effects(session_id,call_id,request_id,batch_id,admitted_generation,admitted_revision,code) VALUES(@session,@call,@request,@batch,@generation,@revision,@code)"))
        {
            command.Parameters.AddWithValue("session", FixtureIntegrationReflection.Read<NativeSessionLease>(context, "Lease").Key.Id);
            command.Parameters.AddWithValue("call", descriptor.Call.Id);
            command.Parameters.AddWithValue("request", descriptor.RequestId);
            command.Parameters.AddWithValue("batch", evidence.Batch.Batch.BatchId);
            command.Parameters.AddWithValue("generation", evidence.AdmittedGeneration!.Value);
            command.Parameters.AddWithValue("revision", evidence.AdmittedRevision!.Value);
            command.Parameters.AddWithValue("code", code);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        Interlocked.Increment(ref _protected);
        if (nativeGate is not null) await nativeGate.ReachAsync("effect-persisted", cancellationToken);
        var result = new { code, name = "Portland International Airport" };
        CandidateEvidence?.Handler(context, descriptor, evidence, () => (result.GetType().FullName!, JsonSerializer.SerializeToElement(result)));
        return result;
    }

    /// <summary>Number of actual server tool executions.</summary>
    public int Server => Volatile.Read(ref _server);
    /// <summary>Looks up a fixture airport through a real registered .NET function.</summary>
    [Description("Look up an airport by its IATA code.")]
    public object LookupAirport(string code)
    {
        Interlocked.Increment(ref _server);
        return new { code, name = "Portland International Airport" };
    }
}
