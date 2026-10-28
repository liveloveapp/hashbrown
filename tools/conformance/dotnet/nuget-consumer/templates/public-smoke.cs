using System.Net.Http.Json;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using System.Runtime.CompilerServices;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using Hashbrown.AspNetCore;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;

static void Check(bool value, string message) { if (!value) throw new Exception(message); }
var builder = WebApplication.CreateEmptyBuilder(new() { EnvironmentName = "Production", ContentRootPath = AppContext.BaseDirectory });
builder.WebHost.UseKestrel().UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Services.AddRouting();
builder.Services.AddAuthentication("consumer").AddScheme<AuthenticationSchemeOptions, ConsumerAuthentication>("consumer", _ => { });
builder.Services.AddAuthorization(options => options.AddPolicy("consumer", policy => policy.RequireAuthenticatedUser()));
HashbrownEndpointConfiguration.Configure(builder.Services);
var effects = 0;
var serverTools = 0;
var registry = new WorkflowOperationRegistry([new("protected", 1, value => value.GetProperty("code").GetString() == "PDX",
    (_, _) => ValueTask.CompletedTask, (_, _, _) => { effects++; return ValueTask.CompletedTask; })]);
var store = new PendingInterruptStore(TimeProvider.System, registry);
await using var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
var accessor = app.Services.GetRequiredService<IHttpContextAccessor>();
var model = new ConsumerModel();
var client = new InterruptWorkflowClient(new HashbrownRequestClient(model), store, registry,
    input => input.ThreadId.StartsWith("confirm", StringComparison.Ordinal) ? new WorkflowCheckpoint("protected", 1, JsonSerializer.SerializeToElement(new { code = "PDX" })) : null,
    () => "consumer", () => HashbrownEndpointConfiguration.GetClaim(accessor.HttpContext));
