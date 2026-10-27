using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Npgsql;

namespace Hashbrown.Conformance.Integration;

/// <summary>Short-transaction native session ownership journal; initialize before accepting native requests.</summary>
public sealed partial class PostgresNativeSessionJournal : INativeSessionJournal
{
    private readonly NpgsqlDataSource _source;
    private readonly NativeToolCatalog _catalog;
    private readonly NativeSessionOptions _options;
    private readonly string _schema;
    private readonly string _compatibility;
    private string Sessions => $"{_schema}.native_sessions";
    private string Calls => $"{_schema}.native_invocations";
    private string Audit => $"{_schema}.native_audit";
    private string Metadata => $"{_schema}.native_metadata";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>Binds an application-owned pool, trusted model identity, native format and immutable catalog independently of lookup keys.</summary>
    public PostgresNativeSessionJournal(NpgsqlDataSource source, NativeToolCatalog catalog, string compatibilityIdentity, string schema = "hashbrown", NativeSessionOptions? options = null)
    {
        if (!Regex.IsMatch(schema, "^[a-z][a-z0-9_]{0,62}$", RegexOptions.CultureInvariant)) throw new ArgumentException("Invalid native schema.", nameof(schema));
        _source = source; _catalog = catalog; _schema = $"\"{schema}\""; _options = (options ?? new()).Checked();
        _compatibility = JsonSerializer.Serialize(new[] { "hashbrown-native-v1", NativeSessionKey.Required(compatibilityIdentity), catalog.Identity });
    }

