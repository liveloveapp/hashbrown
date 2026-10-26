using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Hashbrown.Conformance.Integration;

/// <summary>Optional application-owned idle maintenance. Start and stop with the host; no model or effect work is dispatched.</summary>
public sealed class PostgresInterruptCleanupService : BackgroundService
{
    private readonly PostgresInterruptStore _store;
    private readonly ILogger<PostgresInterruptCleanupService> _logger;
    private readonly TimeSpan _interval;
    private readonly TimeSpan _passTimeout;

    /// <summary>Configures a cadence and bounded pass timeout. Each pass handles at most CleanupBatchSize rows per category.</summary>
    public PostgresInterruptCleanupService(PostgresInterruptStore store, ILogger<PostgresInterruptCleanupService> logger, TimeSpan interval, TimeSpan passTimeout)
    {
        ArgumentNullException.ThrowIfNull(store);
        ArgumentNullException.ThrowIfNull(logger);
        if (interval <= TimeSpan.Zero || interval > TimeSpan.FromDays(1)) throw new ArgumentOutOfRangeException(nameof(interval));
        if (passTimeout <= TimeSpan.Zero || passTimeout > TimeSpan.FromMinutes(5)) throw new ArgumentOutOfRangeException(nameof(passTimeout));
        _store = store;
        _logger = logger;
        _interval = interval;
        _passTimeout = passTimeout;
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            using var pass = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            pass.CancelAfter(_passTimeout);
            try
            {
                var result = await _store.CleanupAsync(pass.Token);
                _logger.LogInformation(new EventId(7100, "CheckpointCleanupCompleted"), "Checkpoint cleanup committed: {MetadataRemoved} metadata, {TranscriptsPurged} transcripts, {AuditsRemoved} audits.", result.MetadataRemoved, result.TranscriptsPurged, result.AuditsRemoved);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (OperationCanceledException) { _logger.LogWarning(new EventId(7101, "CheckpointCleanupTimeout"), "Checkpoint cleanup exceeded its pass deadline; a later scheduled pass will retry maintenance."); }
            catch (Exception) { _logger.LogWarning(new EventId(7102, "CheckpointCleanupFailed"), "Checkpoint cleanup failed; a later scheduled pass will retry maintenance."); }
            try { await Task.Delay(_interval, stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
        }
    }
}
