# Growth observation intake runbook

Observation intake records what happens around hashbrown (website reads,
installs, runtime sessions) as append-only evidence, projects it into a contact
and subject journey, and reports the activation funnel. It lives in
`@hashbrownai-internal/growth` (`tools/growth`) plus the collection route under
`www/src/app/%5F/growth/collect/v1/`. See the control plane runbook
(`2026-10-21-growth-control-plane.md`) for connection strings and migrations.

## Enabling collection in production

Work through this list in order before (and while) collection is on:

1. Add a Vercel Firewall per-IP rate rule on `/_/growth/collect/*` before
   setting `GROWTH_COLLECTION_SOURCES`. The source budget is global: one client
   at about 20 requests per second exhausts it and denies everyone.
2. Set `GROWTH_OBSERVATION_PROCESSING_ENABLED=true` together with collection
   and run `process` (below) on a schedule until PR 5's cron arrives. Subject
   id churn can write about 24k rows a minute; projection and the budget
   garbage collection keep up only if they run. Every `process` call that
   reaches the library collects old budget rows first, but the CLI prints
   `disabled` and stops before the database while the switch is off.
3. If any contact was deleted under PR 1, run `initialize-redactions` (see
   "After a contact deletion") first, or install events carrying identity
   fail with `redaction_initialization_required` (answered as 503
   `collection_unavailable`; the code shows as the log line's `cause`).
4. Run the post-deploy smoke check (end of this runbook).
5. Never remove a key from `GROWTH_EMAIL_HMAC_PREVIOUS_KEYS` while a
   redaction fence uses its version. Deleted contacts cannot be re-fenced, so
   coverage fails closed.

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

Responses carry `{ error: code }` and never echo payload values. Each
non-2xx answer caused by a thrown error also logs a `cause` (the
`ObservationError` code, else the error's name, at most 80 characters); the
cause is never in the response. Budgets are
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

All days are UTC. The runtime funnel covers the `development_browser`
namespace only.

The runtime funnel reads projected facts, so it shows zeros until `process`
has run; the install funnel reads raw observations.

- **Started**: the subject's first `runtime.session_started`.
- **Activated**: all three runtime milestones within 30 days of started, day 30
  inclusive.
- **Stalled after hello world**: streamed, and the tool call or the component
  day is missing or later than the streamed day plus 7, and today (UTC) is past
  the streamed day plus 7. The window runs from the streamed day, not from
  started. A subject can be both stalled after hello world and activated (a
  late milestone inside the 30-day window).
- **Installed** (install funnel unit): token-bearing (`@hashbrownai/core`)
  installs, that is non-CI, non-redacted `package.installed` observations that
  carry an installation token. A reinstall writes a fresh token, so it can
  leave an orphan core row that never reaches runtime (known noise).
- **Installed by package**: every package's non-CI, non-redacted installs by
  install day, tokenless or not. This section is where vendor and framework
  choice shows (`@hashbrownai/openai` against `@hashbrownai/anthropic`, react
  against angular); it is not a conversion denominator.
- **Stalled before first request**: a token-bearing non-CI install with no
  runtime observation sharing its install token within 3 days, and the 3-day
  window has passed. Any non-redacted runtime observation carrying the token
  counts, not only session starts.

## Redaction

```
npx nx observability growth -- redact --subject <subject-uuid> --operation <uuid>
printf '%s' 'person@example.com' | npx nx observability growth -- redact --email-stdin --operation <uuid>
```

Exactly one of `--subject` or `--email-stdin` is required. The email is read
from stdin only (at most 1,280 bytes, one line) and is never echoed; an
oversize or invalid email prints `invalid_arguments` but exits 1, not 2.
Reusing an operation id returns the recorded count (a confirmation, not a
resume); use a fresh id for a new request. Redaction takes an exclusive lock
that excludes projection (which holds a shared lock); `replay` takes no privacy
lock, so it is not excluded. It deletes identity rows, nulls identity digests,
sets `redacted_at`, and deletes facts. `growth_observations.properties` are
untouched. Collection of events carrying a redacted email, or from a subject
redacted with `redact --subject`, answers 200 with disposition `redacted`.

## Replay

```
npx nx observability growth -- replay --subject <uuid> --operation <uuid> --max-events 1000
npx nx observability growth -- replay --source runtime --from <iso> --to <iso> --operation <uuid> --max-events 1000
```

Pick a subject, or a source with a window of at most one day (not both).
`--max-events` is 1 to 1,000. If more observations match than the cap, replay
throws `selection_overflow`: raise the cap or narrow the window. No operation
row is recorded on overflow, so the same operation id may be reused for the
retry. Replay only resets work rows and deletes
facts. Nothing is re-projected until `process` runs, which needs
`GROWTH_OBSERVATION_PROCESSING_ENABLED=true`.

## After a contact deletion

The contact deletion hook (`redactContactObservationEvidence`) fences the
contact's email lookup HMAC(s) and any `contact.lookup_alias_added` aliases, and
scrubs observations matching the contact's email or those HMACs. Nothing is
fenced by subject. Later events are stored as `redacted` only when they carry a
fenced email HMAC. Contacts deleted before the hook existed are covered by:

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
