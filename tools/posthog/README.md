# PostHog tooling

Dashboards as code, the telemetry contract, a weekly report, and a live
quality check for hashbrown.dev's PostHog project (id 677870). Git is the
source of truth: every managed dashboard and insight is a JSON file here, and
`sync:apply` makes PostHog match. Edit the JSON, not the PostHog UI.

The event names and properties are documented in
[`docs/growth/taxonomy.md`](../../docs/growth/taxonomy.md).

## Commands

```bash
npx nx test posthog                       # unit tests; never touch PostHog
npx nx lint posthog
npx nx build posthog                      # tsc --noEmit

npx nx sync:plan posthog                  # diff JSON against PostHog; read-only
npx nx sync:apply posthog                 # create/update, write posthog_id back
npx nx sync:apply posthog -- --delete-orphans   # also soft-delete unmanaged remotes
npx nx run posthog:report                     # docs/growth/reports/<date>-weekly.md
npx nx quality:live posthog -- --days 7 --limit-per-event 100 --require-critical-coverage
npx nx settings:plan posthog              # project settings drift; read-only
npx nx settings:apply posthog             # patch drifted project settings
```

## Environment

Nx loads the root `.env` (gitignored) for these targets.

| Variable                   | Purpose                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTHOG_PERSONAL_API_KEY` | Personal API key, at least 20 characters. Write scopes (`dashboard:write`, `insight:write`, `project:write`) for `sync:apply` and `settings:apply`; read scopes suffice for the rest. |
| `POSTHOG_PROJECT_ID`       | Positive integer project id (677870).                                                                                                                                                 |
| `POSTHOG_HOST`             | Optional https API host; defaults to `https://us.i.posthog.com`.                                                                                                                      |

Errors name the variable at fault and never print its value. The client sends
`Authorization: Bearer <key>`, retries 429/502/503/504 three times (500 ms,
1 s, 2 s; a `Retry-After` is honoured up to 2 s), and never retries anything
else.

## Layout

```
tools/posthog/
├── env.ts                  # environment parsing
├── client.ts               # fetch + Bearer auth + retry; get/post/patch
├── schema.ts               # dashboard and insight JSON validation
├── telemetry-contract.ts   # required/allowed/breakdown properties per event
├── sync.ts                 # sync:plan / sync:apply
├── report.ts               # report
├── live-quality.ts         # quality:live
├── settings.ts             # settings:plan / settings:apply
├── dashboards/*.json
├── insights/*.json
└── *.spec.ts
```

Insights (all daily trends over the last 30 days): `pageviews-by-path`,
`engaged-sessions`, `docs-reading-by-framework`, `code-copies-by-framework`,
`cta-clicks-by-id`, `threadplane-handoff-by-surface`, `ai-crawlers` (crawler
visits by `ai_crawler`), `ai-referrals` (referral visits by `ai_source`), and
`pre-analytics-exits-by-trigger`. The two AI traffic insights are separate
because PostHog applies one breakdown to every series of an insight; they sit
on no dashboard.

## JSON

```jsonc
// dashboards/<slug>.json — file name must equal the slug
{
  "slug": "growth-overview",
  "posthog_id": null,          // written back by sync:apply; do not edit
  "name": "Website · Growth overview",
  "description": "…",
  "tags": ["growth", "website"],
  "tiles": [{ "insight": "pageviews-by-path" }]
}

// insights/<slug>.json
{
  "slug": "cta-clicks-by-id",
  "posthog_id": null,
  "kind": "trends",            // or "funnel" with "steps"
  "name": "CTA clicks by id",
  "description": "…",
  "events": [
    { "event": "marketing:cta_click", "name": "CTA clicks", "math": "total",
      "properties": [{ "key": "surface", "operator": "exact", "value": "home" }] }
  ],
  "breakdown": "cta_id",       // one event property
  "breakdown_limit": 20,
  "interval": "day",
  "date_from": "-30d"
}
```

Filter operators are `exact`, `is_not`, `icontains` (need a `value`),
`is_set` and `is_not_set` (no value). Every event, filter key and breakdown
must be allowed by `telemetry-contract.ts`. A breakdown is one property name.

## Sync semantics

- A local file matches the remote with its `posthog_id`; failing that, the
  only remote with its name. Several remotes sharing the name are ambiguous:
  the local file is created and the duplicates are listed as orphans.
- Every remote dashboard or insight with no local file is an orphan. Orphans
  are only listed unless `--delete-orphans` is passed; PostHog refuses hard
  deletes, so deletion is `PATCH { deleted: true }`.
- Apply order: insights, then dashboards, then membership wiring. Wiring only
  changes memberships in managed dashboards and keeps every other one.
- A create writes the new id into that file's `posthog_id` and changes
  nothing else. Commit the written-back ids.
- A tile naming an unknown insight stops the apply before any write.

## Report

Sums additive daily totals over the 28 completed UTC days before today. A
breakdown whose series all use `math: total` is summed per day across its
values (PostHog includes the "Other" and null buckets, so the sum is the exact
total) and gains a "Top values" cell with the three biggest labels this week.
Funnels, unique counts (`dau`, `unique_session`), other non-total math,
breakdowns that hide "Other" (`breakdown_hide_other_aggregation`), and
missing, stale, gapped or partial results render as `Unavailable` with a
reason, never as zero.

## Live quality

`quality:live` samples up to `--limit-per-event` events per contract event
from the last `--days` days and reports:

- errors: a missing required property, a forbidden property, or a property
  name or string value shaped like an email address;
- warnings: a property outside the contract;
- with `--require-critical-coverage`, an error when `$pageview` or
  `marketing:engaged_time` has no events.

It ignores `$*` and `utm_*` properties, click ids, `token`, `uuid` and
`distinct_id`. It exits 1 on any error. It is a bounded sample, not a census;
zero samples do not prove collection works.

## Project settings

`settings:plan` / `settings:apply` keep `autocapture_opt_out: false` and
`anonymize_ips: true` on the project. When the project opts out, posthog-js's `autocapture: true` is
ignored, and PostHog's bounce rate depends on autocapture events.

## Live checks for Task 7

Not verified against PostHog yet; check these on the first live run:

- Soft delete works via `PATCH { deleted: true }` on dashboards and insights.
- `autocapture_opt_out` is set with `PATCH /api/projects/{id}/`; it may need
  `/api/environments/{id}/` instead.
- `/events/` is legacy; fall back to HogQL `/query/` if it is gone.
- POST retries on 502/503/504 can duplicate a create. Accepted, as in
  threadplane.
- `--delete-orphans` soft-deletes every unmanaged dashboard and insight; read
  the plan first.
