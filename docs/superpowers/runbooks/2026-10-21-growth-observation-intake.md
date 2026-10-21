# Growth observation intake runbook

Observation intake records what happens around hashbrown (website reads,
installs, runtime sessions) as append-only evidence, projects it into a contact
and subject journey, and reports the activation funnel. It lives in
`@hashbrownai-internal/growth` (`tools/growth`) plus the collection route under
`www/src/app/%5F/growth/collect/v1/`. See the control plane runbook
(`2026-10-21-growth-control-plane.md`) for connection strings and migrations.

## Collection route

`POST /_/growth/collect/v1/{website|install|runtime}` with
`content-type: application/json`. A source is served only when it is listed in
`GROWTH_COLLECTION_SOURCES` (comma list of `website,install,runtime`); an
unlisted source answers 503 `collection_disabled`.

| Status | Code                                              | Meaning                                                                     |
| ------ | ------------------------------------------------- | --------------------------------------------------------------------------- |
| 200    | (result body)                                     | Committed. Per-event disposition is `accepted`, `duplicate` or `redacted`.  |
| 204    |                                                   | `OPTIONS` preflight.                                                        |
| 400    | `invalid_payload`, `unsupported_version`          | Malformed JSON or batch, or an unsupported event version.                   |
| 404    | `unknown_source`                                  | The path segment is not a collection source.                                |
| 405    | `method_not_allowed`                              | Not `POST` or `OPTIONS`.                                                    |
| 409    | `event_conflict`                                  | Same event id with different content.                                       |
| 413    | `body_limit`                                      | Body too large.                                                             |
| 415    | `content_type`                                    | Not `application/json`.                                                     |
| 429    | `rate_limited`                                    | Source or subject budget exhausted; honour `Retry-After`.                   |
| 503    | `collection_disabled`, `collection_configuration` | Source not enabled, or `GROWTH_COLLECTION_SOURCES` names an unknown source. |
| 503    | `collection_unavailable`                          | Storage or catalog failure; retry after `Retry-After`.                      |

Responses carry `{ error: code }` and never echo payload values. Budgets are
1,200 requests per minute per source and 120 events per minute per subject.
The runtime source also returns `announcements` (empty when selection fails;
it never fails a committed batch).

## Run projection by hand

Projection turns accepted evidence into journey state. Until the lifecycle cron
arrives in PR 5, run it yourself:

```
GROWTH_OBSERVATION_PROCESSING_ENABLED=true npx nx observability growth -- process --limit 100
```

Without the switch set to exactly `true`, `process` prints
`{"command":"process","disabled":true}` and exits 0 without touching the
database. `--limit` is 1 to 100. Every command prints one JSON line
`{ command, result }` on stdout; failures print only an error code
(`invalid_arguments` exits 2, any other failure exits 1) on stderr.

## Reports (read-only)

```
npx nx report growth -- funnel --from 2026-10-01 --to 2026-10-08
npx nx report growth -- journey --contact <contact-uuid>
npx nx report growth -- health --from <iso> --to <iso>
npx nx report growth -- timeline --subject <subject-uuid> [--limit 100] [--cursor <cursor>]
npx nx report growth -- detail --observation <uuid> --include-identity
```

`funnel` and `health` take a range of at most 31 days. `detail` returns the
identity attached to one observation, so it refuses to run without
`--include-identity`: passing it is your acknowledgement that the output holds
personal data and must not be pasted into tickets or logs.

### Funnel definitions

All days are UTC.

- **Started**: the contact's first `runtime.session_started`.
- **Activated**: all three runtime milestones within 30 days of started, day 30
  inclusive.
- **Stalled after hello world**: streamed, but no tool call or component within
  7 days of started, and the 7-day window has passed.
- **Stalled before first request**: a non-CI install with no runtime session
  sharing its install token within 3 days, and the 3-day window has passed.

## Redaction

```
npx nx observability growth -- redact --subject <subject-uuid> --operation <uuid>
printf '%s' 'person@example.com' | npx nx observability growth -- redact --email-stdin --operation <uuid>
```

Exactly one of `--subject` or `--email-stdin` is required. The email is read
from stdin only (at most 1,280 bytes, one line) and is never echoed. The
operation id makes the run idempotent: reuse the same id to resume or confirm,
and use a fresh one for a new request. Redaction takes an exclusive lock so no
projection or replay interleaves with it, removes identity and payload
evidence, and re-projects the subject with `milestone_kind` null so no milestone
survives that could identify the person. Collection of already-redacted events
answers 200 with disposition `redacted`.

## Replay

```
npx nx observability growth -- replay --subject <uuid> --operation <uuid> --max-events 1000
npx nx observability growth -- replay --source runtime --from <iso> --to <iso> --operation <uuid> --max-events 1000
```

Replay re-projects stored evidence after a projection fix. Pick a subject, or a
source with a window of at most one day (not both). `--max-events` is 1 to 1,000
and bounds the work; rerun with a new operation id for more.

## After a contact deletion

The contact deletion hook records a redaction for the deleted contact's
subjects, so evidence collected before the deletion is redacted and later
events for those subjects are stored as `redacted`. Contacts deleted before the
hook existed are covered by:

```
npx nx observability growth -- initialize-redactions --limit 100 [--cursor <uuid>]
```

Repeat with the cursor it returns until it reports nothing left.

## Post-deploy smoke check

POST one `website.content_viewed` event for `docs/react/concept/components`
with topic `concepts` to the website source and expect 200. The catalog reads
markdown shipped by output file tracing: a 503 `collection_unavailable` on that
event means tracing broke.

## Not in this PR

Collectors that send these events (PR 3), PostHog forwarding (PR 4), the
lifecycle cron that calls `process` (PR 5), and forms plus the install digest
(PR 6).
