using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Npgsql;

namespace Hashbrown.Conformance.Integration;

public sealed partial class PostgresNativeSessionJournal
{
    /// <inheritdoc />
    public ValueTask<bool> CaptureApprovalBatchAsync(NativeSessionLease lease, NativeApprovalBatch capture, CancellationToken cancellationToken = default) => throw new NotSupportedException("Native approval persistence is not enabled.");
    /// <inheritdoc />
    public ValueTask<NativeApprovalEvidence?> GetOwnedApprovalEvidenceAsync(NativeSessionLease lease, CancellationToken cancellationToken = default) => throw new NotSupportedException("Native approval persistence is not enabled.");
    /// <inheritdoc />
    public ValueTask<bool> TryAdmitApprovalBatchAsync(NativeSessionLease lease, string batchId, NativeApprovalAdmissionEnvelope admission, CancellationToken cancellationToken = default) => throw new NotSupportedException("Native approval persistence is not enabled.");
    /// <inheritdoc />
    public ValueTask<bool> SettleApprovalRejectionAsync(NativeSessionLease lease, NativeApprovalRejection rejection, CancellationToken cancellationToken = default) => throw new NotSupportedException("Native approval persistence is not enabled.");
    private string Approvals => $"{_schema}.native_approvals";
    private string ApprovalBatches => $"{_schema}.native_approval_batches";

    private async ValueTask RequireSchemaVersion(NpgsqlConnection connection, CancellationToken cancellationToken, bool exclusive = false)
    {
        await using var command = new NpgsqlCommand($"SELECT version FROM {Metadata} WHERE id=1 FOR {(exclusive ? "UPDATE" : "SHARE")}", connection);
        if (await command.ExecuteScalarAsync(cancellationToken) is not int version || version != 2) throw new InvalidOperationException("Unsupported native session schema version.");
    }

    private static string SerializePayload(NativeSessionSnapshot snapshot) => JsonSerializer.Serialize(new
    {
        formatVersion = 2,
        snapshot.NativeJson,
        snapshot.PublicRequest,
        snapshot.PendingCalls,
        snapshot.ExpectedBrowserCallIds,
        snapshot.TurnCompleted,
        snapshot.Approvals
    }, JsonOptions);

    private string ApprovalExpiryBody => $"""
        BEGIN
            IF NEW.expires_at>(SELECT expires_at FROM {Sessions} WHERE id=NEW.session_id FOR UPDATE) THEN
                RAISE EXCEPTION 'Native approval expiry exceeds session retention' USING ERRCODE='23514';
            END IF;
            RETURN NEW;
        END
        """;

    private string SessionApprovalExpiryBody => $"""
        BEGIN
            IF EXISTS(SELECT 1 FROM {Approvals} WHERE session_id=NEW.id AND expires_at>NEW.expires_at)
                OR EXISTS(SELECT 1 FROM {ApprovalBatches} WHERE session_id=NEW.id AND expires_at>NEW.expires_at) THEN
                RAISE EXCEPTION 'Native session retention cannot strand approval expiry' USING ERRCODE='23514';
            END IF;
            RETURN NEW;
        END
        """;