var tool = AIFunctionFactory.Create(() => { serverTools++; return "PDX"; }, "lookupAirport");
HashbrownEndpointConfiguration.Map(app, "/run", client.AsAIAgent(name: "Consumer", tools: [tool]), store, () => "consumer", new HashSet<string>(["lookupAirport"]));
RecoveryEndpointConfiguration.MapRecovery(app, "/threads/{threadId}/recovery", store, "consumer", context => context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
await app.StartAsync();
using var http = new HttpClient { BaseAddress = new Uri(app.Urls.Single()), Timeout = TimeSpan.FromSeconds(15) };
http.DefaultRequestHeaders.Authorization = new("Bearer", "consumer");
JsonObject Input(string thread, string content = "hello") => new()
{
    ["threadId"] = thread, ["runId"] = Guid.NewGuid().ToString("N"),
    ["messages"] = new JsonArray(new JsonObject { ["id"] = "user", ["role"] = "user", ["content"] = content }),
    ["tools"] = new JsonArray(), ["context"] = new JsonArray(), ["state"] = new JsonObject()
};
async Task<(int Status, string Body, JsonObject[] Events)> Run(JsonObject input)
{
    using var response = await http.PostAsJsonAsync("/run", input);
    var body = await response.Content.ReadAsStringAsync();
    var events = body.Split('\n').Where(line => line.StartsWith("data: ", StringComparison.Ordinal)).Select(line => JsonNode.Parse(line[6..])!.AsObject()).ToArray();
    if (response.IsSuccessStatusCode) Check(events.LastOrDefault()?["type"]?.GetValue<string>() == "RUN_FINISHED" && !body.Contains("RUN_ERROR", StringComparison.Ordinal), "Stream failed: " + body);
    return ((int)response.StatusCode, body, events);
}
var normal = await Run(Input("normal"));
Check(normal.Status == 200 && normal.Body.Contains("consumer answer", StringComparison.Ordinal), "Normal streaming missing");
var structuredInput = Input("structured");
structuredInput["forwardedProps"] = JsonNode.Parse("""{"hashbrown":{"responseSchema":{"type":"object","additionalProperties":false,"required":["answer"],"properties":{"answer":{"type":"string"}}}}}""");
var structured = await Run(structuredInput);
Check(structured.Status == 200 && model.Structured == 1 && structured.Body.Contains("answer", StringComparison.Ordinal), "Structured streaming missing");
var browserInput = Input("browser", "browser");
browserInput["tools"] = JsonNode.Parse("""[{"name":"getWeather","description":"Consumer browser tool","parameters":{"type":"object","properties":{},"additionalProperties":false}}]""");
var browser = await Run(browserInput);
Check(browser.Body.Contains("TOOL_CALL", StringComparison.Ordinal) && browser.Body.Contains("browser-call", StringComparison.Ordinal), "Browser tool request missing");
browserInput["runId"] = Guid.NewGuid().ToString("N");
browserInput["messages"]!.AsArray().Add(JsonNode.Parse("""{"id":"assistant","role":"assistant","toolCalls":[{"id":"browser-call","type":"function","function":{"name":"getWeather","arguments":"{}"}}]}"""));
browserInput["messages"]!.AsArray().Add(JsonNode.Parse("""{"id":"tool-result","role":"tool","toolCallId":"browser-call","content":"21 C"}"""));
var continuation = await Run(browserInput);
Check(continuation.Status == 200 && model.BrowserResults == 1, "Browser continuation was not consumed");
var server = await Run(Input("server", "server"));
Check(server.Status == 200 && serverTools == 1, "Consumer-owned server tool was not invoked exactly once");
foreach (var decision in new[] { "approve", "decline", "cancel" })
{
    var input = Input("confirm-" + decision);
    var interrupted = await Run(input);
    var interrupts = interrupted.Events.Last()["outcome"]?["interrupts"]?.AsArray();
    Check(interrupts?.Count == 2, "Confirmation batch missing: " + interrupted.Body);
    var calls = model.Calls;
    using var recoveryResponse = await http.PostAsJsonAsync("/threads/confirm-" + decision + "/recovery", new { tools = Array.Empty<object>() });
    var recovery = await recoveryResponse.Content.ReadAsStringAsync();
    Check(recoveryResponse.IsSuccessStatusCode && recoveryResponse.Headers.CacheControl?.NoStore == true && model.Calls == calls && !recovery.Contains("\"code\":\"PDX\"", StringComparison.Ordinal), "Read-only safe recovery failed (" + (int)recoveryResponse.StatusCode + "): " + recovery);
    http.DefaultRequestHeaders.Authorization = null;
    using var anonymousRecovery = await http.PostAsJsonAsync("/threads/confirm-" + decision + "/recovery", new { tools = Array.Empty<object>() });
    Check(anonymousRecovery.StatusCode == System.Net.HttpStatusCode.Unauthorized && model.Calls == calls, "Recovery authentication failed closed");
    http.DefaultRequestHeaders.Authorization = new("Bearer", "consumer");
    input["runId"] = Guid.NewGuid().ToString("N");
    input["resume"] = new JsonArray(interrupts!.Select(item => (JsonNode)new JsonObject
    {
        ["interruptId"] = item!["id"]!.GetValue<string>(), ["status"] = decision == "cancel" ? "cancelled" : "resolved",
        ["payload"] = decision == "cancel" ? null : new JsonObject { ["approved"] = decision == "approve" }
    }).ToArray());
    var resumed = await Run(input);
    Check(resumed.Status == 200 && effects == 1, "Confirmation effects must execute only for approval");
    var callsBeforeReplay = model.Calls;
    var replay = await Run(input);
    Check(replay.Status == 409 && effects == 1 && model.Calls == callsBeforeReplay, "Stale decision must fail before effects");
}
await app.StopAsync();
var assembly = typeof(HashbrownEndpointConfiguration).Assembly;
Console.WriteLine(JsonSerializer.Serialize(new
{
    identity = assembly.FullName, location = assembly.Location,
    sha256 = Convert.ToHexStringLower(SHA256.HashData(await File.ReadAllBytesAsync(assembly.Location))),
    normal = true, structured = model.Structured, browserContinuation = model.BrowserResults,
    approved = true, declined = true, cancelled = true, staleRejected = true, safeRecovery = true,
    effects, serverTools
}));

sealed class ConsumerModel : IChatClient
{
    public int Calls { get; private set; }
    public int Structured { get; private set; }
    public int BrowserResults { get; private set; }
    public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Calls++;
        var history = messages.ToArray();
        var results = history.SelectMany(message => message.Contents).OfType<FunctionResultContent>().ToArray();
        AIContent content = new TextContent("consumer answer");
        if (options?.ResponseFormat is ChatResponseFormatJson) { Structured++; content = new TextContent("{\"answer\":\"consumer answer\"}"); }
        else if (results.Any(result => result.CallId == "browser-call")) BrowserResults++;
        else if (history.Any(message => message.Text == "browser")) content = new FunctionCallContent("browser-call", "getWeather", new Dictionary<string, object?>());
        else if (history.Any(message => message.Text == "server") && results.Length == 0) content = new FunctionCallContent("server-call", "lookupAirport", new Dictionary<string, object?>());
        return Task.FromResult(new ChatResponse(new ChatMessage(ChatRole.Assistant, [content]) { MessageId = "consumer-message-" + Calls }) { ResponseId = "consumer-response-" + Calls });
    }
    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    { foreach (var update in (await GetResponseAsync(messages, options, cancellationToken)).ToChatResponseUpdates()) yield return update; }
    public object? GetService(Type type, object? key = null) => null;
    public void Dispose() { }
}

sealed class ConsumerAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync() => Task.FromResult(Request.Headers.Authorization == "Bearer consumer"
        ? AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "consumer")], Scheme.Name)), Scheme.Name))
        : AuthenticateResult.NoResult());
}
