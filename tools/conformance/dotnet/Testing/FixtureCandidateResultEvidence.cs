using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using AGUI.Abstractions;
using Hashbrown.AspNetCore;
using Microsoft.Extensions.AI;

namespace Hashbrown.Conformance.Testing;

/// <summary>Passive bounded candidate-only result witnesses, scoped independently of public and provider projections.</summary>
internal sealed class FixtureCandidateResultEvidence
{
    private const int MaximumRecords = 4096;
    private const int MaximumBytes = 32 * 1024 * 1024;
    private readonly object _sync = new();
    private readonly List<(string Scope, JsonElement Value)> _records = [];
    private readonly string _workerId = $"{Environment.ProcessId}-{Guid.NewGuid():N}";
    private readonly long _started = Stopwatch.GetTimestamp();
    private long _sequence;
    private int _bytes;
    private bool _faulted;

    /// <summary>Reads the finite fixture-only public request cap without changing the library default.</summary>
    internal static int ReadPublicBytes(string? value)
    {
        if (value is null) return 1024 * 1024;
        if (value.Length == 0 || value.Any(character => character is < '0' or > '9') ||
            !int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var bytes) || bytes is < 1024 or > 1048576)
            throw new ArgumentException("NativePublicBytes must be an integer from 1024 through 1048576.");
        return bytes;
    }

    /// <summary>Preserves the actual function metadata, arguments, token and returned object while observing one actual invocation.</summary>
    internal AIFunction Wrap(AIFunction function, Func<HttpContext?> context) => new ObservedFunction(function, this, context);

    /// <summary>Snapshots the actual fixture-constructed handler return before marshalling without replacing its returned object.</summary>
    internal void Handler(object context, NativeApprovalDescriptor descriptor, NativeApprovalEvidence evidence, Func<(string NativeType, JsonElement Value)> snapshot)
    {
        try
        {
            if (FixtureIntegrationReflection.Read<object?>(context, "Recovery") is null) return;
            if (evidence.State != NativeApprovalState.DecisionAdmitted || evidence.Decisions.Single(item => item.RequestId == descriptor.RequestId).Kind != NativeApprovalDecisionKind.Approved) { Fault(); return; }
            var input = FixtureIntegrationReflection.Read<RunAgentInput>(context, "Input");
            var scope = FixtureIntegrationReflection.Read<string>(context, "Scope");
            // The callback owns the known immutable fixture DTO, never an arbitrary application result.
            var observed = snapshot();
            Append(JsonSerializer.SerializeToElement(new
            {
                scope,
                threadId = input.ThreadId,
                runId = input.RunId,
                callId = descriptor.Call.Id,
                requestId = descriptor.RequestId,
                batchId = evidence.Batch.Batch.BatchId,
                admittedGeneration = evidence.AdmittedGeneration,
                admittedRevision = evidence.AdmittedRevision,
                domain = "handler-return",
                nativeType = observed.NativeType,
                jsonKind = observed.Value.ValueKind.ToString(),
                rawJson = observed.Value.GetRawText(),
                isNull = false
            }));
        }
        catch (Exception) { Fault(); }
    }

    /// <summary>Receives only the internal accepted-current-result diagnostic and retains an independent immutable copy.</summary>
    internal void Observe(string observation)
    {
        try
        {
            using var document = JsonDocument.Parse(observation);
            if (document.RootElement.GetProperty("stage").GetString() != "Native.Result.Observed") return;
            using var value = JsonDocument.Parse(document.RootElement.GetProperty("value").GetString()!);
            Append(value.RootElement);
        }
        catch (Exception) { Fault(); }
    }

    /// <summary>Maps read-only authenticated thread-scoped evidence; no endpoint can reset or supply witnesses.</summary>
    internal void Map(WebApplication app)
    {
        app.MapGet("/__test/candidate-native-evidence", (HttpContext context, string threadId) =>
        {
            var scope = context.User.FindFirst("scope")?.Value;
            if (scope is null) return Results.Unauthorized();
            if (threadId.Length is 0 or > 1024) return Results.BadRequest();
            lock (_sync)
            {
                var records = _records.Where(record => record.Scope == scope && record.Value.GetProperty("threadId").GetString() == threadId)
                    .Select(record => record.Value.Clone()).ToArray();
                return Results.Json(new { workerId = _workerId, faulted = _faulted, records });
            }
        }).RequireAuthorization("recovery");
    }

    /// <summary>Observes a real approved post-marshalling return using its existing admitted name/argument binding.</summary>
    private void Invocation(Func<HttpContext?> contextProvider, AIFunction function, AIFunctionArguments arguments, object? result)
    {
        try
        {
            var context = FixtureIntegrationReflection.Call(null, FixtureIntegrationReflection.Type("NativeSessionContext"), "Get", contextProvider());
            var name = function.Name;
            if (context is null || FixtureIntegrationReflection.Read<object?>(context, "Recovery") is null) return;
            var evidence = FixtureIntegrationReflection.Read<NativeApprovalEvidence?>(context, "ApprovalEvidence");
            if (evidence is null || evidence.State != NativeApprovalState.DecisionAdmitted) { Fault(); return; }
            var code = arguments.TryGetValue("code", out var supplied) ? supplied switch
            {
                string text => text,
                JsonElement { ValueKind: JsonValueKind.String } json => json.GetString(),
                _ => null
            } : null;
            var descriptor = evidence.Batch.Batch.ProtectedRequests.Single(item => item.Call.Name == name && item.Call.Arguments.GetProperty("code").GetString() == code);
            if (evidence.Decisions.Single(item => item.RequestId == descriptor.RequestId).Kind != NativeApprovalDecisionKind.Approved) { Fault(); return; }
            var input = FixtureIntegrationReflection.Read<RunAgentInput>(context, "Input");
            var scope = FixtureIntegrationReflection.Read<string>(context, "Scope");
            string? rawJson = null, textResult = null, jsonKind = null;
            string nativeType;
            if (result is JsonElement jsonResult) { rawJson = jsonResult.GetRawText(); jsonKind = jsonResult.ValueKind.ToString(); nativeType = "System.Text.Json.JsonElement"; }
            else if (result is string text) { textResult = text; nativeType = "System.String"; }
            else if (result is null) nativeType = "null";
            else { Fault(); return; }
            Append(JsonSerializer.SerializeToElement(new
            {
                scope,
                threadId = input.ThreadId,
                runId = input.RunId,
                callId = descriptor.Call.Id,
                requestId = descriptor.RequestId,
                batchId = evidence.Batch.Batch.BatchId,
                admittedGeneration = evidence.AdmittedGeneration,
                admittedRevision = evidence.AdmittedRevision,
                domain = "native-invocation-return",
                nativeType,
                jsonKind,
                rawJson,
                text = textResult,
                isNull = result is null
            }));
        }
        catch (Exception) { Fault(); }
    }

    /// <summary>Appends every witnessed event, without deduplication, or marks acceptance evidence unusable on overflow.</summary>
    private void Append(JsonElement value)
    {
        var scope = value.GetProperty("scope").GetString() ?? throw new InvalidOperationException("Missing actual witness scope.");
        var owned = value.EnumerateObject().Where(property => property.Name != "scope").ToDictionary(property => property.Name, property => (object?)property.Value.Clone());
        lock (_sync)
        {
            owned["workerId"] = _workerId;
            owned["seq"] = ++_sequence;
            owned["monotonicMs"] = Stopwatch.GetElapsedTime(_started).TotalMilliseconds;
            var record = JsonSerializer.SerializeToElement(owned);
            var bytes = Encoding.UTF8.GetByteCount(record.GetRawText());
            if (_records.Count >= MaximumRecords || bytes > 8 * 1024 * 1024 || _bytes > MaximumBytes - bytes) { _faulted = true; return; }
            _bytes += bytes;
            _records.Add((scope, record));
        }
    }

    /// <summary>Fails evidence closed without changing any native result, authority or execution.</summary>
    private void Fault() { lock (_sync) _faulted = true; }

    /// <summary>Delegates the actual approved function once and returns its exact original result reference.</summary>
    private sealed class ObservedFunction(AIFunction inner, FixtureCandidateResultEvidence evidence, Func<HttpContext?> context) : DelegatingAIFunction(inner)
    {
        /// <inheritdoc />
        protected override async ValueTask<object?> InvokeCoreAsync(AIFunctionArguments arguments, CancellationToken cancellationToken = default)
        {
            var result = await InnerFunction.InvokeAsync(arguments, cancellationToken);
            evidence.Invocation(context, InnerFunction, arguments, result);
            return result;
        }
    }
}