    /// <summary>Initializes native schema two atomically. Drain and quiesce version-one workers before upgrading; mixed-version operation is unsupported.</summary>
    public async ValueTask InitializeAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        // PostgreSQL renders FK targets relative to search_path; use one transaction-local catalog view for the fixed manifest.
        await Execute(connection, "SET LOCAL search_path=pg_catalog", cancellationToken);
        await Execute(connection, "SELECT pg_advisory_xact_lock(hashtextextended(@schema,0))", cancellationToken, ("schema", _schema));
        await Execute(connection, $"CREATE SCHEMA IF NOT EXISTS {_schema}", cancellationToken);
        await using var exists = Command(connection, "SELECT to_regclass(@table) IS NOT NULL", ("table", Metadata));
        var hasMetadata = (bool)(await exists.ExecuteScalarAsync(cancellationToken))!;
        if (!hasMetadata)
        {
            await using var orphan = Command(connection, "SELECT EXISTS(SELECT 1 FROM pg_class WHERE relnamespace=@schema::regnamespace AND relname LIKE 'native\\_%' ESCAPE '\\')", ("schema", _schema));
            if ((bool)(await orphan.ExecuteScalarAsync(cancellationToken))!) throw new InvalidOperationException("Native safety tables without metadata cannot be initialized as fresh state.");
            await Execute(connection, $"CREATE TABLE {Metadata}(id integer PRIMARY KEY CHECK(id=1), version integer NOT NULL)", cancellationToken);
            await CreateNativeSchema(connection, cancellationToken);
            await CreateApprovalSchema(connection, cancellationToken);
            await ValidateSchema(connection, 2, cancellationToken);
            await Execute(connection, $"INSERT INTO {Metadata}(id,version) VALUES(1,2)", cancellationToken);
        }
        else
        {
            int version;
            await using (var command = new NpgsqlCommand($"SELECT version FROM {Metadata} WHERE id=1 FOR UPDATE", connection))
                version = await command.ExecuteScalarAsync(cancellationToken) is int value ? value : throw new InvalidOperationException("Missing native schema version.");
            if (version is not (1 or 2)) throw new InvalidOperationException("Unsupported native session schema version.");
            await ValidateSchema(connection, version, cancellationToken);
            if (version == 1)
            {
                await MigrateNativePayloads(connection, cancellationToken);
                await Execute(connection, $"ALTER TABLE {Calls} DROP CONSTRAINT native_invocations_state_check; ALTER TABLE {Calls} ADD CONSTRAINT native_invocations_state_check CHECK(state IN ('Captured','Started','Completed','Declined','Cancelled'))", cancellationToken);
                await CreateApprovalSchema(connection, cancellationToken);
                await ValidateSchema(connection, 2, cancellationToken);
                // Last mutation: any validation, data, DDL or commit failure leaves schema one untouched.
                await Execute(connection, $"UPDATE {Metadata} SET version=2 WHERE id=1", cancellationToken);
            }
        }
        await transaction.CommitAsync(cancellationToken);
    }

    private async ValueTask CreateNativeSchema(NpgsqlConnection connection, CancellationToken cancellationToken)
    {
        await Execute(connection, $"""
            CREATE TABLE {Sessions}(
                id text PRIMARY KEY,agent text NOT NULL,scope text NOT NULL,selector text NOT NULL,key_data text NOT NULL,compatibility text NOT NULL,
                state text NOT NULL CHECK(state IN ('Ready','Owned','Saved','Publishing','PublicationUnknown','Blocked','Retired')),
                token text,generation bigint NOT NULL CHECK(generation>=1),revision bigint NOT NULL CHECK(revision>=1),claim_revision bigint NOT NULL CHECK(claim_revision>=1),
                ever_saved boolean NOT NULL DEFAULT false,lease_until timestamptz,expires_at timestamptz NOT NULL,payload text,admitted_request text,
                CHECK(state NOT IN ('Owned','Saved','Publishing') OR (token IS NOT NULL AND lease_until IS NOT NULL)));
            CREATE INDEX native_scoped_sessions ON {Sessions}(agent,scope,id);
            CREATE TABLE {Calls}(
                session_id text NOT NULL REFERENCES {Sessions}(id),call_id text NOT NULL,name text NOT NULL,version integer NOT NULL CHECK(version>0),descriptor text,
                state text NOT NULL CHECK(state IN ('Captured','Started','Completed','Declined','Cancelled')),captured_generation bigint NOT NULL,dispatch_generation bigint,
                PRIMARY KEY(session_id,call_id));
            CREATE TABLE {Audit}(
                id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,session_id text NOT NULL REFERENCES {Sessions}(id),scope text NOT NULL,actor text NOT NULL,
                prior_state text NOT NULL,prior_generation bigint NOT NULL,prior_revision bigint NOT NULL,outcome text NOT NULL,
                reason text NOT NULL,evidence_reference text NOT NULL,recorded_at timestamptz NOT NULL);
            """, cancellationToken);
    }

    /// <summary>Validates the owned canonical prefix before allocating one fenced owner; never substitutes fresh state for a continuation.</summary>
    public async ValueTask<NativeSessionAdmission> TryAcquireAsync(NativeSessionKey key, string publicRequestJson, CancellationToken cancellationToken = default)
    {
        string incoming;
        NativeApprovalAdmissionEnvelope? decisions = null;
        try
        {
            if (Encoding.UTF8.GetByteCount(publicRequestJson) > _options.PublicBytes) return new(400);
            using var input = JsonDocument.Parse(publicRequestJson);
            if (input.RootElement.TryGetProperty("resume", out var resume) && resume.ValueKind != JsonValueKind.Null && (resume.ValueKind != JsonValueKind.Array || resume.GetArrayLength() != 0))
            {
                decisions = NativeApprovalAdmission.Parse(publicRequestJson, key, _catalog, _options);
                incoming = decisions.CanonicalPublicRequest;
            }
            else incoming = NativeSessionHistory.Normalize(publicRequestJson, key, _catalog, _options);
        }
        catch (Exception exception) when (BadInput(exception)) { return new(400); }
        try
        {
            await using var connection = await _source.OpenConnectionAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
            // Serializes first allocation and per-scope capacity checks across all replicas, including absent rows.
            await RequireSchemaVersion(connection, cancellationToken, true);
            var row = await Read(connection, key, cancellationToken);
            var now = await Now(connection, cancellationToken);
            if (row is null)
            {
                if (decisions is not null || !NativeSessionHistory.Admits(incoming, null)) return new(400);
                await using var count = Command(connection, $"SELECT count(*),count(*) FILTER(WHERE payload IS NOT NULL) FROM {Sessions} WHERE agent=@agent AND scope=@scope", ("agent", key.Agent), ("scope", key.Scope));
                await using (var reader = await count.ExecuteReaderAsync(cancellationToken))
                {
                    await reader.ReadAsync(cancellationToken);
                    if (reader.GetInt64(0) >= _options.SelectorCapacity || reader.GetInt64(1) >= _options.PayloadCapacity) return new(503);
                }
                var token = Guid.NewGuid().ToString("N");
                var snapshot = new NativeSessionSnapshot(null, incoming, [], [], false);
                await Execute(connection, $"INSERT INTO {Sessions}(id,agent,scope,selector,key_data,compatibility,state,token,generation,revision,claim_revision,lease_until,expires_at,payload,admitted_request) VALUES(@id,@agent,@scope,@selector,@key,@compatibility,'Owned',@token,1,1,1,@lease,@expires,@payload,@incoming)", cancellationToken,
                    ("id", key.Id), ("agent", key.Agent), ("scope", key.Scope), ("selector", key.Selector), ("key", KeyData(key)), ("compatibility", _compatibility), ("token", token), ("lease", now + _options.Lease), ("expires", now + _options.Retention), ("payload", SerializePayload(snapshot)), ("incoming", incoming));
                await transaction.CommitAsync(cancellationToken);
                return new(200, new(key, token, 1, 1), snapshot, true);
            }
            if (row.KeyData != KeyData(key)) return new(400);
            if (row.Compatibility != _compatibility) return new(409);
            if (row.State == "Retired") return new(410);
            if (row.State is "Publishing" or "PublicationUnknown" or "Blocked") return new(409);
            if (row.Expires <= now)
            {
                await RetireRow(connection, row, key, row.State == "Owned" && await HasDispatch(connection, key, row.Generation, cancellationToken) ? "Blocked" : "Retired", cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return new(410);
            }
            if (row.State is "Owned" or "Saved" && row.LeaseUntil > now) return new(409);
            if (row.State == "Owned" && await HasDispatch(connection, key, row.Generation, cancellationToken))
            {
                await Execute(connection, $"UPDATE {Sessions} SET state='Blocked',token=NULL,lease_until=NULL,generation=generation+1,revision=revision+1 WHERE id=@id", cancellationToken, ("id", key.Id));
                await transaction.CommitAsync(cancellationToken);
                return new(409);
            }
            NativeSessionSnapshot previous;
            NativeApprovalEvidence? approval;
            var nextToken = Guid.NewGuid().ToString("N");
            var nextLease = new NativeSessionLease(key, nextToken, row.Generation + 1, row.Revision + 1);
            try
            {
                (previous, approval) = await ReadApprovalSnapshot(connection, row, nextLease, now, cancellationToken);
                if (row.EverSaved && previous.NativeJson is null) throw new ArgumentException("Previously saved native state is missing.");
            }
            catch (Exception exception) when (BadInput(exception))
            {
                await RetireRow(connection, row, key, "Blocked", cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return new(503);
            }
            if (approval is not null)
            {
                if (decisions is null || !NativeApprovalAdmission.MatchesPublishedBatch(decisions, approval) || !NativeApprovalAdmission.AdmitsOwnedPrefix(incoming, previous, approval)) return new(400);
            }
            else if (decisions is not null || !NativeSessionHistory.Admits(incoming, previous.NativeJson is null ? null : previous)) return new(400);
            await RemoveUncommittedCalls(connection, key, previous, cancellationToken);
            await Execute(connection, $"UPDATE {Sessions} SET state='Owned',token=@token,generation=generation+1,revision=revision+1,claim_revision=revision+1,lease_until=@lease,admitted_request=@incoming WHERE id=@id", cancellationToken, ("id", key.Id), ("token", nextToken), ("lease", now + _options.Lease), ("incoming", incoming));
            await transaction.CommitAsync(cancellationToken);
            return new(200, new(key, nextToken, row.Generation + 1, row.Revision + 1), previous, !row.EverSaved);
        }
        catch (Exception exception) when (exception is NpgsqlException or TimeoutException) { return new(503); }
    }

    /// <summary>Extends only current unexpired request authority, including saved/publication state, without changing its receipt revision.</summary>
    public async ValueTask<bool> RenewAsync(NativeSessionLease lease, CancellationToken cancellationToken = default)
    {
        await using var connection = await _source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await RequireSchemaVersion(connection, cancellationToken);
        var row = await Read(connection, lease.Key, cancellationToken);
        var now = await Now(connection, cancellationToken);
        if (!Owns(row, lease, now) || row!.State is not ("Owned" or "Saved" or "Publishing")) return false;
        await Execute(connection, $"UPDATE {Sessions} SET lease_until=@lease WHERE id=@id", cancellationToken, ("lease", now + _options.Lease), ("id", lease.Key.Id));
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    private NativeSessionSnapshot ValidatePayload(string? payload, NativeSessionKey key, bool durablePendingReader = false)
    {
        if (payload is null || Encoding.UTF8.GetByteCount(payload) > _options.NativeBytes * 6L + _options.PublicBytes * 6L + (long)_options.MaximumCalls * _options.ArgumentBytes * 6L) throw new ArgumentException("Native payload unavailable or oversized.");
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("formatVersion", out var format) || !format.TryGetInt32(out var version) || version != 2 || !root.TryGetProperty("approvals", out var approvals) || approvals.ValueKind != JsonValueKind.Object) throw new JsonException("Explicit native payload format two and approval state are required.");
        string[] fields = ["formatVersion", "nativeJson", "publicRequest", "pendingCalls", "expectedBrowserCallIds", "turnCompleted", "approvals"];
        if (!root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).SequenceEqual(fields.Order(StringComparer.Ordinal)) || root.GetProperty("turnCompleted").ValueKind is not (JsonValueKind.True or JsonValueKind.False)) throw new JsonException("Unknown or incomplete native payload format two.");
        if (!approvals.EnumerateObject().Select(property => property.Name).SequenceEqual(["pendingBatch"])) throw new JsonException("Explicit pending approval state is required.");
        if (approvals.GetProperty("pendingBatch").ValueKind != JsonValueKind.Null)
        {
            if (!durablePendingReader) throw new NotSupportedException("Native approval capture and publication are not enabled.");
            var pending = approvals.GetProperty("pendingBatch");
            var batch = pending.GetProperty("batch");
            var protectedRequests = batch.GetProperty("protectedRequests"); var browserBindings = batch.GetProperty("browserBindings");
            if (protectedRequests.ValueKind != JsonValueKind.Array || browserBindings.ValueKind != JsonValueKind.Array || protectedRequests.GetArrayLength() < 1 || protectedRequests.GetArrayLength() + browserBindings.GetArrayLength() > Math.Min(256, _options.MaximumCalls) || Encoding.UTF8.GetByteCount(batch.GetRawText()) > _options.NativeBytes || pending.GetProperty("publicLocations").EnumerateObject().Count() != protectedRequests.GetArrayLength() + browserBindings.GetArrayLength()) throw new JsonException("Oversized or incomplete approval payload.");
            foreach (var member in protectedRequests.EnumerateArray())
                if (Encoding.UTF8.GetByteCount(member.GetProperty("call").GetProperty("arguments").GetRawText()) > _options.ArgumentBytes) throw new JsonException("Oversized protected arguments.");
            foreach (var member in browserBindings.EnumerateArray())
                if (Encoding.UTF8.GetByteCount(member.GetProperty("arguments").GetRawText()) > _options.ArgumentBytes) throw new JsonException("Oversized browser arguments.");
        }
        var snapshot = JsonSerializer.Deserialize<NativeSessionSnapshot>(payload, JsonOptions) ?? throw new JsonException();
        if (snapshot.PublicRequest != NativeSessionHistory.Normalize(snapshot.PublicRequest, key, _catalog, _options)) throw new ArgumentException("The persisted public prefix is not canonical.");
        if (snapshot.NativeJson is not null) ValidateNative(snapshot.NativeJson);
        if (snapshot.PendingCalls.Count > _options.MaximumCalls || snapshot.ExpectedBrowserCallIds.Count > _options.MaximumCalls || snapshot.PendingCalls.Any(call => !_catalog.HasVersion(call) || Encoding.UTF8.GetByteCount(call.Arguments.GetRawText()) > _options.ArgumentBytes) || snapshot.PendingCalls.Select(call => call.Id).Distinct(StringComparer.Ordinal).Count() != snapshot.PendingCalls.Count || snapshot.ExpectedBrowserCallIds.Distinct(StringComparer.Ordinal).Count() != snapshot.ExpectedBrowserCallIds.Count) throw new ArgumentException("Invalid native pending descriptors.");
        if (!ValidPending(snapshot)) throw new ArgumentException("The persisted pending/public state is inconsistent.");
        return snapshot;
    }
    private void ValidateNative(string value)
    {
        if (Encoding.UTF8.GetByteCount(value) > _options.NativeBytes) throw new ArgumentException("Native session exceeds its limit.");
        using var document = JsonDocument.Parse(value);
        if (document.RootElement.ValueKind != JsonValueKind.Object) throw new ArgumentException("Native session JSON must be an object.");
    }
    private static bool BadInput(Exception exception) => exception is ArgumentException or JsonException or InvalidOperationException or NotSupportedException or KeyNotFoundException;
    private static string KeyData(NativeSessionKey key) => NativeSessionHistory.Canonical(JsonSerializer.SerializeToElement(key, JsonOptions));
    private static string Serialize<T>(T value) => JsonSerializer.Serialize(value, JsonOptions);
    private bool Owns(Row? row, NativeSessionLease lease, DateTimeOffset now) => row is not null && row.KeyData == KeyData(lease.Key) && row.Compatibility == _compatibility && row.Token == lease.Token && row.Generation == lease.Generation && row.ClaimRevision == lease.Revision && row.LeaseUntil > now && row.Expires > now;
    private async ValueTask<Row?> Read(NpgsqlConnection connection, NativeSessionKey key, CancellationToken cancellationToken)
    {
        await using var command = Command(connection, $"SELECT key_data,compatibility,state,token,generation,revision,claim_revision,lease_until,expires_at,payload,ever_saved,admitted_request FROM {Sessions} WHERE id=@id FOR UPDATE", ("id", key.Id));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetInt64(4), reader.GetInt64(5), reader.GetInt64(6), reader.IsDBNull(7) ? null : reader.GetFieldValue<DateTimeOffset>(7), reader.GetFieldValue<DateTimeOffset>(8), reader.IsDBNull(9) ? null : reader.GetString(9), reader.GetBoolean(10), reader.IsDBNull(11) ? null : reader.GetString(11));
    }
    private static NpgsqlCommand Command(NpgsqlConnection connection, string sql, params (string Name, object Value)[] parameters)
    {
        var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value);
        return command;
    }
    private static async ValueTask<int> Execute(NpgsqlConnection connection, string sql, CancellationToken cancellationToken, params (string Name, object Value)[] parameters)
    {
        await using var command = Command(connection, sql, parameters);
        return await command.ExecuteNonQueryAsync(cancellationToken);
    }
    private static async ValueTask<DateTimeOffset> Now(NpgsqlConnection connection, CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand("SELECT clock_timestamp()", connection);
        return new DateTimeOffset((DateTime)(await command.ExecuteScalarAsync(cancellationToken))!);
    }
    private sealed record Row(string KeyData, string Compatibility, string State, string? Token, long Generation, long Revision, long ClaimRevision, DateTimeOffset? LeaseUntil, DateTimeOffset Expires, string? Payload, bool EverSaved, string? AdmittedRequest);
}
