using System.Text;
using System.Text.Json;
using Npgsql;

namespace Hashbrown.AspNetCore;

public sealed partial class PostgresNativeSessionJournal
{
  /// <inheritdoc />
  public async ValueTask<int> MaintainAsync(CancellationToken cancellationToken = default)
  {
    await using var connection = await _source.OpenConnectionAsync(cancellationToken);
    await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
    await RequireSchemaVersion(connection, cancellationToken);
    var rows = new List<(string Id, string Agent, string Scope, string Selector, Row Row)>();
    // One combined budget. Parent locks precede the authoritative database clock below.
    await using (var command = Command(connection, $"""
        SELECT id,agent,scope,selector,key_data,compatibility,state,token,generation,revision,claim_revision,lease_until,expires_at,payload,ever_saved,admitted_request
        FROM {Sessions} s
        WHERE (expires_at<=clock_timestamp() AND
            (payload IS NOT NULL OR EXISTS(SELECT 1 FROM {Approvals} a WHERE a.session_id=s.id AND a.private_descriptor IS NOT NULL)
             OR EXISTS(SELECT 1 FROM {Calls} c WHERE c.session_id=s.id AND c.descriptor IS NOT NULL)))
          OR (compatibility=@compatibility AND state IN ('Owned','Saved','Publishing') AND lease_until<=clock_timestamp())
        ORDER BY LEAST(expires_at,CASE WHEN compatibility=@compatibility AND state IN ('Owned','Saved','Publishing') THEN lease_until ELSE expires_at END),id
        LIMIT {_options.MaintenanceBatch} FOR UPDATE OF s SKIP LOCKED
        """, ("compatibility", _compatibility)))
    await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
      while (await reader.ReadAsync(cancellationToken))
        rows.Add((reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
          new(reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.IsDBNull(7) ? null : reader.GetString(7), reader.GetInt64(8), reader.GetInt64(9), reader.GetInt64(10), reader.IsDBNull(11) ? null : reader.GetFieldValue<DateTimeOffset>(11), reader.GetFieldValue<DateTimeOffset>(12), reader.IsDBNull(13) ? null : reader.GetString(13), reader.GetBoolean(14), reader.IsDBNull(15) ? null : reader.GetString(15))));
    var now = await Now(connection, cancellationToken);
    var changed = 0;
    foreach (var (id, agent, scope, selector, row) in rows)
    {
      // Privacy is schema-wide and dominates retained-lease recovery, including incompatible registrations.
      if (row.Expires <= now)
      {
        var purged = await Execute(connection, $"""
                UPDATE {Sessions} AS session SET state=CASE
                    WHEN state IN ('Publishing','PublicationUnknown') THEN 'PublicationUnknown'
                    WHEN state='Blocked' OR (state='Owned' AND (EXISTS(SELECT 1 FROM {Calls} WHERE session_id=@id AND dispatch_generation=session.generation) OR EXISTS(SELECT 1 FROM {Approvals} WHERE session_id=@id AND admitted_generation=session.generation) OR EXISTS(SELECT 1 FROM {ApprovalBatches} WHERE session_id=@id AND admitted_generation=session.generation) OR EXISTS(SELECT 1 FROM {ApprovalBatches} b JOIN {Approvals} a USING(session_id,batch_id) WHERE b.session_id=@id AND b.published_revision IS NULL AND b.state='Pending' AND a.captured_generation=session.generation))) THEN 'Blocked'
                    ELSE 'Retired' END,
                    payload=NULL,admitted_request=NULL,token=NULL,lease_until=NULL,generation=generation+1,revision=revision+1
                    WHERE id=@id AND expires_at<=@now AND
                      (payload IS NOT NULL OR EXISTS(SELECT 1 FROM {Approvals} a WHERE a.session_id=@id AND a.private_descriptor IS NOT NULL)
                       OR EXISTS(SELECT 1 FROM {Calls} c WHERE c.session_id=@id AND c.descriptor IS NOT NULL));
                """, cancellationToken, ("id", id), ("now", now));
        if (purged == 0) continue;
        await Execute(connection, $"""
                UPDATE {Calls} SET descriptor=NULL WHERE session_id=@id;
                UPDATE {Approvals} SET private_descriptor=NULL,state='Retired' WHERE session_id=@id;
                UPDATE {ApprovalBatches} SET state='Retired' WHERE session_id=@id;
                """, cancellationToken, ("id", id));
        changed++;
        continue;
      }
      if (row.Compatibility != _compatibility || row.State is not ("Owned" or "Saved" or "Publishing") || row.LeaseUntil is null || row.LeaseUntil > now) continue;
      var nextState = row.State == "Publishing" ? "PublicationUnknown" : "Blocked";
      if (row.State == "Owned")
      {
        NativeSessionKey? key = null;
        try { key = ReadMaintenanceKey(id, agent, scope, selector, row.KeyData); }
        catch (Exception exception) when (BadInput(exception)) { /* Fence only this locked stored id. */ }
        if (key is not null && !await HasDispatch(connection, key, row.Generation, cancellationToken))
        {
          NativeSessionSnapshot? prior = null;
          var validPayload = false;
          // Only pure decoding classifies operation/format errors as corrupt row data.
          try
          {
            var snapshot = ValidatePayload(row.Payload, key, true);
            if (row.EverSaved && snapshot.NativeJson is null) throw new ArgumentException("Previously saved native state is missing.");
            if (row.AdmittedRequest is not null)
            {
              if (Encoding.UTF8.GetByteCount(row.AdmittedRequest) > _options.PublicBytes) throw new ArgumentException("Stored admitted request exceeds its public bound.");
              NativeSessionRawRequest.Validate(row.AdmittedRequest);
              if (row.AdmittedRequest != NativeSessionHistory.Normalize(row.AdmittedRequest, key, _catalog, _options)) throw new ArgumentException("Stored admitted request is not canonical.");
            }
            validPayload = true;
          }
          catch (Exception exception) when (BadInput(exception)) { /* Pure retained bytes cannot be restored. */ }
          try
          {
            if (!validPayload) throw new ArgumentException("Invalid retained native payload.");
            var original = await ReadValidatedApprovalSnapshot(connection, row, key, now, cancellationToken);
            if (row.EverSaved && original.Snapshot.NativeJson is null) throw new ArgumentException("Previously saved native state is missing.");
            if (original.Publication is { } publication && (publication.State != NativeApprovalState.Pending || publication.Decisions.Count != 0 || publication.AdmittedGeneration is not null || publication.AdmittedRevision is not null)) throw new ArgumentException("Consumed pending recovery is unavailable.");
            await ValidateMaintenanceEpochs(connection, key, row, cancellationToken);
            // Check the post-clear Ready invariants against ORIGINAL epochs before removing any captures.
            await ReadValidatedApprovalSnapshot(connection, row with { State = "Ready", AdmittedRequest = null }, key, now, cancellationToken);
            prior = original.Snapshot;
          }
          catch (Exception exception) when (exception is ArgumentException or JsonException or KeyNotFoundException) { /* Explicit durable-data validation failures remain Blocked; infrastructure errors propagate. */ }
          if (prior is not null)
          {
            await RemoveUncommittedCalls(connection, key, prior, cancellationToken);
            nextState = "Ready";
          }
        }
      }
      changed += await Execute(connection, $"UPDATE {Sessions} SET state=@state,token=NULL,lease_until=NULL,admitted_request=NULL,generation=generation+1,revision=revision+1 WHERE id=@id AND compatibility=@compatibility AND state=@prior AND lease_until<=@now AND expires_at>@now", cancellationToken,
        ("state", nextState), ("id", id), ("compatibility", _compatibility), ("prior", row.State), ("now", now));
    }
    await transaction.CommitAsync(cancellationToken);
    return changed;
  }

