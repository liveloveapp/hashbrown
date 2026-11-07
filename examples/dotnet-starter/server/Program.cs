using System.ComponentModel;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using Hashbrown.AspNetCore;
using Hashbrown.Starter;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.FileProviders;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
var origin = builder.Configuration["LocalOrigin"] ?? "http://127.0.0.1:5190";
DevelopmentIdentityPolicy.ValidateStartup(builder.Environment.EnvironmentName, builder.Configuration.GetValue<bool>("DevelopmentIdentityEnabled"), origin);
builder.WebHost.UseUrls(origin);
StarterConfiguration.Configure(builder.Configuration);
var connection = builder.Configuration.GetConnectionString("NativeJournal") ?? throw new InvalidOperationException("Set ConnectionStrings__NativeJournal to a PostgreSQL connection string.");
var staticRoot = Path.GetFullPath(builder.Configuration["ClientRoot"] ?? throw new InvalidOperationException("Set ClientRoot to the built React or Angular client directory."));
if (!File.Exists(Path.Combine(staticRoot, "index.html"))) throw new InvalidOperationException("ClientRoot must contain a built index.html.");

await using var source = NpgsqlDataSource.Create(connection);
AIFunction airport = new ApprovalRequiredAIFunction(AIFunctionFactory.Create(([Description("Three-letter IATA airport code, for example SFO.")] string code) => LookupAirport(code), "lookupAirport", "Read airport information from the application's trusted catalog. Requires explicit user approval."));
var catalog = new NativeToolCatalog([new("lookupAirport", 1, airport.JsonSchema, RequiresConfirmation: true)]);
var options = new NativeSessionOptions { MaintenanceBatch = 100 };
var journal = new PostgresNativeSessionJournal(source, catalog, ServerConfigurationIdentity.Create(builder.Configuration), builder.Configuration["NativeSchema"] ?? "hashbrown_starter", options);
var registration = new StarterNativeRegistration(journal, catalog, options, "HashbrownStarter");
builder.Services.AddSingleton(registration);
builder.Services.AddHostedService<NativeMaintenanceService>();
builder.Services.AddAuthentication("starter-development").AddScheme<AuthenticationSchemeOptions, DevelopmentAuthenticationHandler>("starter-development", _ => { });
builder.Services.AddAuthorization(authorization => authorization.AddPolicy("starter-user", policy => policy.RequireAuthenticatedUser()));
NativeSessionEndpointConfiguration.Configure(builder.Services, registration.AgentName, registration.Journal, registration.Catalog, StarterNativeRegistration.Scope, registration.Options);

var app = builder.Build();
// Initialize before listening/readiness. An unavailable durable journal must never fall back to memory.
await registration.Journal.InitializeAsync(app.Lifetime.ApplicationStopping);
app.UseAuthentication();
app.Use(async (context, next) =>
{
  if (context.User.Identity?.IsAuthenticated != true) { context.Response.StatusCode = 401; return; }
  context.Response.Headers.CacheControl = "no-store";
  context.Response.Headers["X-Content-Type-Options"] = "nosniff";
  await next(context);
});
app.UseAuthorization();
var accessor = app.Services.GetRequiredService<IHttpContextAccessor>();
using var client = ProviderFactory.Create(builder.Configuration);
var agent = NativeSessionAgentFactory.Create(client, registration.AgentName, [airport], registration.Catalog, accessor);
NativeSessionEndpointConfiguration.Map(app, "/run", agent, "starter-user");
NativeSessionRecoveryEndpointConfiguration.MapRecovery(app, "/threads/{threadId}/recovery", registration.Journal, "starter-user", registration.Key, registration.Options);
app.MapGet("/health", () => Results.Ok(new { status = "ready" })).RequireAuthorization("starter-user");
var files = new PhysicalFileProvider(staticRoot);
app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
app.UseStaticFiles(new StaticFileOptions { FileProvider = files });
var sdk = typeof(ProviderFactory).Assembly;
app.Logger.LogInformation("Loaded SDK witness {Witness}", JsonSerializer.Serialize(new { assemblyName = sdk.GetName().Name, informationalVersion = sdk.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion, loadedDllSha256 = Convert.ToHexString(SHA256.HashData(await File.ReadAllBytesAsync(sdk.Location))).ToLowerInvariant(), processId = Environment.ProcessId }));
await app.RunAsync();

static object LookupAirport(string code) => code.ToUpperInvariant() switch
{
  "SFO" => new { code = "SFO", name = "San Francisco International Airport", city = "San Francisco" },
  "SEA" => new { code = "SEA", name = "Seattle-Tacoma International Airport", city = "Seattle" },
  "JFK" => new { code = "JFK", name = "John F. Kennedy International Airport", city = "New York" },
  _ => new { code = code.ToUpperInvariant(), name = "Unknown airport", city = "Unknown" }
};