    private async ValueTask CreateApprovalSchema(NpgsqlConnection connection, CancellationToken cancellationToken)
    {
        await Execute(connection, $"""
            CREATE TABLE {ApprovalBatches}(
                session_id text NOT NULL REFERENCES {Sessions}(id),batch_id text NOT NULL CHECK(octet_length(batch_id) BETWEEN 1 AND 1024),
                published_revision bigint CHECK(published_revision>=1),member_digest text NOT NULL CHECK(length(member_digest)=64 AND member_digest ~ '^[A-F0-9]+$'),
                member_count integer NOT NULL CHECK(member_count BETWEEN 1 AND 256),
                state text NOT NULL CHECK(state IN ('Pending','DecisionAdmitted','Settled','Retired')),
                admitted_generation bigint CHECK(admitted_generation>=1),admitted_revision bigint CHECK(admitted_revision>=1),expires_at timestamptz NOT NULL,
                CHECK((admitted_generation IS NULL)=(admitted_revision IS NULL)),
                CHECK(state NOT IN ('DecisionAdmitted','Settled') OR (published_revision IS NOT NULL AND admitted_generation IS NOT NULL)),
                PRIMARY KEY(session_id,batch_id));
            CREATE TABLE {Approvals}(
                session_id text NOT NULL,request_id text NOT NULL CHECK(octet_length(request_id) BETWEEN 1 AND 1024),
                call_id text NOT NULL CHECK(octet_length(call_id) BETWEEN 1 AND 1024),batch_id text NOT NULL,
                kind text NOT NULL CHECK(kind IN ('Protected','BrowserBypass')),
                private_descriptor text CHECK(private_descriptor IS NULL OR (octet_length(private_descriptor)<=1048576 AND jsonb_typeof(private_descriptor::jsonb)='object')),
                state text NOT NULL CHECK(state IN ('Pending','DecisionAdmitted','Settled','Retired')),
                decision text CHECK(decision IN ('Approved','Declined','Cancelled')),
                captured_generation bigint NOT NULL CHECK(captured_generation>=1),
                admitted_generation bigint CHECK(admitted_generation>=1),admitted_revision bigint CHECK(admitted_revision>=1),expires_at timestamptz NOT NULL,
                result_digest text CHECK(length(result_digest)=64 AND result_digest ~ '^[A-F0-9]+$'),
                CHECK(kind='Protected' OR (decision IS NULL AND admitted_generation IS NULL AND admitted_revision IS NULL AND state<>'DecisionAdmitted')),
                CHECK((admitted_generation IS NULL)=(admitted_revision IS NULL)),
                CHECK(kind<>'Protected' OR state NOT IN ('DecisionAdmitted','Settled') OR (decision IS NOT NULL AND admitted_generation IS NOT NULL)),
                PRIMARY KEY(session_id,request_id),UNIQUE(session_id,call_id),
                FOREIGN KEY(session_id,batch_id) REFERENCES {ApprovalBatches}(session_id,batch_id));
            CREATE FUNCTION {_schema}.native_approval_expiry() RETURNS trigger LANGUAGE plpgsql AS $expiry$
            {ApprovalExpiryBody}
            $expiry$;
            CREATE FUNCTION {_schema}.native_session_approval_expiry() RETURNS trigger LANGUAGE plpgsql AS $expiry$
            {SessionApprovalExpiryBody}
            $expiry$;
            CREATE TRIGGER native_session_approval_expiry BEFORE UPDATE OF expires_at ON {Sessions} FOR EACH ROW EXECUTE FUNCTION {_schema}.native_session_approval_expiry();
            CREATE TRIGGER native_approval_expiry BEFORE INSERT OR UPDATE ON {Approvals} FOR EACH ROW EXECUTE FUNCTION {_schema}.native_approval_expiry();
            CREATE TRIGGER native_batch_expiry BEFORE INSERT OR UPDATE ON {ApprovalBatches} FOR EACH ROW EXECUTE FUNCTION {_schema}.native_approval_expiry();
            """, cancellationToken);
    }

    // Count the union: protected requests share an invocation, while browser-only and purged fences still consume capacity.
    private async ValueTask<bool> HasCallCapacity(NpgsqlConnection connection, NativeSessionKey key, string callId, CancellationToken cancellationToken)
    {
        await using var command = Command(connection, $"SELECT count(*) FROM (SELECT call_id FROM {Calls} WHERE session_id=@id UNION SELECT call_id FROM {Approvals} WHERE session_id=@id UNION SELECT @call::text) retained", ("id", key.Id), ("call", callId));
        if ((long)(await command.ExecuteScalarAsync(cancellationToken))! > _options.MaximumCalls) return false;
        return await HasApprovalCapacity(connection, key, 0, 0, cancellationToken);
    }

