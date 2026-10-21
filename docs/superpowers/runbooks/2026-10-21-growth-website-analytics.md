# Growth website analytics runbook

Website analytics measures how people read hashbrown.dev: page views, engaged
time, docs reading, code copies, CTA clicks, Threadplane hand-offs, AI crawler
and referral traffic. It has two halves. PostHog holds engagement, with
dashboards, insights and a telemetry contract kept as code in `tools/posthog`.
The website collector (`www/src/lib/growth/website-collector.ts`) sends a
reduced set of website facts to the growth control plane in Neon. See the
observation intake runbook (`2026-10-21-growth-observation-intake.md`) for the
collection route and the control plane runbook
(`2026-10-21-growth-control-plane.md`) for connection strings. Event and
property names are in `docs/growth/taxonomy.md`; command details are in
`tools/posthog/README.md`.

## What is measured, and what is not

Measured: the closed event set in `docs/growth/taxonomy.md` plus the
posthog-js built-ins (`$pageview`, `$pageleave`, autocapture, web vitals),
sent through the `/_/ingest` proxy. Nothing in PostHog authorizes an email, and
PostHog never receives contact PII, prompts or message content. Installs,
activation, enrichment, email eligibility and delivery outcomes are not in
PostHog; they live in Neon (`npx nx run growth:report`).

## Measurement limits

- Counts are a lower bound. Visitors with an ad or tracker blocker, with
  JavaScript off, or who leave
  before the script loads are missing. The pre-analytics exit beacon covers
  only the earliest exits.
- The capture gate blocks only loopback hosts (`localhost`, `127.0.0.1`,
  `::1`) unless `NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL=true`; the token must also
  be set. Vercel preview deployments with the token set do send events to the
  same PostHog project, so previews are distinguishable only by `$host` or
  pathname.
- `quality:live` is a bounded sample (`--limit-per-event`) per contract event,
  not a census. A passing sample does not prove every page collects; zero samples
  means nothing arrived. A count says nothing about traffic volume. Use `--days 1` for a same-day comparison.
- Historical malformed events keep failing a seven-day audit after a fix
  ships. Do not delete them, and do not read a lifecycle outage into that
  alone.
- The weekly report sums additive daily totals over the 28 completed UTC days
  before today. Funnels, unique counts, hidden "Other" buckets and missing,
  stale, gapped or partial results render as `Unavailable` with a reason, never
  as zero. Inspect those in PostHog.
- AI crawler and referral traffic is classified from the user agent and
  referrer. A crawler that does not identify itself is counted as a person.
- Web analytics and the Neon website collector are independent samples; their
  totals do not reconcile.

## Bounce rate

PostHog decides a bounce with `NOT (page_screen_count >= 2 OR has_autocapture
OR session_duration >= 10s)`. It depends on autocapture events and on
`$pageview` firing for soft navigations, which is why
`www/instrumentation-client.ts` sets `autocapture: true` and
`capture_pageview: 'history_change'`. A single-page read of more than ten
seconds with a click is not a bounce; a long read with no interaction on one
page and under ten seconds of session time is. Treat bounce rate as a rough
signal for docs pages, not a quality score, and compare it only with itself
over time. If the project opts out of autocapture, posthog-js ignores
`autocapture: true` and bounce rate becomes meaningless.

## Running the tools

All of these read `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` and
optionally `POSTHOG_HOST` from the root `.env` (gitignored; `.env.local` and
`.env.*.local` are ignored too).

```
npx nx sync:plan posthog        # read-only diff of JSON against PostHog
npx nx sync:apply posthog       # create/update; commit the written-back posthog_id values
npx nx run posthog:report           # docs/growth/reports/<date>-weekly.md
npx nx quality:live posthog -- --days 7 --limit-per-event 100 --require-critical-coverage
npx nx settings:plan posthog    # read-only project settings drift
npx nx settings:apply posthog
```

`sync:apply -- --delete-orphans` soft-deletes every dashboard and insight with
no local file. Run `sync:plan` and read the orphan list first.

## CI

- `posthog-quality.yml` runs `quality:live` daily at 14:23 UTC and on manual
  dispatch (`days`, `limit_per_event`), with
  `--require-critical-coverage`: `$pageview` or `marketing:engaged_time`
  having no events is an error. It fails with a clear `::error::` when the
  Actions secrets `POSTHOG_PERSONAL_API_KEY_READONLY` or `POSTHOG_PROJECT_ID`
  are missing. The read-only key is mapped to `POSTHOG_PERSONAL_API_KEY` for the
  tool.
- `pr-main.yml` has a `posthog-sync-plan` job. When a same-repo pull request
  changes `tools/posthog/**` it runs `sync:plan` with the read-only key, so
  dashboard drift shows in the log. Without the secrets (forks, or before they
  are set) it skips the plan with a notice. It is not part of the PR Gate.

## Project settings that only the UI or `settings:apply` change

The sync tool manages dashboards and insights only. Project-level settings are
not in git, except what `settings:apply` patches: `autocapture_opt_out: false`
(autocapture must stay on, see "Bounce rate") and `anonymize_ips: true`. Everything else is set in the
PostHog UI and a change there is not caught by CI: session replay and its
sampling, web vitals and performance capture, the authorized URLs and
domains, data retention, internal and
test user filters, and cookieless mode. When a number looks wrong, check those
before the code. Use `settings:plan` to see drift on the managed setting.

## Turning the website collector on

The collector is off until both ends are set. Do it in this order:

1. Add `website` to `GROWTH_COLLECTION_SOURCES` on the www project.
2. Complete the production checklist in "Enabling collection in production"
   in the observation intake runbook (firewall rate rule on
   `/_/growth/collect/*`, processing switch and schedule, redaction
   initialization, post-deploy smoke check).
3. Only then set `NEXT_PUBLIC_GROWTH_COLLECTION=true` on www and redeploy.
   It is inlined at build time, so a redeploy is required. Both it and
   `NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL` are in the bootstrap's www env list and
   default unset; `tools/vercel/bootstrap.mjs` skips unset values.

The collector has its own gate (`isWebsiteCollectionEnabled`).
It requires `NEXT_PUBLIC_GROWTH_COLLECTION === 'true'` and a non-loopback host,
even with `NEXT_PUBLIC_POSTHOG_CAPTURE_LOCAL=true`. It is off when
`window.__HASHBROWN_TELEMETRY_DISABLED__` is set, the
`HASHBROWN_TELEMETRY_DISABLED` localStorage flag is set, or
`navigator.webdriver` is true. Those three gate only the website collector;
PostHog capture ignores them, so automated runs against previews do produce
PostHog events. A local check must therefore use a non-loopback
hostname such as `http://www.localhost:3000`; `isLocalAnalyticsHost` treats only
the exact hostnames `localhost` and `127.0.0.1` and `::1` as loopback.

To turn it off, unset `NEXT_PUBLIC_GROWTH_COLLECTION` and redeploy; removing
`website` from `GROWTH_COLLECTION_SOURCES` makes the route answer 503
`collection_disabled`. The collector retries only a 429, once, after
`Retry-After` (capped at `MAX_RETRY_AFTER_MS`); every other non-2xx response,
503 included, and any exception drops the batch silently with no retry.

## Before the live check

See "Live checks for Task 7" in `tools/posthog/README.md`. The first live run
happened on 2026-10-21.
