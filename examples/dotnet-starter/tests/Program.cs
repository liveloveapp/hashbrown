using System.Data.Common;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Runtime.Loader;
using System.Security.Claims;
using static Tests;

if (args.Length is not (1 or 4)) throw new ArgumentException("Pass the actual built Starter.dll path.");
var assemblyPath = Path.GetFullPath(args[0]);
var resolver = new AssemblyDependencyResolver(assemblyPath);
AssemblyLoadContext.Default.Resolving += (_, name) => resolver.ResolveAssemblyToPath(name) is { } path ? AssemblyLoadContext.Default.LoadFromAssemblyPath(path) : null;
var assembly = AssemblyLoadContext.Default.LoadFromAssemblyPath(assemblyPath);

if (args.Length == 4)
{
  if (args[1] != "database" || args[2] is not ("inspect" or "cleanup") || !Regex.IsMatch(args[3], "^starter_smoke_[a-f0-9]{24}$")) throw new ArgumentException("Only an explicit owned smoke schema may be inspected or cleaned.");
  var connectionString = Environment.GetEnvironmentVariable("STARTER_SMOKE_DATABASE") ?? throw new InvalidOperationException("Explicit smoke database is required.");
  var connectionType = Assembly.Load(new AssemblyName("Npgsql")).GetType("Npgsql.NpgsqlConnection", throwOnError: true)!;
  await using var connection = (DbConnection)Activator.CreateInstance(connectionType, connectionString)!;
  using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
  await connection.OpenAsync(deadline.Token);
  await using var command = connection.CreateCommand();
  if (args[2] == "cleanup")
  {
    command.CommandText = $"DROP SCHEMA IF EXISTS \"{args[3]}\" CASCADE";
    await command.ExecuteNonQueryAsync(deadline.Token);
    Console.WriteLine(JsonSerializer.Serialize(new { cleaned = args[3] }));
  }
  else
  {
    command.CommandText = $"SELECT count(*) FROM \"{args[3]}\".native_sessions";
    var sessions = Convert.ToInt64(await command.ExecuteScalarAsync(deadline.Token));
    command.CommandText = $"SELECT count(*) FROM \"{args[3]}\".native_invocations WHERE state='Completed'";
    var completed = Convert.ToInt64(await command.ExecuteScalarAsync(deadline.Token));
    command.CommandText = $"SELECT count(*) FROM \"{args[3]}\".native_invocations WHERE state='Started'";
    var dispatching = Convert.ToInt64(await command.ExecuteScalarAsync(deadline.Token));
    Console.WriteLine(JsonSerializer.Serialize(new { sessions, completed, dispatching }));
  }
  return;
}


await test("development identity requires explicit enablement", () =>
{
  var request = Request() with { Enabled = false };

  var principal = Authorize(request);

  Equal<ClaimsPrincipal?>(null, principal);
});

await test("development identity refuses Production requests", () =>
{
  var request = Request() with { Environment = "Production" };

  var principal = Authorize(request);

  Equal<ClaimsPrincipal?>(null, principal);
});

await test("development identity refuses nonloopback remote addresses", () =>
{
  var request = Request() with { Remote = "192.0.2.1" };

  var principal = Authorize(request);

  Equal<ClaimsPrincipal?>(null, principal);
});

await test("development identity accepts IPv4 and IPv6 loopback", () =>
{
  var requests = new[] { Request(), Request() with { Remote = "::1" }, Request() with { Remote = "::ffff:127.0.0.1" } };

  var principals = requests.Select(Authorize).ToArray();

  True(principals.All(principal => principal?.Identity?.IsAuthenticated == true));
});

await test("development identity rejects a hostile Host header", () =>
{
  var request = Request() with { Host = "attacker.invalid:5190" };

  var principal = Authorize(request);

  Equal<ClaimsPrincipal?>(null, principal);
});

await test("development identity rejects a hostile browser Origin", () =>
{
  var request = Request() with { Origin = "https://attacker.invalid" };

  var principal = Authorize(request);

  Equal<ClaimsPrincipal?>(null, principal);
});

await test("development identity rejects opaque browser Origin", () =>
{
  var request = Request() with { Origin = "null" };

  var principal = Authorize(request);

  Equal<ClaimsPrincipal?>(null, principal);
});

await test("unsafe no-Origin requests require explicit application marker", () =>
{
  var request = Request() with { Origin = null, Marker = null };

  var principal = Authorize(request);

  Equal<ClaimsPrincipal?>(null, principal);
});

await test("explicit same-origin CLI requests are accepted", () =>
{
  var request = Request() with { Origin = null };

  var principal = Authorize(request);

  True(principal?.Identity?.IsAuthenticated == true);
});

await test("caller scope headers cannot select authority", () =>
{
  var request = Request() with { Scope = "another-user" };

  var principal = Authorize(request);

  Equal<ClaimsPrincipal?>(null, principal);
});

