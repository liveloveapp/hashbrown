using Hashbrown.AspNetCore;

namespace Hashbrown.Starter;

/// <summary>One awaited bounded journal pass per timer tick; never dispatches models or tools.</summary>
internal sealed class NativeMaintenanceRunner(Func<CancellationToken, ValueTask<int>> pass, TimeProvider clock, TimeSpan cadence, TimeSpan deadline, Action<string, int?> observe)
{
  /// <summary>Observes every completed, failed or timed out pass and propagates host shutdown.</summary>
  internal async Task RunAsync(CancellationToken stoppingToken)
  {
    using var timer = new PeriodicTimer(cadence, clock);
    try
    {
      while (await timer.WaitForNextTickAsync(stoppingToken))
      {
        using var timeout = new CancellationTokenSource(deadline, clock);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken, timeout.Token);
        try { var changed = await pass(linked.Token); observe("completed", changed); }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        catch (OperationCanceledException) when (timeout.IsCancellationRequested) { observe("timeout", null); }
        catch (Exception) { observe("failed", null); }
      }
    }
    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
  }
}

/// <summary>Owns the exact journal/catalog/options registration used by endpoint, recovery and maintenance.</summary>
internal sealed record StarterNativeRegistration(INativeSessionJournal Journal, NativeToolCatalog Catalog, NativeSessionOptions Options, string AgentName)
{
  /// <summary>Resolves authority only from the authenticated fixed application scope.</summary>
  internal static string? Scope(HttpContext context) => context.User.Identity?.IsAuthenticated == true ? context.User.FindFirst("hashbrown_scope")?.Value : null;
  /// <summary>Uses the same native isolation partition as the endpoint store.</summary>
  internal NativeSessionKey? Key(HttpContext context, string selector) => Scope(context) is { } scope ? new(AgentName, scope, selector, new Dictionary<string, string> { ["isolation"] = scope }) : null;
}

/// <summary>Schedules every registered compatible journal once per tick with a pass deadline.</summary>
internal sealed class NativeMaintenanceService(IEnumerable<StarterNativeRegistration> registrations, ILogger<NativeMaintenanceService> logger) : BackgroundService
{
  /// <inheritdoc />
  protected override Task ExecuteAsync(CancellationToken stoppingToken) => Task.WhenAll(registrations.Select(registration => new NativeMaintenanceRunner(registration.Journal.MaintainAsync, TimeProvider.System, TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(5), (kind, count) =>
  {
    if (kind == "completed") logger.LogInformation("Native maintenance {Outcome}, sessions {Count}.", kind, count);
    else logger.LogWarning("Native maintenance {Outcome}.", kind);
  }).RunAsync(stoppingToken)));
}
