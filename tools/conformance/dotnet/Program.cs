using Hashbrown.Conformance.Integration;
using Microsoft.Extensions.AI;
using Hashbrown.Conformance.Testing;

var builder = WebApplication.CreateBuilder(args);
HashbrownEndpointConfiguration.Configure(builder.Services);
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins("http://127.0.0.1:4431", "http://127.0.0.1:4432")
    .WithMethods("POST", "OPTIONS").AllowAnyHeader()));
var app = builder.Build();
app.UseCors();
app.Use(async (context, next) =>
{
    // This loopback test executable supplies fixture identities; recipes use application authentication.
    var identity = context.Request.Headers["X-Fixture-Principal"].FirstOrDefault() ?? "local-fixture";
    context.User = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity(
        [new(System.Security.Claims.ClaimTypes.NameIdentifier, identity)], "fixture"));
    await next(context);
});
app.MapGet("/health", () => Results.Ok());
var clock = new FixtureClock();
var pending = new PendingInterruptStore(clock);
app.MapPost("/__test/advance-clock", () => { clock.Advance(); return Results.Ok(); });
var accessor = app.Services.GetRequiredService<IHttpContextAccessor>();
string Scope() => accessor.HttpContext?.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "local-fixture";
var tools = new FixtureTools(builder.Configuration["Workflow"] ?? "");
app.MapPost("/__test/release-checkpoint", () => { tools.Release(); return Results.Ok(); });
var client = new InterruptWorkflowClient(new HashbrownRequestClient(ProviderFactory.Create(builder.Configuration)),
    pending, input => builder.Configuration["Workflow"]?.StartsWith("confirm", StringComparison.Ordinal) == true ||
        builder.Configuration["Workflow"] == "after-tool" && input.Messages.Any(message => message.Role == "tool")
        ? tools.Checkpoint("PDX") : null, Scope);
app.MapGet("/__test/counters", () => Results.Ok(new { server = tools.Server, @protected = tools.Protected, protectedCode = tools.ProtectedCode, checkpointStage = tools.CheckpointStage, checkpointCancelled = tools.CheckpointCancelled }));
HashbrownEndpointConfiguration.Map(app, "/run",
    client.AsAIAgent(name: "Hashbrown", tools: [AIFunctionFactory.Create(tools.LookupAirport, "lookupAirport")]),
    pending, Scope, new HashSet<string>(["lookupAirport"], StringComparer.Ordinal));
await app.RunAsync();