await test("development principal has server-owned stable identity and scope", () =>
{
  var first = Request();
  var second = Request() with { Remote = "::1" };

  var principals = new[] { Authorize(first)!, Authorize(second)! };

  True(principals.All(principal => principal.FindFirstValue(ClaimTypes.NameIdentifier) == "starter-local-user"));
  True(principals.All(principal => principal.FindFirstValue("hashbrown_scope") == "starter-local-scope"));
});

await test("startup refuses missing production authentication", () =>
{
  var method = Type("DevelopmentIdentityPolicy").GetMethod("ValidateStartup", BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public)!;

  var error = Capture(() => method.Invoke(null, ["Production", true, "http://127.0.0.1:5190"]));

  True(error is InvalidOperationException && error.Message.Contains("authentication", StringComparison.OrdinalIgnoreCase));
});

await test("startup refuses disabled local identity with an actionable error", () =>
{
  var method = Type("DevelopmentIdentityPolicy").GetMethod("ValidateStartup", BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public)!;

  var error = Capture(() => method.Invoke(null, ["Development", false, "http://127.0.0.1:5190"]));

  True(error is InvalidOperationException && error.Message.Contains("Development", StringComparison.Ordinal));
});

await test("startup refuses a nonloopback bound origin", () =>
{
  var method = Type("DevelopmentIdentityPolicy").GetMethod("ValidateStartup", BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public)!;

  var error = Capture(() => method.Invoke(null, ["Development", true, "http://0.0.0.0:5190"]));

  True(error is InvalidOperationException);
});

await test("maintenance waits for a tick and performs exactly one bounded pass", async () =>
{
  var clock = new ManualTimeProvider();
  var calls = 0;
  using var stop = new CancellationTokenSource();
  var runner = RunMaintenance(_ => { Interlocked.Increment(ref calls); return ValueTask.FromResult(100); }, clock, (_, _) => { }, stop.Token);

  Equal(0, calls);
  clock.Advance(TimeSpan.FromSeconds(10));
  await Until(() => calls == 1);
  await Task.Yield();

  Equal(1, calls);
  stop.Cancel();
  await runner.WaitAsync(TimeSpan.FromSeconds(2));
});

await test("maintenance never overlaps passes even when ticks accumulate", async () =>
{
  var clock = new ManualTimeProvider();
  var calls = 0;
  var complete = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
  using var stop = new CancellationTokenSource();
  var runner = RunMaintenance(async token => { Interlocked.Increment(ref calls); return await complete.Task.WaitAsync(token); }, clock, (_, _) => { }, stop.Token, TimeSpan.FromSeconds(40));

  clock.Advance(TimeSpan.FromSeconds(10));
  await Until(() => calls == 1);
  clock.Advance(TimeSpan.FromSeconds(20));
  await Task.Yield();

  Equal(1, calls);
  stop.Cancel();
  await runner.WaitAsync(TimeSpan.FromSeconds(2));
});

await test("host cancellation cancels the active maintenance pass and prevents later work", async () =>
{
  var clock = new ManualTimeProvider();
  var started = false;
  var cancelled = false;
  var calls = 0;
  using var stop = new CancellationTokenSource();
  var runner = RunMaintenance(async token =>
  {
    Interlocked.Increment(ref calls);
    started = true;
    try { await Task.Delay(Timeout.InfiniteTimeSpan, token); }
    catch (OperationCanceledException) { cancelled = token.IsCancellationRequested; throw; }
    return 0;
  }, clock, (_, _) => { }, stop.Token);

  clock.Advance(TimeSpan.FromSeconds(10));
  await Until(() => started);
  stop.Cancel();
  await runner.WaitAsync(TimeSpan.FromSeconds(2));
  clock.Advance(TimeSpan.FromMinutes(1));

  True(cancelled);
  Equal(1, calls);
});

await test("maintenance deadline cancels and observes timeout without private exception content", async () =>
{
  var clock = new ManualTimeProvider();
  var observations = new List<string>();
  var started = false;
  using var stop = new CancellationTokenSource();
  var runner = RunMaintenance(async token => { started = true; await Task.Delay(Timeout.InfiniteTimeSpan, token); return 0; }, clock, (kind, _) => { lock (observations) observations.Add(kind); }, stop.Token);

  clock.Advance(TimeSpan.FromSeconds(10));
  await Until(() => started);
  clock.Advance(TimeSpan.FromSeconds(2));
  await Until(() => { lock (observations) return observations.Contains("timeout"); });

  lock (observations) True(observations.All(item => item is "timeout" or "completed" or "failed"));
  stop.Cancel();
  await runner.WaitAsync(TimeSpan.FromSeconds(2));
});

await test("maintenance observes failure and keeps the next tick usable", async () =>
{
  var clock = new ManualTimeProvider();
  var calls = 0;
  var observations = new List<string>();
  using var stop = new CancellationTokenSource();
  var runner = RunMaintenance(_ => Interlocked.Increment(ref calls) == 1 ? ValueTask.FromException<int>(new InvalidOperationException("secret-tool-argument")) : ValueTask.FromResult(1), clock, (kind, _) => { lock (observations) observations.Add(kind); }, stop.Token);

  clock.Advance(TimeSpan.FromSeconds(10));
  await Until(() => { lock (observations) return observations.Contains("failed"); });
  clock.Advance(TimeSpan.FromSeconds(10));
  await Until(() => calls == 2);

  lock (observations) True(observations.All(item => !item.Contains("secret", StringComparison.Ordinal)));
  stop.Cancel();
  await runner.WaitAsync(TimeSpan.FromSeconds(2));
});