    // Future approval allocation must call this under the same session row lock before inserting any members.
    private async ValueTask<bool> HasApprovalCapacity(NpgsqlConnection connection, NativeSessionKey key, int additionalBindings, int additionalPrivateBytes, CancellationToken cancellationToken)
    {
        await using var command = Command(connection, $"SELECT count(*),COALESCE(sum(octet_length(private_descriptor)),0)::bigint FROM {Approvals} WHERE session_id=@id", ("id", key.Id));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return additionalBindings >= 0 && additionalPrivateBytes >= 0 && reader.GetInt64(0) + additionalBindings <= _options.MaximumCalls && reader.GetInt64(1) + additionalPrivateBytes <= _options.NativeBytes;
    }

    private async ValueTask MigrateNativePayloads(NpgsqlConnection connection, CancellationToken cancellationToken)
    {
        // Bounded row materialization, with no opaque native-StateBag interpretation or current catalog rewrite.
        var after = "";
        while (true)
        {
            var rows = new List<(string Id, string Agent, string Scope, string Selector, string Key, string Compatibility, string? Payload, bool Saved)>();
            await using (var command = Command(connection, $"SELECT id,agent,scope,selector,key_data,compatibility,payload,ever_saved FROM {Sessions} WHERE id>@after ORDER BY id LIMIT @limit FOR UPDATE", ("after", after), ("limit", 1)))
            await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
                while (await reader.ReadAsync(cancellationToken)) rows.Add((reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetString(5), reader.IsDBNull(6) ? null : reader.GetString(6), reader.GetBoolean(7)));
            if (rows.Count == 0) break;
            foreach (var row in rows)
            {
                var key = JsonSerializer.Deserialize<NativeSessionKey>(row.Key, JsonOptions) ?? throw new JsonException();
                if (key.Id != row.Id || key.Agent != row.Agent || key.Scope != row.Scope || key.Selector != row.Selector || KeyData(key) != row.Key) throw new InvalidOperationException("Invalid persisted native session key.");
                using var compatibility = JsonDocument.Parse(row.Compatibility);
                var identity = compatibility.RootElement;
                if (identity.ValueKind != JsonValueKind.Array || identity.GetArrayLength() != 3 || identity[0].GetString() != "hashbrown-native-v1" || identity.EnumerateArray().Any(value => value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(value.GetString()) || Encoding.UTF8.GetByteCount(value.GetString()!) > 4096)) throw new InvalidOperationException("Invalid persisted native compatibility.");
                if (row.Payload is not null)
                {
                    var snapshot = ReadLegacyPayload(row.Payload, key, row.Saved);
                    await Execute(connection, $"UPDATE {Sessions} SET payload=@payload WHERE id=@id", cancellationToken, ("payload", SerializePayload(snapshot)), ("id", row.Id));
                }
            }
            after = rows[^1].Id;
        }
    }

