using System.ComponentModel;
using Hashbrown.Conformance.Integration;

namespace Hashbrown.Conformance.Testing;

/// <summary>Deterministic server effects used only by the integration fixture.</summary>
public sealed class FixtureTools(string workflow)
{
    private int _server;
    private int _protected;
    private readonly TaskCompletionSource _release = new(TaskCreationOptions.RunContinuationsAsynchronously);
    /// <summary>Observed fixture checkpoint stage.</summary>
    public string CheckpointStage { get; private set; } = "pending";
    /// <summary>Whether cancellation reached the protected checkpoint.</summary>
    public bool CheckpointCancelled { get; private set; }
    /// <summary>Number of protected effects.</summary>
    public int Protected => Volatile.Read(ref _protected);
    /// <summary>Server-owned parameter used by the protected effect.</summary>
    public string? ProtectedCode { get; private set; }
    /// <summary>Releases the deterministic cancellation gate.</summary>
    public void Release() => _release.TrySetResult();
    /// <summary>Selects an operation and captures its parameters on the server before interruption.</summary>
    public WorkflowCheckpoint Checkpoint(string code) => new("confirm-airport", async cancellationToken =>
    {
        if (workflow == "confirm-before")
        {
            CheckpointStage = "before";
            await WaitAsync(cancellationToken);
        }
    }, async cancellationToken =>
    {
        ProtectedCode = code;
        Interlocked.Increment(ref _protected);
        CheckpointStage = "after";
        if (workflow == "confirm-after") await WaitAsync(cancellationToken);
    });

    private async Task WaitAsync(CancellationToken cancellationToken)
    {
        try { await _release.Task.WaitAsync(cancellationToken); }
        catch (OperationCanceledException) { CheckpointCancelled = true; throw; }
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