await test("maintenance scheduler depends only on the maintenance operation", () =>
{
  var constructors = Type("NativeMaintenanceRunner").GetConstructors(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);

  var parameters = constructors.Single().GetParameters().Select(parameter => parameter.ParameterType).ToArray();

  Equal(5, parameters.Length);
  True(parameters.All(parameter => parameter == typeof(Func<CancellationToken, ValueTask<int>>) || parameter == typeof(TimeProvider) || parameter == typeof(TimeSpan) || parameter == typeof(Action<string, int?>)));
});

Environment.ExitCode = Tests.Failures == 0 ? 0 : 1;

Type Type(string name) => assembly.GetType("Hashbrown.Starter." + name, throwOnError: true)!;
ClaimsPrincipal? Authorize(IdentityRequest request) => (ClaimsPrincipal?)Type("DevelopmentIdentityPolicy").GetMethod("Authorize", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!.Invoke(null, [request.Environment, request.Enabled, request.BoundOrigin, request.Remote, request.Host, request.Origin, request.Method, request.Marker, request.Scope]);
Task RunMaintenance(Func<CancellationToken, ValueTask<int>> pass, TimeProvider clock, Action<string, int?> observe, CancellationToken stop, TimeSpan? deadline = null)
{
  var instance = Activator.CreateInstance(Type("NativeMaintenanceRunner"), BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance, null, [pass, clock, TimeSpan.FromSeconds(10), deadline ?? TimeSpan.FromSeconds(2), observe], null)!;
  return (Task)instance.GetType().GetMethod("RunAsync", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(instance, [stop])!;
}
static IdentityRequest Request() => new("Development", true, "http://127.0.0.1:5190", "127.0.0.1", "127.0.0.1:5190", "http://127.0.0.1:5190", "POST", "starter", null);
static void True(bool condition) { if (!condition) throw new InvalidOperationException("Expected condition to hold."); }
static void Equal<T>(T expected, T actual) { if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new InvalidOperationException($"Expected {expected}; got {actual}."); }
static Exception? Capture(Action action) { try { action(); return null; } catch (TargetInvocationException exception) { return exception.InnerException; } catch (Exception exception) { return exception; } }
static async Task Until(Func<bool> condition)
{
  using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
  while (!condition()) await Task.Delay(1, timeout.Token);
}
sealed record IdentityRequest(string Environment, bool Enabled, string BoundOrigin, string Remote, string Host, string? Origin, string Method, string? Marker, string? Scope);

sealed class ManualTimeProvider : TimeProvider
{
  private DateTimeOffset _now = DateTimeOffset.UnixEpoch;
  private readonly List<ManualTimer> _timers = [];
  public override DateTimeOffset GetUtcNow() => _now;
  public override long GetTimestamp() => _now.Ticks;
  public override long TimestampFrequency => TimeSpan.TicksPerSecond;
  public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
  {
    var timer = new ManualTimer(this, callback, state);
    lock (_timers) _timers.Add(timer);
    timer.Change(dueTime, period);
    return timer;
  }
  public void Advance(TimeSpan amount)
  {
    _now += amount;
    ManualTimer[] timers;
    lock (_timers) timers = _timers.ToArray();
    foreach (var timer in timers) timer.Fire(_now);
  }
  private sealed class ManualTimer(ManualTimeProvider owner, TimerCallback callback, object? state) : ITimer
  {
    private DateTimeOffset _next = DateTimeOffset.MaxValue;
    private TimeSpan _period = Timeout.InfiniteTimeSpan;
    private bool _disposed;
    public bool Change(TimeSpan dueTime, TimeSpan period)
    {
      if (_disposed) return false;
      _next = dueTime == Timeout.InfiniteTimeSpan ? DateTimeOffset.MaxValue : owner._now + dueTime;
      _period = period;
      return true;
    }
    public void Fire(DateTimeOffset now)
    {
      if (_disposed || _next > now) return;
      _next = _period == Timeout.InfiniteTimeSpan ? DateTimeOffset.MaxValue : now + _period;
      callback(state);
    }
    public void Dispose() => _disposed = true;
    public ValueTask DisposeAsync() { Dispose(); return ValueTask.CompletedTask; }
  }
}

static class Tests
{
  public static int Failures { get; private set; }
  public static Task test(string name, Action action) => test(name, () => { action(); return Task.CompletedTask; });
  public static async Task test(string name, Func<Task> action)
  {
    try { await action(); Console.WriteLine("PASS " + name); }
    catch (Exception exception) { Failures++; Console.Error.WriteLine("FAIL " + name + ": " + exception.GetType().Name + ": " + exception.Message); }
  }
}
