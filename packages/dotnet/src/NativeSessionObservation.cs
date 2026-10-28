using System.Text.Json;

namespace Hashbrown.AspNetCore;

/// <summary>Internal passive immutable diagnostics for the guarded candidate; normal compositions provide no observer.</summary>
internal static class NativeSessionObservation
{
  /// <summary>Records no native contents, mutable graph, lease or authority; diagnostic failures cannot alter execution.</summary>
  internal static void Record(Action<string>? observer, string stage, string? value = null)
  {
    if (observer is null) return;
    try { observer(JsonSerializer.Serialize(new { stage, value })); }
    catch (Exception) { /* Passive diagnostics cannot change native execution or ownership. */ }
  }
}