  // Validate constructor inputs explicitly: malformed partitions must not escape as null-reference failures.
  private static NativeSessionKey ReadMaintenanceKey(string id, string agent, string scope, string selector, string data)
  {
    if (Encoding.UTF8.GetByteCount(data) > 1024 * 1024) throw new ArgumentException("Persisted native key exceeds its bound.");
    using var document = JsonDocument.Parse(data);
    var root = document.RootElement;
    if (root.ValueKind != JsonValueKind.Object || !root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).SequenceEqual(new[] { "agent", "id", "partitions", "scope", "selector" })) throw new ArgumentException("Invalid persisted native key shape.");
    var partitions = root.GetProperty("partitions");
    if (partitions.ValueKind != JsonValueKind.Object || partitions.EnumerateObject().Count() is < 1 or > 32) throw new ArgumentException("Invalid persisted native partitions.");
    var values = new Dictionary<string, string>(StringComparer.Ordinal);
    foreach (var partition in partitions.EnumerateObject()) values.Add(partition.Name, partition.Value.GetString() ?? throw new ArgumentException("Missing native partition."));
    var key = new NativeSessionKey(root.GetProperty("agent").GetString()!, root.GetProperty("scope").GetString()!, root.GetProperty("selector").GetString()!, values);
    if (key.Id != id || key.Agent != agent || key.Scope != scope || key.Selector != selector || KeyData(key) != data) throw new ArgumentException("Persisted native key does not match its locked selector.");
    return key;
  }

  // Future/foreign epochs must not become apparently valid when maintenance advances authority.
  private async ValueTask ValidateMaintenanceEpochs(NpgsqlConnection connection, NativeSessionKey key, Row row, CancellationToken cancellationToken)
  {
    await using var command = Command(connection, $"""
        SELECT EXISTS(SELECT 1 FROM {Calls} WHERE session_id=@id AND
          (captured_generation>@generation OR dispatch_generation>@generation OR dispatch_generation<captured_generation OR state='Started'))
        OR EXISTS(SELECT 1 FROM {Approvals} WHERE session_id=@id AND
          (captured_generation>@generation OR admitted_generation>@generation OR admitted_generation<captured_generation OR admitted_revision>@revision))
        OR EXISTS(SELECT 1 FROM {ApprovalBatches} WHERE session_id=@id AND
          (admitted_generation>@generation OR admitted_revision>@revision OR published_revision>@revision))
        """, ("id", key.Id), ("generation", row.Generation), ("revision", row.Revision));
    if ((bool)(await command.ExecuteScalarAsync(cancellationToken))!) throw new ArgumentException("Invalid retained native epochs.");
  }

  private async ValueTask RetireRow(NpgsqlConnection connection, Row row, NativeSessionKey key, string state, CancellationToken cancellationToken)
  {
    await Execute(connection, $"UPDATE {Sessions} SET state=@state,payload=NULL,admitted_request=NULL,token=NULL,lease_until=NULL,generation=generation+1,revision=revision+1 WHERE id=@id; UPDATE {Calls} SET descriptor=NULL WHERE session_id=@id; UPDATE {Approvals} SET private_descriptor=NULL,state='Retired' WHERE session_id=@id; UPDATE {ApprovalBatches} SET state='Retired' WHERE session_id=@id", cancellationToken, ("state", state), ("id", key.Id));
  }
}