    private NativeSessionSnapshot ReadLegacyPayload(string payload, NativeSessionKey key, bool saved)
    {
        if (Encoding.UTF8.GetByteCount(payload) > _options.NativeBytes * 6L + _options.PublicBytes * 6L + (long)_options.MaximumCalls * _options.ArgumentBytes * 6L) throw new ArgumentException("Oversized legacy native payload.");
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;
        string[] fields = ["nativeJson", "publicRequest", "pendingCalls", "expectedBrowserCallIds", "turnCompleted"];
        if (root.ValueKind != JsonValueKind.Object || !root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).SequenceEqual(fields.Order(StringComparer.Ordinal))) throw new JsonException("Unknown or incomplete legacy native payload.");
        var native = root.GetProperty("nativeJson");
        if (native.ValueKind is not (JsonValueKind.Null or JsonValueKind.String) || saved && native.ValueKind != JsonValueKind.String) throw new JsonException("Missing saved native state.");
        if (native.ValueKind == JsonValueKind.String) ValidateNative(native.GetString()!);
        var publicRequest = root.GetProperty("publicRequest").GetString() ?? throw new JsonException();
        // Structural validation must preserve incompatible old catalog identities rather than adopt the initializer's catalog.
        if (NativeSessionHistory.Normalize(publicRequest, key, new NativeToolCatalog([]), _options) != publicRequest) throw new JsonException("Invalid legacy public history.");
        var calls = JsonSerializer.Deserialize<NativeToolCall[]>(root.GetProperty("pendingCalls"), JsonOptions) ?? throw new JsonException();
        var browser = JsonSerializer.Deserialize<string[]>(root.GetProperty("expectedBrowserCallIds"), JsonOptions) ?? throw new JsonException();
        if (calls.Length > _options.MaximumCalls || browser.Length > _options.MaximumCalls || calls.Any(call => call is null || Encoding.UTF8.GetByteCount(call.Arguments.GetRawText()) > _options.ArgumentBytes) || calls.Select(call => call.Id).Distinct(StringComparer.Ordinal).Count() != calls.Length || browser.Any(id => string.IsNullOrWhiteSpace(id) || Encoding.UTF8.GetByteCount(id) > 1024) || browser.Distinct(StringComparer.Ordinal).Count() != browser.Length) throw new JsonException("Invalid legacy pending descriptors.");
        var completed = root.GetProperty("turnCompleted").GetBoolean();
        if (completed && (calls.Length != 0 || browser.Length != 0)) throw new JsonException("Invalid completed legacy pending state.");
        var publicRoot = System.Text.Json.Nodes.JsonNode.Parse(publicRequest)!;
        var messages = publicRoot["messages"]!.AsArray();
        var publicCalls = messages.SelectMany(message => message!["toolCalls"] is System.Text.Json.Nodes.JsonArray entries ? entries : []).ToDictionary(call => call!["id"]!.GetValue<string>(), call => call!, StringComparer.Ordinal);
        var results = messages.Where(message => message!["role"]!.GetValue<string>() == "tool").Select(message => message!["toolCallId"]!.GetValue<string>()).ToHashSet(StringComparer.Ordinal);
        var browserNames = publicRoot["tools"]?.AsArray().Select(tool => tool!["name"]!.GetValue<string>()).ToHashSet(StringComparer.Ordinal) ?? [];
        var expectedBrowser = publicCalls.Where(pair => !results.Contains(pair.Key) && browserNames.Contains(pair.Value["function"]!["name"]!.GetValue<string>())).Select(pair => pair.Key).ToHashSet(StringComparer.Ordinal);
        if (!expectedBrowser.SetEquals(browser) || publicCalls.Any(pair => !results.Contains(pair.Key) && !expectedBrowser.Contains(pair.Key) && !calls.Any(call => call.Id == pair.Key))) throw new JsonException("Inconsistent legacy pending call identities.");
        foreach (var call in calls)
        {
            if (publicCalls.TryGetValue(call.Id, out var recorded))
            {
                if (results.Contains(call.Id) || expectedBrowser.Contains(call.Id) || recorded["function"]!["name"]!.GetValue<string>() != call.Name || !System.Text.Json.Nodes.JsonNode.DeepEquals(System.Text.Json.Nodes.JsonNode.Parse(recorded["function"]!["arguments"]!.GetValue<string>()), System.Text.Json.Nodes.JsonNode.Parse(call.Arguments.GetRawText()))) throw new JsonException("Inconsistent legacy server descriptor.");
            }
            else if (browser.Length == 0 || completed) throw new JsonException("Unbound legacy private server descriptor.");
        }
        if (native.ValueKind == JsonValueKind.Null && (calls.Length != 0 || browser.Length != 0 || completed || !NativeSessionHistory.Admits(publicRequest, null))) throw new JsonException("Invalid legacy virgin state.");
        return new(native.ValueKind == JsonValueKind.String ? native.GetString() : null, publicRequest, calls, browser, completed, NativeApprovalSnapshot.Empty);
    }

    private async ValueTask ValidateSchema(NpgsqlConnection connection, int version, CancellationToken cancellationToken)
    {
        // Required structures only: harmless operational indexes and unrelated workflow schema are outside this manifest.
        var columns = new Dictionary<string, string>
        {
            ["native_metadata"] = "id:integer version:integer",
            ["native_sessions"] = "id:text agent:text scope:text selector:text key_data:text compatibility:text state:text token:text? generation:bigint revision:bigint claim_revision:bigint ever_saved:boolean lease_until:timestamp with time zone? expires_at:timestamp with time zone payload:text? admitted_request:text?",
            ["native_invocations"] = "session_id:text call_id:text name:text version:integer descriptor:text? state:text captured_generation:bigint dispatch_generation:bigint?",
            ["native_audit"] = "id:bigint session_id:text scope:text actor:text prior_state:text prior_generation:bigint prior_revision:bigint outcome:text reason:text evidence_reference:text recorded_at:timestamp with time zone"
        };
        if (version == 2)
        {
            columns["native_approval_batches"] = "session_id:text batch_id:text published_revision:bigint? member_digest:text member_count:integer state:text admitted_generation:bigint? admitted_revision:bigint? expires_at:timestamp with time zone";
            columns["native_approvals"] = "session_id:text request_id:text call_id:text batch_id:text kind:text private_descriptor:text? state:text decision:text? captured_generation:bigint admitted_generation:bigint? admitted_revision:bigint? expires_at:timestamp with time zone result_digest:text?";
        }
        var actual = new Dictionary<string, (string Type, bool Nullable)>(StringComparer.Ordinal);
        await using (var command = Command(connection, "SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod),NOT a.attnotnull FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.relnamespace=@schema::regnamespace AND a.attnum>0 AND NOT a.attisdropped", ("schema", _schema)))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
            while (await reader.ReadAsync(cancellationToken)) actual.Add(reader.GetString(0) + "." + reader.GetString(1), (reader.GetString(2), reader.GetBoolean(3)));
        foreach (var (table, manifest) in columns)
            foreach (Match column in Regex.Matches(manifest, @"(\w+):(timestamp with time zone|\w+)(\?)?"))
                if (!actual.TryGetValue(table + "." + column.Groups[1].Value, out var found) || found.Type != column.Groups[2].Value || found.Nullable != column.Groups[3].Success) throw new InvalidOperationException("Missing or incompatible required native schema column.");
        var constraints = new Dictionary<string, string>(StringComparer.Ordinal);
        await using (var command = Command(connection, "SELECT c.relname,k.conname,pg_get_constraintdef(k.oid) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE c.relnamespace=@schema::regnamespace AND k.convalidated", ("schema", _schema)))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
            while (await reader.ReadAsync(cancellationToken)) constraints[reader.GetString(0) + "." + reader.GetString(1)] = reader.GetString(2);
        var required = new Dictionary<string, string>
        {
            ["native_metadata.native_metadata_pkey"] = "PRIMARY KEY (id)",
            ["native_metadata.native_metadata_id_check"] = "CHECK ((id = 1))",
            ["native_sessions.native_sessions_pkey"] = "PRIMARY KEY (id)",
            ["native_sessions.native_sessions_state_check"] = States("Ready", "Owned", "Saved", "Publishing", "PublicationUnknown", "Blocked", "Retired"),
            ["native_sessions.native_sessions_generation_check"] = "CHECK ((generation >= 1))",
            ["native_sessions.native_sessions_revision_check"] = "CHECK ((revision >= 1))",
            ["native_sessions.native_sessions_claim_revision_check"] = "CHECK ((claim_revision >= 1))",
            ["native_sessions.native_sessions_check"] = "CHECK (((state <> ALL (ARRAY['Owned'::text, 'Saved'::text, 'Publishing'::text])) OR ((token IS NOT NULL) AND (lease_until IS NOT NULL))))",
            ["native_invocations.native_invocations_pkey"] = "PRIMARY KEY (session_id, call_id)",
            ["native_invocations.native_invocations_session_id_fkey"] = $"FOREIGN KEY (session_id) REFERENCES {Sessions}(id)",
            ["native_invocations.native_invocations_version_check"] = "CHECK ((version > 0))",
            ["native_invocations.native_invocations_state_check"] = version == 1 ? States("Captured", "Started", "Completed") : States("Captured", "Started", "Completed", "Declined", "Cancelled"),
            ["native_audit.native_audit_pkey"] = "PRIMARY KEY (id)",
            ["native_audit.native_audit_session_id_fkey"] = $"FOREIGN KEY (session_id) REFERENCES {Sessions}(id)"
        };
        if (version == 2)
        {
            required["native_approval_batches.native_approval_batches_pkey"] = "PRIMARY KEY (session_id, batch_id)";
            required["native_approval_batches.native_approval_batches_session_id_fkey"] = $"FOREIGN KEY (session_id) REFERENCES {Sessions}(id)";
            required["native_approvals.native_approvals_pkey"] = "PRIMARY KEY (session_id, request_id)";
            required["native_approvals.native_approvals_session_id_call_id_key"] = "UNIQUE (session_id, call_id)";
            required["native_approvals.native_approvals_session_id_batch_id_fkey"] = $"FOREIGN KEY (session_id, batch_id) REFERENCES {ApprovalBatches}(session_id, batch_id)";
            required["native_approval_batches.native_approval_batches_admitted_generation_check"] = "CHECK ((admitted_generation >= 1))";
            required["native_approval_batches.native_approval_batches_admitted_revision_check"] = "CHECK ((admitted_revision >= 1))";
            required["native_approval_batches.native_approval_batches_batch_id_check"] = "CHECK (((octet_length(batch_id) >= 1) AND (octet_length(batch_id) <= 1024)))";
            required["native_approval_batches.native_approval_batches_check"] = "CHECK (((admitted_generation IS NULL) = (admitted_revision IS NULL)))";
            required["native_approval_batches.native_approval_batches_check1"] = "CHECK (((state <> ALL (ARRAY['DecisionAdmitted'::text, 'Settled'::text])) OR ((published_revision IS NOT NULL) AND (admitted_generation IS NOT NULL))))";
            required["native_approval_batches.native_approval_batches_member_count_check"] = "CHECK (((member_count >= 1) AND (member_count <= 256)))";
            required["native_approval_batches.native_approval_batches_member_digest_check"] = "CHECK (((length(member_digest) = 64) AND (member_digest ~ '^[A-F0-9]+$'::text)))";
            required["native_approval_batches.native_approval_batches_published_revision_check"] = "CHECK ((published_revision >= 1))";
            required["native_approval_batches.native_approval_batches_state_check"] = "CHECK ((state = ANY (ARRAY['Pending'::text, 'DecisionAdmitted'::text, 'Settled'::text, 'Retired'::text])))";
            required["native_approvals.native_approvals_admitted_generation_check"] = "CHECK ((admitted_generation >= 1))";
            required["native_approvals.native_approvals_admitted_revision_check"] = "CHECK ((admitted_revision >= 1))";
            required["native_approvals.native_approvals_captured_generation_check"] = "CHECK ((captured_generation >= 1))";
            required["native_approvals.native_approvals_call_id_check"] = "CHECK (((octet_length(call_id) >= 1) AND (octet_length(call_id) <= 1024)))";
            required["native_approvals.native_approvals_check"] = "CHECK (((kind = 'Protected'::text) OR ((decision IS NULL) AND (admitted_generation IS NULL) AND (admitted_revision IS NULL) AND (state <> 'DecisionAdmitted'::text))))";
            required["native_approvals.native_approvals_check1"] = "CHECK (((admitted_generation IS NULL) = (admitted_revision IS NULL)))";
            required["native_approvals.native_approvals_check2"] = "CHECK (((kind <> 'Protected'::text) OR (state <> ALL (ARRAY['DecisionAdmitted'::text, 'Settled'::text])) OR ((decision IS NOT NULL) AND (admitted_generation IS NOT NULL))))";
            required["native_approvals.native_approvals_decision_check"] = "CHECK ((decision = ANY (ARRAY['Approved'::text, 'Declined'::text, 'Cancelled'::text])))";
            required["native_approvals.native_approvals_kind_check"] = "CHECK ((kind = ANY (ARRAY['Protected'::text, 'BrowserBypass'::text])))";
            required["native_approvals.native_approvals_private_descriptor_check"] = "CHECK (((private_descriptor IS NULL) OR ((octet_length(private_descriptor) <= 1048576) AND (jsonb_typeof((private_descriptor)::jsonb) = 'object'::text))))";
            required["native_approvals.native_approvals_request_id_check"] = "CHECK (((octet_length(request_id) >= 1) AND (octet_length(request_id) <= 1024)))";
            required["native_approvals.native_approvals_result_digest_check"] = "CHECK (((length(result_digest) = 64) AND (result_digest ~ '^[A-F0-9]+$'::text)))";
            required["native_approvals.native_approvals_state_check"] = "CHECK ((state = ANY (ARRAY['Pending'::text, 'DecisionAdmitted'::text, 'Settled'::text, 'Retired'::text])))";
            await using var trigger = Command(connection, "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid WHERE c.relnamespace=@schema::regnamespace AND ((c.relname='native_approvals' AND t.tgname='native_approval_expiry') OR (c.relname='native_approval_batches' AND t.tgname='native_batch_expiry')) AND t.tgenabled IN ('O','A') AND t.tgtype=23 AND t.tgqual IS NULL AND t.tgattr::text='' AND t.tgnargs=0 AND p.pronamespace=c.relnamespace AND p.proname='native_approval_expiry' AND regexp_replace(p.prosrc,'[[:space:]]','','g')=regexp_replace(@body,'[[:space:]]','','g')", ("schema", _schema), ("body", ApprovalExpiryBody));
            if ((long)(await trigger.ExecuteScalarAsync(cancellationToken))! != 2) throw new InvalidOperationException("Missing required native approval expiry guards.");
            await using var parentTrigger = Command(connection, "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='expires_at' WHERE c.relnamespace=@schema::regnamespace AND c.relname='native_sessions' AND t.tgname='native_session_approval_expiry' AND t.tgenabled IN ('O','A') AND t.tgtype=19 AND t.tgqual IS NULL AND t.tgattr::text=a.attnum::text AND t.tgnargs=0 AND p.pronamespace=c.relnamespace AND p.proname='native_session_approval_expiry' AND regexp_replace(p.prosrc,'[[:space:]]','','g')=regexp_replace(@body,'[[:space:]]','','g')", ("schema", _schema), ("body", SessionApprovalExpiryBody));
            if ((long)(await parentTrigger.ExecuteScalarAsync(cancellationToken))! != 1) throw new InvalidOperationException("Missing required native session approval expiry guard.");
        }
        foreach (var (name, definition) in required)
            if (!constraints.TryGetValue(name, out var found) || Compact(found) != Compact(definition)) throw new InvalidOperationException("Missing or incompatible required native safety constraint: " + name);
    }

    private static string States(params string[] states) => StatesFor("state", states);
    private static string StatesFor(string column, params string[] states) => $"CHECK (({column} = ANY (ARRAY[{string.Join(", ", states.Select(state => "'" + state + "'::text"))}])))";
    private static string Compact(string sql) => Regex.Replace(sql.Replace("\"", "", StringComparison.Ordinal), @"\s+", "");
}
